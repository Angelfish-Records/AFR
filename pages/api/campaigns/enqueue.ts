// pages/api/campaigns/enqueue.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sql } from "@vercel/postgres";
import { requireInternalBasicAuth } from "../_internalAuth";
import {
  airtableCreateSingle,
  airtableListAll,
  escapeAirtableString,
  mustEnv,
  normalizeFilterValue,
} from "@/lib/campaigns/airtable";
import {
  CAMPAIGN_SENDERS,
  extractEmailFromAddress,
  isValidEmailLoose,
  normalizeEmail,
  parseCampaignSenderKey,
  type CampaignSenderKey,
} from "@/lib/campaigns/senders";
import { asString, normalizePersonalUrl, toStringList } from "@/lib/campaigns/templates";

function jsonError(
  res: NextApiResponse,
  status: number,
  msg: string,
  extra?: unknown,
) {
  return res.status(status).json({ error: msg, ...(extra ? { extra } : {}) });
}

function buildContactsFilter(args: {
  outletType?: string;
  outletRegion?: string;
  approach?: string;
  priority?: string;
}): string {
  const parts: string[] = ["{Is mailable}"];

  const t = (args.outletType ?? "").trim();
  if (t) {
    parts.push(`FIND("${escapeAirtableString(t)}", ARRAYJOIN({Outlet Type}))`);
  }

  const r = (args.outletRegion ?? "").trim();
  if (r) {
    parts.push(`FIND("${escapeAirtableString(r)}", ARRAYJOIN({Outlet Region}))`);
  }

  const a = (args.approach ?? "").trim();
  if (a) parts.push(`{Approach}="${escapeAirtableString(a)}"`);

  const p = (args.priority ?? "").trim();
  if (p) parts.push(`{Priority}="${escapeAirtableString(p)}"`);

  return parts.length === 1 ? parts[0] : `AND(${parts.join(",")})`;
}

function normalizeAudienceKey(k: string | undefined): string {
  return (k ?? "press_mailable_v1").trim();
}

function audienceSummary(args: {
  outletType: string;
  outletRegion: string;
  approach: string;
  priority: string;
}): string {
  const parts = [
    args.outletType ? `Outlet Type: ${args.outletType}` : "",
    args.outletRegion ? `Outlet Region: ${args.outletRegion}` : "",
    args.approach ? `Approach: ${args.approach}` : "",
    args.priority ? `Priority: ${args.priority}` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" • ") : "All mailable contacts";
}

type PressContactFields = {
  Email?: string;
  Outlet?: string[];
  "Outlet Type"?: string[];
  "Outlet Region"?: string[];
  Name?: string;
  "First Name"?: string;
  Surname?: string;
  Identifier?: string;
  "Personal URL"?: string;
  "One-line hook"?: string;
  "Custom paragraph"?: string;
  Approach?: string;
  Priority?: string;
};

type OutletFields = {
  Outlet?: string;
};

type ContactRecipient = {
  contactId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  outlet: string;
  identifier: string;
  personalUrl: string;
  oneLineHook: string;
  customParagraph: string;
};

type DispatchRow = {
  id: string;
};

type InsertRecipientRow = {
  id: string;
};

async function buildOutletNameMap(args: {
  airtableToken: string;
  baseId: string;
  outletsTable: string | undefined;
  contacts: Array<{ fields: PressContactFields }>;
}): Promise<Record<string, string>> {
  const { airtableToken, baseId, outletsTable, contacts } = args;
  if (!outletsTable) return {};

  const outletIds = Array.from(
    new Set(
      contacts.flatMap((c) =>
        Array.isArray(c.fields.Outlet) ? c.fields.Outlet : [],
      ),
    ),
  ).slice(0, 100);

  if (!outletIds.length) return {};

  const or = outletIds
    .map((id) => `RECORD_ID()="${escapeAirtableString(id)}"`)
    .join(",");

  const outletRecs = await airtableListAll<OutletFields>({
    token: airtableToken,
    baseId,
    table: outletsTable,
    filterByFormula: `OR(${or})`,
    fields: ["Outlet"],
    maxRecords: outletIds.length,
  });

  return Object.fromEntries(
    outletRecs.map((r) => [r.id, (r.fields.Outlet ?? "").toString()]),
  );
}

