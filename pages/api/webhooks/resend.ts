// pages/api/webhooks/resend.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { Webhook } from "svix";
import { sql } from "@vercel/postgres";
import {
  airtableListAll,
  airtablePatchSingle,
  escapeAirtableString,
  mustEnv,
} from "@/lib/campaigns/airtable";
import { normalizeEmail } from "@/lib/campaigns/senders";

export const config = {
  api: { bodyParser: false },
};

type ResendWebhookEnvelope = {
  type?: string;
  created_at?: string;
  data?: unknown;
};

type ResendEmailEventData = {
  email_id?: string;
  from?: string;
  to?: string[];
  subject?: string;
};

type ContactLookupFields = {
  Email?: string;
  Status?: string;
};

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object";
}

function looksLikeEmailEventData(x: unknown): x is ResendEmailEventData {
  if (!isObj(x)) return false;
  const o = x as Record<string, unknown>;
  if ("to" in o && o.to !== undefined && !Array.isArray(o.to)) return false;
  return true;
}

function isoNow(): string {
  return new Date().toISOString();
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function statusForCriticalResendEvent(
  type: string,
): "Bounced" | "Do not pitch" | null {
  if (type === "email.bounced") return "Bounced";
  if (type === "email.complained") return "Do not pitch";
  return null;
}

function queueStatusForResendEvent(
  type: string,
): "bounced" | "complained" | "failed" | null {
  switch (type) {
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.failed":
      return "failed";
    default:
      return null;
  }
}

async function findContactIdByEmail(args: {
  airtableToken: string;
  baseId: string;
  contactsTable: string;
  email: string;
}): Promise<string | null> {
  const { airtableToken, baseId, contactsTable, email } = args;

  const records = await airtableListAll<ContactLookupFields>({
    token: airtableToken,
    baseId,
    table: contactsTable,
    filterByFormula: `LOWER({Email}) = "${escapeAirtableString(email)}"`,
    fields: ["Email", "Status"],
    maxRecords: 1,
  });

  return records[0]?.id ?? null;
}

async function updateQueueRecipientByMessageId(args: {
  resendMessageId: string;
  status: "bounced" | "complained" | "failed";
  eventAtIso: string;
}): Promise<void> {
  const { resendMessageId, status, eventAtIso } = args;

  await sql`
    update campaign_dispatch_recipients
    set
      status = case
        when ${status} in ('bounced', 'complained', 'failed') then ${status}
        when status in ('queued', 'sending', 'sent') then ${status}
        else status
      end,
      last_event_at = ${eventAtIso},
      updated_at = now()
    where resend_message_id = ${resendMessageId}
  `;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const webhookSecret = mustEnv(
    process.env.AFR_RESEND_WEBHOOK_SECRET,
    "AFR_RESEND_WEBHOOK_SECRET",
  );

  const svixId = (req.headers["svix-id"] as string | undefined) ?? "";
  const svixTimestamp =
    (req.headers["svix-timestamp"] as string | undefined) ?? "";
  const svixSignature =
    (req.headers["svix-signature"] as string | undefined) ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) {
    return res.status(400).send("Missing webhook headers");
  }

  const payload = await readRawBody(req);

  try {
    const wh = new Webhook(webhookSecret);
    wh.verify(payload, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return res.status(400).send("Invalid webhook");
  }

  let event: ResendWebhookEnvelope;
  try {
    event = JSON.parse(payload) as ResendWebhookEnvelope;
  } catch {
    return res.status(400).send("Invalid JSON payload");
  }

  try {
    const type = typeof event.type === "string" ? event.type : "";
    const eventAtIso = event.created_at
      ? new Date(event.created_at).toISOString()
      : isoNow();

    const data = event.data;
    const isEmailData = looksLikeEmailEventData(data);

    const resendMessageId =
      isEmailData && typeof data.email_id === "string" ? data.email_id : "";

    const toEmail =
      isEmailData && Array.isArray(data.to) && typeof data.to[0] === "string"
        ? normalizeEmail(data.to[0])
        : "";

    const queueStatus = queueStatusForResendEvent(type);
    if (queueStatus && resendMessageId) {
      await updateQueueRecipientByMessageId({
        resendMessageId,
        status: queueStatus,
        eventAtIso,
      });
    }

    const contactStatus = statusForCriticalResendEvent(type);
    if (!contactStatus || !toEmail) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const airtableToken = mustEnv(process.env.AIRTABLE_TOKEN, "AIRTABLE_TOKEN");
    const baseId = mustEnv(process.env.AIRTABLE_BASE_ID, "AIRTABLE_BASE_ID");
    const pressContactsTable = mustEnv(
      process.env.AIRTABLE_PRESS_CONTACTS_TABLE,
      "AIRTABLE_PRESS_CONTACTS_TABLE",
    );

    const contactId = await findContactIdByEmail({
      airtableToken,
      baseId,
      contactsTable: pressContactsTable,
      email: toEmail,
    });

    if (contactId) {
      await airtablePatchSingle({
        token: airtableToken,
        baseId,
        table: pressContactsTable,
        recordId: contactId,
        fields: {
          Status: contactStatus,
        },
      });
    }

    return res.status(200).json({
      ok: true,
      critical: true,
      contactUpdated: Boolean(contactId),
    });
  } catch (err) {
    console.error("[resend-webhook] processing failed", err);
    return res
      .status(500)
      .send(
        "Webhook processing failed: " +
          (err instanceof Error ? err.message : String(err)),
      );
  }
}
