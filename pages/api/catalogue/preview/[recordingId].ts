import type { NextApiRequest, NextApiResponse } from "next";
import { importPKCS8, SignJWT } from "jose";
import crypto from "crypto";
import { hasCatalogueApiAccess } from "@/lib/catalogue/access";
import { getCatalogueRecordByRecordingId } from "@/lib/catalogue/queries";

function mustEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) {
      return v.trim();
    }
  }

  throw new Error(`Missing env var: one of [${names.join(", ")}]`);
}

function normalizePemMaybe(input: string): string {
  const raw = (input ?? "").trim();
  const looksLikePem =
    raw.includes("-----BEGIN ") && raw.includes("-----END ");

  if (looksLikePem) {
    return raw.replace(/\\n/g, "\n");
  }

  return Buffer.from(raw, "base64")
    .toString("utf8")
    .trim()
    .replace(/\\n/g, "\n");
}

function toPkcs8Pem(pem: string): string {
  if (pem.includes("-----BEGIN PRIVATE KEY-----")) {
    return pem;
  }

  const keyObj = crypto.createPrivateKey(pem);
  return keyObj.export({ format: "pem", type: "pkcs8" }) as string;
}

type ArtistPlaybackLookupResponse =
  | {
      ok: true;
      playbackId: string;
      durationMs: number | null;
    }
  | {
      ok: false;
      error: string;
    };

type PreviewOkResponse = {
  ok: true;
  playbackUrl: string;
  expiresAt: number;
  clipStartSeconds: number;
  clipLengthSeconds: number;
};

type PreviewErrorResponse = {
  ok: false;
  error: string;
};

type PreviewResponse = PreviewOkResponse | PreviewErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PreviewResponse>
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!hasCatalogueApiAccess(req)) {
    res.status(404).json({ ok: false, error: "Not found" });
    return;
  }

  const recordingId = String(req.query.recordingId ?? "").trim();

  if (!recordingId) {
    res.status(400).json({ ok: false, error: "Missing recordingId" });
    return;
  }

  try {
    const catalogueRecord = await getCatalogueRecordByRecordingId(recordingId);

    if (!catalogueRecord) {
      res.status(404).json({ ok: false, error: "Catalogue record not found" });
      return;
    }

    const artistSiteBaseUrl = mustEnv("ARTIST_SITE_BASE_URL");

    const lookupResponse = await fetch(
      `${artistSiteBaseUrl}/api/catalogue/playback/${encodeURIComponent(recordingId)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const lookupPayload =
      (await lookupResponse.json()) as ArtistPlaybackLookupResponse;

    if (
      !lookupResponse.ok ||
      !lookupPayload.ok ||
      !lookupPayload.playbackId?.trim()
    ) {
      res.status(404).json({
        ok: false,
        error: "Playback ID not found",
      });
      return;
    }

    const playbackId = lookupPayload.playbackId.trim();

    const keyId = mustEnv("MUX_SIGNING_KEY_ID");
    const rawSigningKey = mustEnv("MUX_SIGNING_KEY_SECRET");

    const pem = toPkcs8Pem(normalizePemMaybe(rawSigningKey));
    const privateKey = await importPKCS8(pem, "RS256");

    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = Number(process.env.MUX_TOKEN_TTL_SECONDS ?? 900);
    const expiresAt = now + ttlSeconds;

    const playbackRestrictionId =
      process.env.MUX_PLAYBACK_RESTRICTION_ID?.trim() || undefined;

    const jwt = await new SignJWT({
      sub: playbackId,
      aud: "v",
      exp: expiresAt,
      ...(playbackRestrictionId
        ? { playback_restriction_id: playbackRestrictionId }
        : {}),
    })
      .setProtectedHeader({ alg: "RS256", kid: keyId, typ: "JWT" })
      .sign(privateKey);

    const playbackUrl = `https://stream.mux.com/${playbackId}.m3u8?signature=${encodeURIComponent(jwt)}`;

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({
      ok: true,
      playbackUrl,
      expiresAt,
      clipStartSeconds: catalogueRecord.previewStartSeconds ?? 0,
      clipLengthSeconds: 30,
    });
  } catch {
    res.status(500).json({
      ok: false,
      error: "Preview generation failed",
    });
  }
}