function mapContactToRecipient(
  contact: { id: string; fields: PressContactFields },
  outletNameById: Record<string, string>,
): ContactRecipient | null {
  const email = normalizeEmail((contact.fields.Email ?? "").toString());
  if (!isValidEmailLoose(email)) return null;

  const outletIds = Array.isArray(contact.fields.Outlet)
    ? contact.fields.Outlet
    : [];
  const firstOutletId = outletIds[0];

  const firstName = asString(contact.fields["First Name"]);
  const lastName = asString(contact.fields.Surname);
  const fullName =
    asString(contact.fields.Name) ||
    [firstName, lastName].filter(Boolean).join(" ").trim();

  const personalUrl = normalizePersonalUrl(contact.fields["Personal URL"]) ?? "";

  return {
    contactId: contact.id,
    email,
    firstName,
    lastName,
    fullName,
    outlet: firstOutletId ? outletNameById[firstOutletId] ?? "" : "",
    identifier: asString(contact.fields.Identifier),
    personalUrl,
    oneLineHook: asString(contact.fields["One-line hook"]),
    customParagraph: asString(contact.fields["Custom paragraph"]),
  };
}

function templateVarsForRecipient(recipient: ContactRecipient): Record<string, string> {
  return {
    first_name: recipient.firstName,
    last_name: recipient.lastName,
    full_name: recipient.fullName,
    email: recipient.email,
    outlet: recipient.outlet,
    identifier: recipient.identifier,
    personal_url: recipient.personalUrl,
    one_line_hook: recipient.oneLineHook,
    custom_paragraph: recipient.customParagraph,
  };
}

