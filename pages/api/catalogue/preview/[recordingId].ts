import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { importPKCS8, SignJWT } from "jose";
import { touchCatalogueApiAttribution } from "@/lib/catalogue/access";
import {
  getCataloguePlaybackEntryByRecordingId,
  getCatalogueRecordByRecordingId,
} from "@/lib/catalogue/queries";

function mustEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];

    if (value && value.trim()) {
      return value.trim();
    }
  }

  throw new Error(`Missing env var: one of [${names.join(", ")}]`);
}

function normalizePemMaybe(input: string): string {
  const raw = input.trim();
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

  const keyObject = crypto.createPrivateKey(pem);

  return keyObject.export({
    format: "pem",
    type: "pkcs8",
  }) as string;
}

function getTokenLifetimeSeconds(durationMs: number): number {
  const configuredRaw = Number(process.env.MUX_TOKEN_TTL_SECONDS ?? "900");

  const configuredSeconds =
    Number.isFinite(configuredRaw) && configuredRaw > 0
      ? Math.floor(configuredRaw)
      : 900;

  const minimumSeconds = Math.ceil(durationMs / 1000) + 60;

  return Math.max(configuredSeconds, minimumSeconds);
}

type PlaybackMode = "full" | "clip" | "instrumental";

type PreviewOkResponse = {
  ok: true;
  playbackUrl: string;
  expiresAt: number;
  clipStartSeconds: number | null;
  clipLengthSeconds: number | null;
};

type PreviewErrorResponse = {
  ok: false;
  error: string;
};

type PreviewResponse = PreviewOkResponse | PreviewErrorResponse;

function parsePlaybackMode(value: unknown): PlaybackMode | null {
  if (value === undefined) {
    return "full";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized === "full" ||
    normalized === "clip" ||
    normalized === "instrumental"
  ) {
    return normalized;
  }

  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PreviewResponse>,
): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
    return;
  }

  await touchCatalogueApiAttribution(req);

  const recordingId = String(req.query.recordingId ?? "").trim();
  const mode = parsePlaybackMode(req.query.mode);

  if (!recordingId) {
    res.status(400).json({
      ok: false,
      error: "Missing recordingId",
    });
    return;
  }

  if (!mode) {
    res.status(400).json({
      ok: false,
      error: "Unsupported playback mode",
    });
    return;
  }

  try {
    const [catalogueRecord, playbackEntry] = await Promise.all([
      getCatalogueRecordByRecordingId(recordingId),
      getCataloguePlaybackEntryByRecordingId(recordingId),
    ]);

    if (!catalogueRecord) {
      res.status(404).json({
        ok: false,
        error: "Catalogue record not found",
      });
      return;
    }

    if (!playbackEntry) {
      res.status(404).json({
        ok: false,
        error: "Playback metadata not found",
      });
      return;
    }

    const playbackSource =
      mode === "instrumental"
        ? playbackEntry.instrumental
        : playbackEntry.original;

    if (!playbackSource) {
      res.status(404).json({
        ok: false,
        error: "Instrumental playback not available",
      });
      return;
    }

    const keyId = mustEnv("MUX_SIGNING_KEY_ID");
    const rawSigningKey = mustEnv("MUX_SIGNING_KEY_SECRET");

    const pem = toPkcs8Pem(normalizePemMaybe(rawSigningKey));
    const privateKey = await importPKCS8(pem, "RS256");

    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = getTokenLifetimeSeconds(playbackSource.durationMs);
    const expiresAt = now + ttlSeconds;

    const playbackRestrictionId =
      process.env.MUX_PLAYBACK_RESTRICTION_ID?.trim() || undefined;

    const jwt = await new SignJWT({
      sub: playbackSource.playbackId,
      aud: "v",
      exp: expiresAt,
      ...(playbackRestrictionId
        ? {
            playback_restriction_id: playbackRestrictionId,
          }
        : {}),
    })
      .setProtectedHeader({
        alg: "RS256",
        kid: keyId,
        typ: "JWT",
      })
      .sign(privateKey);

    const playbackUrl =
      `https://stream.mux.com/${playbackSource.playbackId}/audio.m4a` +
      `?token=${encodeURIComponent(jwt)}`;

    res.setHeader("Cache-Control", "private, no-store");

    res.status(200).json({
      ok: true,
      playbackUrl,
      expiresAt,
      clipStartSeconds:
        mode === "instrumental"
          ? null
          : (catalogueRecord.previewStartSeconds ?? 0),
      clipLengthSeconds:
        mode === "instrumental" ? null : 30,
    });
  } catch (error) {
    console.error("[catalogue preview] Failed to generate signed playback URL", {
      recordingId,
      mode,
      error,
    });

    res.status(500).json({
      ok: false,
      error: "Preview generation failed",
    });
  }
}