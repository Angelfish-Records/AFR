// pages/api/campaigns/drain.ts
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { sql } from "@vercel/postgres";
import { Resend } from "resend";
import { render as renderEmail } from "@react-email/render";
import PressPitchEmail from "../../../emails/PressPitchEmail";
import * as React from "react";
import { requireInternalBasicAuth } from "../_internalAuth";
import {
  airtableListAll,
  airtablePatchRecords,
  escapeAirtableString,
  mustEnv,
} from "@/lib/campaigns/airtable";
import {
  isValidEmailLoose,
  normalizeEmail,
} from "@/lib/campaigns/senders";
import {
  asString,
  jsonRecordValue,
  mergeTemplate,
  stringifyError,
  templateUsesPersonalUrl,
} from "@/lib/campaigns/templates";
import { mintUnsubscribeToken } from "@/lib/campaigns/unsubscribeTokens";

type CampaignFields = {
  "Email subject template"?: string;
  "Email body template"?: string;
  "Default CTA"?: string;
  "Key links"?: string;
  "Assets pack link"?: string;
  "Campaign/Pitch"?: string;
  Status?: string;
  "Sent at"?: string;
};

type DispatchRow = {
  id: string;
  airtable_campaign_id: string;
  campaign_pitch: string;
  audience_key: string;
  from_address: string;
  reply_to: string;
  status: string;
  sent_count: number;
  failed_count: number;
};

type RecipientRow = {
  id: string;
  airtable_contact_id: string;
  recipient_email: string;
  from_address: string;
  reply_to: string;
  template_vars: unknown;
  personalised_snapshot: string;
};

type CountRow = {
  queued_count: number;
  sent_count: number;
  failed_count: number;
};

type ResendIdRow = {
  id: string;
};

type Payload = {
  recipientId: string;
  contactId: string;
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl?: string;
};

function jsonError(
  res: NextApiResponse,
  status: number,
  msg: string,
  extra?: unknown,
) {
  return res.status(status).json({ error: msg, ...(extra ? { extra } : {}) });
}

function isoNow(): string {
  return new Date().toISOString();
}