async function refreshDispatchCounts(dispatchId: string): Promise<{
  queuedCount: number;
  sentCount: number;
  failedCount: number;
}> {
  const result = await sql<{
    queued_count: number;
    sent_count: number;
    failed_count: number;
  }>`
    with counts as (
      select
        count(*) filter (where status in ('queued', 'sending'))::int as queued_count,
        count(*) filter (where status = 'sent')::int as sent_count,
        count(*) filter (where status in ('failed', 'bounced', 'complained'))::int as failed_count
      from campaign_dispatch_recipients
      where dispatch_id = ${dispatchId}::uuid
    )
    update campaign_dispatches d
    set
      queued_count = counts.queued_count,
      sent_count = counts.sent_count,
      failed_count = counts.failed_count,
      updated_at = now()
    from counts
    where d.id = ${dispatchId}::uuid
    returning counts.queued_count, counts.sent_count, counts.failed_count
  `;

  const row = result.rows[0];
  return {
    queuedCount: row?.queued_count ?? 0,
    sentCount: row?.sent_count ?? 0,
    failedCount: row?.failed_count ?? 0,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (!requireInternalBasicAuth(req, res)) return;

    const airtableToken = mustEnv(process.env.AIRTABLE_TOKEN, "AIRTABLE_TOKEN");
    const baseId = mustEnv(process.env.AIRTABLE_BASE_ID, "AIRTABLE_BASE_ID");

    const contactsTable = mustEnv(
      process.env.AIRTABLE_PRESS_CONTACTS_TABLE,
      "AIRTABLE_PRESS_CONTACTS_TABLE",
    );
    const campaignsTable = mustEnv(
      process.env.AIRTABLE_CAMPAIGNS_TABLE,
      "AIRTABLE_CAMPAIGNS_TABLE",
    );
    const outletsTable = process.env.AIRTABLE_OUTLETS_TABLE;

    const audienceKey = normalizeAudienceKey(
      (req.method === "GET"
        ? (req.query.audienceKey as string | undefined)
        : undefined) ??
        (typeof (req.body as { audienceKey?: unknown } | undefined)
          ?.audienceKey === "string"
          ? (req.body as { audienceKey: string }).audienceKey
          : undefined),
    );

    if (audienceKey !== "press_mailable_v1") {
      return jsonError(res, 400, "Unknown audienceKey");
    }

    const outletTypeQ =
      req.method === "GET" ? normalizeFilterValue(req.query.outletType) : "";
    const outletRegionQ =
      req.method === "GET" ? normalizeFilterValue(req.query.outletRegion) : "";
    const approachQ =
      req.method === "GET" ? normalizeFilterValue(req.query.approach) : "";
    const priorityQ =
      req.method === "GET" ? normalizeFilterValue(req.query.priority) : "";

    if (req.method === "GET") {
      const contactsFilter = buildContactsFilter({
        outletType: outletTypeQ,
        outletRegion: outletRegionQ,
        approach: approachQ,
        priority: priorityQ,
      });

      const sampleContacts = await airtableListAll<PressContactFields>({
        token: airtableToken,
        baseId,
        table: contactsTable,
        filterByFormula: contactsFilter,
        fields: [
          "Name",
          "First Name",
          "Surname",
          "Email",
          "Outlet",
          "Outlet Type",
          "Outlet Region",
          "Approach",
          "Priority",
          "Identifier",
          "Personal URL",
          "One-line hook",
          "Custom paragraph",
        ],
        maxRecords: 12,
      });

      const outletNameById = await buildOutletNameMap({
        airtableToken,
        baseId,
        outletsTable,
        contacts: sampleContacts,
      });

      const all = await airtableListAll<Record<string, never>>({
        token: airtableToken,
        baseId,
        table: contactsTable,
        filterByFormula: contactsFilter,
        fields: [],
      });

      const allForFacet = await airtableListAll<
        Pick<
          PressContactFields,
          "Outlet Type" | "Outlet Region" | "Approach" | "Priority"
        >
      >({
        token: airtableToken,
        baseId,
        table: contactsTable,
        filterByFormula: "{Is mailable}",
        fields: ["Outlet Type", "Outlet Region", "Approach", "Priority"],
      });

      const typeSet = new Set<string>();
      const regionSet = new Set<string>();
      const approachSet = new Set<string>();
      const prioritySet = new Set<string>();

      for (const rec of allForFacet) {
        for (const t of toStringList(rec.fields["Outlet Type"])) typeSet.add(t);
        for (const r of toStringList(rec.fields["Outlet Region"])) {
          regionSet.add(r);
        }

        const a = rec.fields.Approach;
        if (typeof a === "string" && a.trim()) approachSet.add(a.trim());

        const p = rec.fields.Priority;
        if (typeof p === "string" && p.trim()) prioritySet.add(p.trim());
      }

      const sample = sampleContacts
        .map((c) => mapContactToRecipient(c, outletNameById))
        .filter((c): c is ContactRecipient => Boolean(c))
        .slice(0, 10)
        .map((c) => ({
          id: c.contactId,
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          fullName: c.fullName,
          outlet: c.outlet,
          identifier: c.identifier,
          personalUrl: c.personalUrl,
          oneLineHook: c.oneLineHook,
          customParagraph: c.customParagraph,
        }));

      return res.status(200).json({
        ok: true,
        audienceKey,
        mailableCount: all.length,
        sampleContacts: sample,
        availableOutletTypes: Array.from(typeSet).sort((a, b) =>
          a.localeCompare(b),
        ),
        availableOutletRegions: Array.from(regionSet).sort((a, b) =>
          a.localeCompare(b),
        ),
        availableApproaches: Array.from(approachSet).sort((a, b) =>
          a.localeCompare(b),
        ),
        availablePriorities: Array.from(prioritySet).sort((a, b) =>
          a.localeCompare(b),
        ),
        appliedFilters: {
          outletType: outletTypeQ || null,
          outletRegion: outletRegionQ || null,
          approach: approachQ || null,
          priority: priorityQ || null,
        },
      });
    }

    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const body = (req.body ?? {}) as Record<string, unknown>;

    const campaignName =
      typeof body.campaignName === "string" ? body.campaignName : undefined;
    const senderKey: CampaignSenderKey =
      parseCampaignSenderKey(body.senderKey) ?? "angus";

    const subjectTemplate =
      typeof body.subjectTemplate === "string"
        ? body.subjectTemplate
        : undefined;
    const bodyTemplate =
      typeof body.bodyTemplate === "string" ? body.bodyTemplate : undefined;
    const existingCampaignId =
      typeof body.campaignId === "string" ? body.campaignId.trim() : "";

    const outletType = normalizeFilterValue(body.outletType);
    const outletRegion = normalizeFilterValue(body.outletRegion);
    const approach = normalizeFilterValue(body.approach);
    const priority = normalizeFilterValue(body.priority);

    if (!subjectTemplate || !bodyTemplate) {
      return jsonError(
        res,
        400,
        "Missing required fields: subjectTemplate, bodyTemplate",
      );
    }

    const sender = CAMPAIGN_SENDERS[senderKey];
    const fromAddress = sender.fromAddress;
    const replyTo = sender.replyTo;

    const fromEmail = extractEmailFromAddress(fromAddress);
    if (!fromEmail) {
      return jsonError(res, 400, "Configured sender fromAddress is invalid");
    }
    if (!isValidEmailLoose(replyTo)) {
      return jsonError(res, 400, "Configured sender replyTo is invalid");
    }

    const contactsFilter = buildContactsFilter({
      outletType,
      outletRegion,
      approach,
      priority,
    });
    const summary = audienceSummary({
      outletType,
      outletRegion,
      approach,
      priority,
    });

    const campaignId =
      existingCampaignId ||
      (await airtableCreateSingle({
        token: airtableToken,
        baseId,
        table: campaignsTable,
        fields: {
          "Campaign/Pitch":
            campaignName && campaignName.trim()
              ? campaignName.trim()
              : subjectTemplate.trim().slice(0, 120),
          "Email subject template": subjectTemplate,
          "Email body template": bodyTemplate,
          Status: "Ready",
          "Audience key": audienceKey,
        },
      }));

    const contacts = await airtableListAll<PressContactFields>({
      token: airtableToken,
      baseId,
      table: contactsTable,
      filterByFormula: contactsFilter,
      fields: [
        "Name",
        "First Name",
        "Surname",
        "Email",
        "Outlet",
        "Identifier",
        "Personal URL",
        "One-line hook",
        "Custom paragraph",
      ],
    });

    const outletNameById = await buildOutletNameMap({
      airtableToken,
      baseId,
      outletsTable,
      contacts,
    });

    const recipients = contacts
      .map((c) => mapContactToRecipient(c, outletNameById))
      .filter((c): c is ContactRecipient => Boolean(c));

    const campaignPitch =
      campaignName && campaignName.trim()
        ? campaignName.trim()
        : subjectTemplate.trim().slice(0, 120);

    const filtersJson = JSON.stringify({
      outletType: outletType || null,
      outletRegion: outletRegion || null,
      approach: approach || null,
      priority: priority || null,
    });

    const dispatchResult = await sql<DispatchRow>`
      insert into campaign_dispatches (
        airtable_campaign_id,
        campaign_pitch,
        audience_key,
        audience_summary,
        filters,
        sender_key,
        from_address,
        reply_to,
        status
      )
      values (
        ${campaignId},
        ${campaignPitch},
        ${audienceKey},
        ${summary},
        ${filtersJson}::jsonb,
        ${senderKey},
        ${fromAddress},
        ${replyTo},
        'ready'
      )
      on conflict (airtable_campaign_id) do update set
        campaign_pitch = excluded.campaign_pitch,
        audience_key = excluded.audience_key,
        audience_summary = excluded.audience_summary,
        filters = excluded.filters,
        sender_key = excluded.sender_key,
        from_address = excluded.from_address,
        reply_to = excluded.reply_to,
        status = case
          when campaign_dispatches.status = 'complete' then campaign_dispatches.status
          else 'ready'
        end,
        updated_at = now()
      returning id
    `;

    const dispatchId = dispatchResult.rows[0]?.id;
    if (!dispatchId) throw new Error("Failed to create campaign dispatch");

    let inserted = 0;

    for (const recipient of recipients) {
      const vars = templateVarsForRecipient(recipient);
      const personalSnapshot = [
        recipient.oneLineHook,
        recipient.customParagraph,
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim();

      const insert = await sql<InsertRecipientRow>`
        insert into campaign_dispatch_recipients (
          dispatch_id,
          airtable_contact_id,
          recipient_email,
          from_address,
          reply_to,
          template_vars,
          personalised_snapshot,
          status
        )
        values (
          ${dispatchId}::uuid,
          ${recipient.contactId},
          ${recipient.email},
          ${fromAddress},
          ${replyTo},
          ${JSON.stringify(vars)}::jsonb,
          ${personalSnapshot},
          'queued'
        )
        on conflict (dispatch_id, recipient_email) do nothing
        returning id
      `;

      if (insert.rows[0]?.id) inserted++;
    }

    const counts = await refreshDispatchCounts(dispatchId);

    return res.status(200).json({
      ok: true,
      audienceKey,
      campaignId,
      dispatchId,
      enqueued: inserted,
      dedupedExisting: recipients.length - inserted,
      remainingQueued: counts.queuedCount,
    });
  } catch (err) {
    console.error("[campaigns/enqueue] failed", err);
    return res.status(500).json({
      error: "Enqueue failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
