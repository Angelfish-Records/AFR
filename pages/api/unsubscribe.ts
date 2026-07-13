// pages/api/unsubscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";
import {
  airtablePatchSingle,
  mustEnv,
} from "@/lib/campaigns/airtable";
import { parseUnsubscribeToken } from "@/lib/campaigns/unsubscribeTokens";

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#0b0b0c;color:#f2f2f2;">
  <div style="max-width:720px;margin:0 auto;">
    <div style="border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);border-radius:16px;padding:18px 18px;">
      ${body}
    </div>
    <div style="margin-top:14px;opacity:0.7;font-size:12px;">
      Angelfish Records • This link is only for managing press email preferences.
    </div>
  </div>
</body>
</html>`;
}

function pickToken(req: NextApiRequest): string {
  const q = typeof req.query.t === "string" ? req.query.t : "";
  if (q) return q;

  if (typeof req.url === "string") {
    try {
      const u = new URL(req.url, "http://localhost");
      const t = u.searchParams.get("t");
      if (t) return t;
    } catch {
      // ignore malformed URL
    }
  }

  const b = req.body as unknown;
  if (b && typeof b === "object" && typeof (b as { t?: unknown }).t === "string") {
    return (b as { t: string }).t;
  }

  return "";
}

function isOneClickPost(req: NextApiRequest): boolean {
  if (req.method !== "POST") return false;
  const lup = req.headers["list-unsubscribe-post"];
  return typeof lup === "string" && lup.toLowerCase().includes("one-click");
}

async function markContactUnsubscribed(args: {
  contactId: string;
}): Promise<void> {
  const airtableToken = mustEnv(process.env.AIRTABLE_TOKEN, "AIRTABLE_TOKEN");
  const baseId = mustEnv(process.env.AIRTABLE_BASE_ID, "AIRTABLE_BASE_ID");
  const contactsTable = mustEnv(
    process.env.AIRTABLE_PRESS_CONTACTS_TABLE,
    "AIRTABLE_PRESS_CONTACTS_TABLE",
  );

  await airtablePatchSingle({
    token: airtableToken,
    baseId,
    table: contactsTable,
    recordId: args.contactId,
    fields: {
      Status: "Unsubscribed",
    },
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    const token = pickToken(req);
    if (!token) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(
        htmlPage(
          "Invalid link",
          `<h1 style="margin:0 0 10px 0;font-size:18px;">Invalid link</h1>
           <div style="opacity:0.85;line-height:1.5;">This unsubscribe link is missing or malformed.</div>`,
        ),
      );
    }

    const secret = mustEnv(
      process.env.AFR_UNSUBSCRIBE_SECRET,
      "AFR_UNSUBSCRIBE_SECRET",
    );
    const parsed = parseUnsubscribeToken(token, secret);

    if (!parsed.ok) {
      if (isOneClickPost(req)) return res.status(204).end();

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(400).send(
        htmlPage(
          "Link expired",
          `<h1 style="margin:0 0 10px 0;font-size:18px;">This link can’t be used</h1>
          <div style="opacity:0.85;line-height:1.5;">
            It may have expired or been copied incorrectly. If you still want to opt out, reply to the email and ask us to stop.
          </div>`,
        ),
      );
    }

    const payload = parsed.payload;

    if (req.method === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(
        htmlPage(
          "Confirm unsubscribe",
          `<h1 style="margin:0 0 10px 0;font-size:18px;">Unsubscribe from Angelfish Records press emails?</h1>
           <div style="opacity:0.85;line-height:1.5;margin-bottom:14px;">
             Email: <b>${escapeHtml(payload.em)}</b>
           </div>
           <form method="POST" action="/api/unsubscribe">
             <input type="hidden" name="t" value="${escapeHtml(token)}" />
             <button type="submit" style="cursor:pointer;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.10);color:#fff;padding:10px 14px;border-radius:12px;font-weight:600;">
               Confirm unsubscribe
             </button>
           </form>
           <div style="margin-top:12px;opacity:0.7;font-size:12px;line-height:1.5;">
             This is a cold outreach list; we’ll treat this as “do not contact” going forward.
           </div>`,
        ),
      );
    }

    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    await markContactUnsubscribed({ contactId: payload.cid });

    if (isOneClickPost(req)) {
      return res.status(204).end();
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(
      htmlPage(
        "Unsubscribed",
        `<h1 style="margin:0 0 10px 0;font-size:18px;">You’re unsubscribed.</h1>
         <div style="opacity:0.85;line-height:1.5;">
           We won’t send further press emails to <b>${escapeHtml(payload.em)}</b>.
         </div>`,
      ),
    );
  } catch (err) {
    console.error("[unsubscribe] failed", err);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(500).send(
      htmlPage(
        "Error",
        `<h1 style="margin:0 0 10px 0;font-size:18px;">Something went wrong</h1>
         <div style="opacity:0.85;line-height:1.5;">Please reply to the email and ask us to stop.</div>`,
      ),
    );
  }
}
