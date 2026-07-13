// lib/campaigns/unsubscribeTokens.ts
import crypto from "crypto";
import { normalizeEmail } from "@/lib/campaigns/senders";

export type UnsubTokenPayload = {
  v: 1;
  cid: string;
  em: string;
  exp: number;
  sid?: string;
  camp?: string;
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function base64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecodeToBuffer(s: string): Buffer | null {
  try {
    const padLen = (4 - (s.length % 4)) % 4;
    const padded = (s + "=".repeat(padLen)).replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function hmacSha256(secret: string, msg: string): Buffer {
  return crypto.createHmac("sha256", secret).update(msg).digest();
}

export function mintUnsubscribeToken(args: {
  secret: string;
  contactId: string;
  email: string;
  campaignId: string;
  sendId: string;
  ttlDays?: number;
}): string {
  const ttlDays = Math.max(1, Math.min(180, Math.floor(args.ttlDays ?? 60)));
  const nowSec = Math.floor(Date.now() / 1000);

  const payload: UnsubTokenPayload = {
    v: 1,
    cid: args.contactId,
    em: normalizeEmail(args.email),
    exp: nowSec + ttlDays * 86400,
    sid: args.sendId,
    camp: args.campaignId,
  };

  const payloadB64 = base64urlEncode(
    Buffer.from(JSON.stringify(payload), "utf8"),
  );
  const sigB64 = base64urlEncode(hmacSha256(args.secret, payloadB64));

  return `${payloadB64}.${sigB64}`;
}

export function parseUnsubscribeToken(
  token: string,
  secret: string,
): { ok: true; payload: UnsubTokenPayload } | { ok: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "Bad token shape" };

  const [payloadB64, sigB64] = parts;
  const expectSig = base64urlEncode(hmacSha256(secret, payloadB64));
  if (!safeEqual(sigB64, expectSig)) {
    return { ok: false, reason: "Bad signature" };
  }

  const payloadBuf = base64urlDecodeToBuffer(payloadB64);
  if (!payloadBuf) return { ok: false, reason: "Bad payload encoding" };

  let payload: UnsubTokenPayload;
  try {
    payload = JSON.parse(payloadBuf.toString("utf8")) as UnsubTokenPayload;
  } catch {
    return { ok: false, reason: "Bad payload JSON" };
  }

  if (!payload || payload.v !== 1) {
    return { ok: false, reason: "Unsupported token version" };
  }
  if (typeof payload.cid !== "string" || !payload.cid.startsWith("rec")) {
    return { ok: false, reason: "Bad contact id" };
  }
  if (typeof payload.em !== "string" || !payload.em.includes("@")) {
    return { ok: false, reason: "Bad email" };
  }
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
    return { ok: false, reason: "Bad expiry" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > payload.exp) return { ok: false, reason: "Expired" };

  payload.em = normalizeEmail(payload.em);
  return { ok: true, payload };
}
