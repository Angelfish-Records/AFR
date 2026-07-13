// lib/campaigns/senders.ts
export type CampaignSenderKey = "angus" | "brendan";

export type CampaignSender = {
  fromAddress: string;
  replyTo: string;
};

export const CAMPAIGN_SENDERS: Record<CampaignSenderKey, CampaignSender> = {
  angus: {
    fromAddress:
      "Angus at Angelfish Records <angus@press.angelfishrecords.com>",
    replyTo: "angus@press.angelfishrecords.com",
  },
  brendan: {
    fromAddress:
      "Brendan at Angelfish Records <brendan@press.angelfishrecords.com>",
    replyTo: "brendan@press.angelfishrecords.com",
  },
};

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function parseCampaignSenderKey(v: unknown): CampaignSenderKey | null {
  const s = asString(v).trim();
  if (s === "angus" || s === "brendan") return s;
  return null;
}

export function isValidEmailLoose(s: string): boolean {
  const x = s.trim();
  if (x.length < 3 || x.length > 254) return false;

  const at = x.indexOf("@");
  if (at <= 0 || at !== x.lastIndexOf("@")) return false;

  const dot = x.lastIndexOf(".");
  return dot > at + 1 && dot < x.length - 1;
}

export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

export function extractEmailFromAddress(s: string): string | null {
  const trimmed = s.trim();
  const m = trimmed.match(/<([^>]+)>/);
  const candidate = (m?.[1] ?? trimmed).trim();
  return isValidEmailLoose(candidate) ? candidate : null;
}