function publicSiteUrl(): string {
  const raw = mustEnv(process.env.PUBLIC_SITE_URL, "PUBLIC_SITE_URL").trim();
  return raw.replace(/\/+$/, "");
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function computeNextPollMs(args: {
  sent: number;
  remainingQueued: number;
  batchLimit: number;
}): number {
  const { sent, remainingQueued, batchLimit } = args;
  if (remainingQueued <= 0) return 0;
  if (sent >= batchLimit) return 900;
  return 1400;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshDispatchCounts(dispatchId: string): Promise<CountRow> {
  const result = await sql<CountRow>`
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

  return (
    result.rows[0] ?? {
      queued_count: 0,
      sent_count: 0,
      failed_count: 0,
    }
  );
}

async function markDispatchCompleteIfDone(args: {
  airtableToken: string;
  baseId: string;
  campaignsTable: string;
  dispatchId: string;
  campaignId: string;
  sentAtIso: string;
  remainingQueued: number;
}): Promise<void> {
  const {
    airtableToken,
    baseId,
    campaignsTable,
    dispatchId,
    campaignId,
    sentAtIso,
    remainingQueued,
  } = args;

  if (remainingQueued > 0) return;

  await sql`
    update campaign_dispatches
    set status = 'complete',
        locked_at = null,
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = ${dispatchId}::uuid
  `;

  try {
    await airtablePatchRecords({
      token: airtableToken,
      baseId,
      table: campaignsTable,
      records: [
        {
          id: campaignId,
          fields: {
            Status: "Complete",
            "Sent at": sentAtIso,
          },
        },
      ],
    });
  } catch {
    // Best effort only; Postgres is the dispatch source of truth.
  }
}

async function fetchCampaignFields(args: {
  airtableToken: string;
  baseId: string;
  campaignsTable: string;
  campaignId: string;
}): Promise<CampaignFields> {
  const { airtableToken, baseId, campaignsTable, campaignId } = args;

  const camp = await airtableListAll<CampaignFields>({
    token: airtableToken,
    baseId,
    table: campaignsTable,
    filterByFormula: `RECORD_ID()="${escapeAirtableString(campaignId)}"`,
    fields: [
      "Campaign/Pitch",
      "Email subject template",
      "Email body template",
      "Default CTA",
      "Key links",
      "Assets pack link",
      "Status",
      "Sent at",
    ],
    maxRecords: 1,
  });

  return camp[0]?.fields ?? {};
}

async function claimQueuedRecipients(args: {
  dispatchId: string;
  batchLimit: number;
}): Promise<RecipientRow[]> {
  const { dispatchId, batchLimit } = args;

  const result = await sql<RecipientRow>`
    with picked as (
      select id
      from campaign_dispatch_recipients
      where dispatch_id = ${dispatchId}::uuid
        and status = 'queued'
      order by created_at asc
      limit ${batchLimit}
      for update skip locked
    )
    update campaign_dispatch_recipients r
    set
      status = 'sending',
      attempts = attempts + 1,
      last_attempt_at = now(),
      updated_at = now()
    from picked
    where r.id = picked.id
    returning
      r.id::text,
      r.airtable_contact_id,
      r.recipient_email,
      r.from_address,
      r.reply_to,
      r.template_vars,
      r.personalised_snapshot
  `;

  return result.rows;
}

async function markRecipientsFailed(args: {
  recipientIds: string[];
  reason: string;
}): Promise<void> {
  const { recipientIds, reason } = args;

  for (const recipientId of recipientIds) {
    await sql`
      update campaign_dispatch_recipients
      set status = 'failed',
          last_error = ${reason},
          updated_at = now(),
          last_event_at = now()
      where id = ${recipientId}::uuid
    `;
  }
}

async function markRecipientsSent(args: {
  payloads: Payload[];
  resendIds: string[];
  sentAtIso: string;
}): Promise<void> {
  const { payloads, resendIds, sentAtIso } = args;

  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i];
    const resendId = resendIds[i] ?? "";

    await sql`
      update campaign_dispatch_recipients
      set
        status = 'sent',
        resend_message_id = ${resendId || null},
        sent_at = ${sentAtIso},
        last_event_at = ${sentAtIso},
        updated_at = now()
      where id = ${payload.recipientId}::uuid
    `;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const runId = crypto.randomUUID();

  try {
    if (!requireInternalBasicAuth(req, res)) return;
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const resendKey = mustEnv(
      process.env.AFR_RESEND_API_KEY,
      "AFR_RESEND_API_KEY",
    );
    const airtableToken = mustEnv(process.env.AIRTABLE_TOKEN, "AIRTABLE_TOKEN");
    const baseId = mustEnv(process.env.AIRTABLE_BASE_ID, "AIRTABLE_BASE_ID");
    const unsubscribeSecret = mustEnv(
      process.env.AFR_UNSUBSCRIBE_SECRET,
      "AFR_UNSUBSCRIBE_SECRET",
    );
    const campaignsTable = mustEnv(
      process.env.AIRTABLE_CAMPAIGNS_TABLE,
      "AIRTABLE_CAMPAIGNS_TABLE",
    );

    const body = (req.body ?? {}) as Record<string, unknown>;
    const campaignId =
      typeof body.campaignId === "string" ? body.campaignId.trim() : "";
    const limitRaw = typeof body.limit === "number" ? body.limit : undefined;
    const force = body.force === true;

    if (!campaignId) return jsonError(res, 400, "Missing campaignId");

    const batchLimit = Math.max(
      1,
      Math.min(100, typeof limitRaw === "number" ? Math.floor(limitRaw) : 50),
    );

    const dispatchResult = await sql<DispatchRow>`
      update campaign_dispatches
      set
        status = case when status = 'complete' then status else 'sending' end,
        locked_at = now(),
        updated_at = now()
      where airtable_campaign_id = ${campaignId}
        and (
          ${force} = true
          or locked_at is null
          or locked_at < now() - interval '2 minutes'
          or status in ('ready', 'queued')
        )
      returning
        id::text,
        airtable_campaign_id,
        campaign_pitch,
        audience_key,
        from_address,
        reply_to,
        status,
        sent_count,
        failed_count
    `;

    const dispatch = dispatchResult.rows[0];

    if (!dispatch) {
      return res.status(409).json({
        error: "Campaign locked (another drain likely running) or no dispatch exists.",
        code: "CAMPAIGN_LOCKED",
        runId,
        campaignId,
      });
    }

    const nowIso = isoNow();
    const resend = new Resend(resendKey);
    const siteUrl = publicSiteUrl();
    const logoUrl = `${siteUrl}/brand/AFR_logo_circle_light_mini.png`;

    try {
      await airtablePatchRecords({
        token: airtableToken,
        baseId,
        table: campaignsTable,
        records: [{ id: campaignId, fields: { Status: "Sending" } }],
      });
    } catch {
      // Best effort only.
    }

    const campaignFields = await fetchCampaignFields({
      airtableToken,
      baseId,
      campaignsTable,
      campaignId,
    });

    const campaignPitch =
      asString(campaignFields["Campaign/Pitch"]).trim() ||
      dispatch.campaign_pitch;

    const subjectTemplate = asString(
      campaignFields["Email subject template"],
    ).trim();
    const bodyTemplate = asString(campaignFields["Email body template"]).trim();

    if (!subjectTemplate || !bodyTemplate) {
      return jsonError(res, 400, "Campaign is missing subject/body templates");
    }

    const campaignUsesPersonalUrl =
      templateUsesPersonalUrl(subjectTemplate) ||
      templateUsesPersonalUrl(bodyTemplate);

    const picked = await claimQueuedRecipients({
      dispatchId: dispatch.id,
      batchLimit,
    });

    if (!picked.length) {
      const counts = await refreshDispatchCounts(dispatch.id);
      await markDispatchCompleteIfDone({
        airtableToken,
        baseId,
        campaignsTable,
        dispatchId: dispatch.id,
        campaignId,
        sentAtIso: nowIso,
        remainingQueued: counts.queued_count,
      });

      const nextPollMs = clampInt(
        computeNextPollMs({
          sent: 0,
          remainingQueued: counts.queued_count,
          batchLimit,
        }),
        0,
        5000,
      );

      return res.status(200).json({
        ok: true,
        sent: 0,
        remainingQueued: counts.queued_count,
        nextPollMs,
        runId,
        diagnostics: {
          campaignId,
          dispatchId: dispatch.id,
          eligibleToSend: 0,
          invalidInBatch: 0,
          sentThisBatch: 0,
        },
      });
    }

    const invalid: Array<{ recipientId: string; reason: string }> = [];
    const payloads: Payload[] = [];

    for (const row of picked) {
      const to = normalizeEmail(row.recipient_email);
      const from = row.from_address.trim();
      const replyTo = row.reply_to.trim();

      if (!isValidEmailLoose(to)) {
        invalid.push({
          recipientId: row.id,
          reason: `Invalid recipient email: "${to}"`,
        });
        continue;
      }

      if (!from) {
        invalid.push({ recipientId: row.id, reason: "Missing From address" });
        continue;
      }

      if (replyTo && !isValidEmailLoose(replyTo)) {
        invalid.push({
          recipientId: row.id,
          reason: `Invalid Reply-to: "${replyTo}"`,
        });
        continue;
      }

      const storedVars = jsonRecordValue(row.template_vars);

      if (campaignUsesPersonalUrl && !storedVars.personal_url) {
        invalid.push({
          recipientId: row.id,
          reason:
            "Campaign uses {{personal_url}} but Press Contacts.Personal URL is missing or invalid (HTTPS required)",
        });
        continue;
      }

      const unsubscribeUrl =
        row.airtable_contact_id && row.airtable_contact_id.startsWith("rec")
          ? `${siteUrl}/api/unsubscribe?t=${encodeURIComponent(
              mintUnsubscribeToken({
                secret: unsubscribeSecret,
                contactId: row.airtable_contact_id,
                email: to,
                campaignId,
                sendId: row.id,
                ttlDays: 60,
              }),
            )}`
          : "";

      const vars: Record<string, string> = {
        ...storedVars,
        email: to,
        campaign_name: campaignPitch,
        key_links: asString(campaignFields["Key links"]),
        assets_pack_link: asString(campaignFields["Assets pack link"]),
        default_cta: asString(campaignFields["Default CTA"]),
        unsubscribe_url: unsubscribeUrl,
      };

      const subject = mergeTemplate(subjectTemplate, vars).trim() || "(no subject)";
      const mergedBody = mergeTemplate(bodyTemplate, vars).trim();

      const footerText = unsubscribeUrl
        ? `\n\n---\nDon’t want to hear from us again? ${unsubscribeUrl}`
        : `\n\n---\nDon’t want to hear from us again? Reply with “unsubscribe”.`;

      const text = (mergedBody + footerText).trim() || " ";

      const html = await renderEmail(
        React.createElement(PressPitchEmail, {
          brandName: "Angelfish Records",
          bodyMarkdown: mergedBody,
          logoUrl,
          unsubscribeUrl,
        }),
        { pretty: true },
      );

      payloads.push({
        recipientId: row.id,
        contactId: row.airtable_contact_id,
        to,
        from,
        replyTo,
        subject,
        text,
        html,
        unsubscribeUrl: unsubscribeUrl || undefined,
      });
    }

    if (invalid.length) {
      for (const item of invalid) {
        await markRecipientsFailed({
          recipientIds: [item.recipientId],
          reason: `validation_failed=${item.reason}\nrun_id=${runId}`,
        });
      }
    }

    if (!payloads.length) {
      const counts = await refreshDispatchCounts(dispatch.id);
      const nextPollMs = clampInt(
        computeNextPollMs({
          sent: 0,
          remainingQueued: counts.queued_count,
          batchLimit,
        }),
        0,
        5000,
      );

      return res.status(200).json({
        ok: true,
        sent: 0,
        remainingQueued: counts.queued_count,
        nextPollMs,
        runId,
        diagnostics: {
          campaignId,
          dispatchId: dispatch.id,
          eligibleToSend: picked.length,
          invalidInBatch: invalid.length,
          sentThisBatch: 0,
        },
      });
    }

    const batchKeyRaw = `campaign:${campaignId}:recipient_ids:${payloads
      .map((p) => p.recipientId)
      .join(",")}`;
    const idempotencyKey = `af:${campaignId}:${sha256Hex(batchKeyRaw).slice(0, 48)}`;

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < 3) {
      attempt++;

      const emails = payloads.map((p) => ({
        from: p.from,
        to: p.to,
        subject: p.subject,
        text: p.text,
        html: p.html,
        ...(p.replyTo ? { replyTo: p.replyTo } : {}),
        ...(p.unsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${p.unsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
        tags: [
          { name: "campaign_id", value: campaignId },
          { name: "dispatch_id", value: dispatch.id },
          { name: "recipient_id", value: p.recipientId },
          { name: "run_id", value: runId },
        ],
      }));

      const result = await resend.batch.send(emails, { idempotencyKey });
      const error = (result as { error?: unknown }).error;

      if (!error) {
        const dataUnknown = (result as { data?: unknown }).data;

        const idsArr: ResendIdRow[] | null = Array.isArray(dataUnknown)
          ? (dataUnknown as ResendIdRow[])
          : dataUnknown &&
              typeof dataUnknown === "object" &&
              Array.isArray((dataUnknown as { data?: unknown }).data)
            ? ((dataUnknown as { data: unknown }).data as ResendIdRow[])
            : null;

        if (!idsArr || idsArr.length !== payloads.length) {
          throw new Error(
            "Resend batch response missing ids (unexpected shape)",
          );
        }

        await markRecipientsSent({
          payloads,
          resendIds: idsArr.map((row) => row.id),
          sentAtIso: nowIso,
        });

        const counts = await refreshDispatchCounts(dispatch.id);
        await markDispatchCompleteIfDone({
          airtableToken,
          baseId,
          campaignsTable,
          dispatchId: dispatch.id,
          campaignId,
          sentAtIso: nowIso,
          remainingQueued: counts.queued_count,
        });

        const nextPollMs = clampInt(
          computeNextPollMs({
            sent: payloads.length,
            remainingQueued: counts.queued_count,
            batchLimit,
          }),
          0,
          5000,
        );

        return res.status(200).json({
          ok: true,
          sent: payloads.length,
          remainingQueued: counts.queued_count,
          nextPollMs,
          runId,
          diagnostics: {
            campaignId,
            dispatchId: dispatch.id,
            eligibleToSend: picked.length,
            invalidInBatch: invalid.length,
            sentThisBatch: payloads.length,
          },
        });
      }

      lastError = error;
      const msg =
        typeof (error as { message?: unknown } | null)?.message === "string"
          ? (error as { message: string }).message
          : stringifyError(error);

      const looksRateLimited =
        msg.includes("429") || msg.toLowerCase().includes("rate");
      if (!looksRateLimited) break;

      await sleep(Math.min(8000, 500 * Math.pow(2, attempt - 1)));
    }

    const errText = stringifyError(lastError);

    await markRecipientsFailed({
      recipientIds: payloads.map((p) => p.recipientId),
      reason: `${errText ? `send_failed=${errText}\n` : ""}run_id=${runId}`,
    });

    const counts = await refreshDispatchCounts(dispatch.id);

    return res.status(502).json({
      error: "Drain send failed",
      resend: errText,
      runId,
      diagnostics: {
        campaignId,
        dispatchId: dispatch.id,
        eligibleToSend: picked.length,
        invalidInBatch: invalid.length,
        sentThisBatch: 0,
        remainingQueued: counts.queued_count,
      },
    });
  } catch (err) {
    console.error("[campaigns/drain] failed", { runId, err });
    return res.status(500).json({
      error: "Drain failed",
      message: err instanceof Error ? err.message : String(err),
      runId,
    });
  }
}
