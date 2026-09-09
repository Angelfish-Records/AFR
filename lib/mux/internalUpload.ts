type ObjectRecord = Record<string, unknown>;

export type CreateInternalMuxUploadInput = {
  corsOrigin: string;
  title: string | null;
  creatorId: string | null;
  externalId: string | null;
};

export type CreatedInternalMuxUpload = {
  uploadId: string;
  uploadUrl: string;
};

export type InternalMuxUploadStatus = {
  uploadStatus: string;
  assetStatus: string | null;
  ready: boolean;
  assetId: string | null;
  playbackId: string | null;
  staticAudioStatus: string | null;
  durationMs: number | null;
};

export class MuxApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MuxApiError";
    this.status = status;
  }
}

export class MuxUploadStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MuxUploadStateError";
  }
}

function isObjectRecord(value: unknown): value is ObjectRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finitePositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function requireEnv(name: "MUX_TOKEN_ID" | "MUX_TOKEN_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function muxErrorMessage(payload: unknown): string | null {
  if (!isObjectRecord(payload)) return null;
  if (typeof payload.error === "string") return payload.error;
  if (!isObjectRecord(payload.error)) return null;
  return (
    nonEmptyString(payload.error.message) ?? nonEmptyString(payload.error.type)
  );
}

async function muxApiRequest(
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const tokenId = requireEnv("MUX_TOKEN_ID");
  const tokenSecret = requireEnv("MUX_TOKEN_SECRET");
  const authorization = Buffer.from(
    `${tokenId}:${tokenSecret}`,
    "utf8",
  ).toString("base64");

  const response = await fetch(`https://api.mux.com${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new MuxApiError(
      muxErrorMessage(payload) ?? `Mux API request failed (${response.status})`,
      response.status,
    );
  }

  return payload;
}

function requireEnvelopeData(payload: unknown, label: string): ObjectRecord {
  if (!isObjectRecord(payload) || !isObjectRecord(payload.data)) {
    throw new Error(`Mux ${label} response was invalid`);
  }
  return payload.data;
}

function buildMeta(input: CreateInternalMuxUploadInput): ObjectRecord | null {
  const meta: ObjectRecord = {};
  if (input.title) meta.title = input.title;
  if (input.creatorId) meta.creator_id = input.creatorId;
  if (input.externalId) meta.external_id = input.externalId;
  return Object.keys(meta).length > 0 ? meta : null;
}

export async function createInternalMuxUpload(
  input: CreateInternalMuxUploadInput,
): Promise<CreatedInternalMuxUpload> {
  const meta = buildMeta(input);
  const payload = await muxApiRequest("/video/v1/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: input.corsOrigin,
      new_asset_settings: {
        playback_policies: ["signed"],
        static_renditions: [{ resolution: "audio-only" }],
        ...(meta ? { meta } : {}),
      },
    }),
  });

  const data = requireEnvelopeData(payload, "direct upload");
  const uploadId = nonEmptyString(data.id);
  const uploadUrl = nonEmptyString(data.url);

  if (!uploadId || !uploadUrl) {
    throw new Error(
      "Mux direct upload response did not contain an upload ID and URL",
    );
  }

  return { uploadId, uploadUrl };
}

function staticRenditionEntries(asset: ObjectRecord): ObjectRecord[] {
  const value = asset.static_renditions;
  if (Array.isArray(value)) return value.filter(isObjectRecord);
  if (isObjectRecord(value) && Array.isArray(value.files)) {
    return value.files.filter(isObjectRecord);
  }
  return [];
}

function findAudioRendition(asset: ObjectRecord): ObjectRecord | null {
  return (
    staticRenditionEntries(asset).find(
      (entry) =>
        nonEmptyString(entry.name) === "audio.m4a" ||
        nonEmptyString(entry.resolution) === "audio-only",
    ) ?? null
  );
}

function findSignedPlaybackId(asset: ObjectRecord): string | null {
  if (!Array.isArray(asset.playback_ids)) return null;

  for (const item of asset.playback_ids) {
    if (isObjectRecord(item) && nonEmptyString(item.policy) === "signed") {
      const playbackId = nonEmptyString(item.id);
      if (playbackId) return playbackId;
    }
  }

  return null;
}

export async function getInternalMuxUploadStatus(
  uploadId: string,
): Promise<InternalMuxUploadStatus> {
  const uploadPayload = await muxApiRequest(
    `/video/v1/uploads/${encodeURIComponent(uploadId)}`,
  );
  const upload = requireEnvelopeData(uploadPayload, "upload status");
  const uploadStatus = nonEmptyString(upload.status) ?? "unknown";

  if (["errored", "cancelled", "timed_out"].includes(uploadStatus)) {
    throw new MuxUploadStateError(`Mux direct upload ${uploadStatus}`);
  }

  const assetId = nonEmptyString(upload.asset_id);
  if (!assetId) {
    return {
      uploadStatus,
      assetStatus: null,
      ready: false,
      assetId: null,
      playbackId: null,
      staticAudioStatus: null,
      durationMs: null,
    };
  }

  const assetPayload = await muxApiRequest(
    `/video/v1/assets/${encodeURIComponent(assetId)}`,
  );
  const asset = requireEnvelopeData(assetPayload, "asset status");
  const assetStatus = nonEmptyString(asset.status) ?? "unknown";

  if (assetStatus === "errored") {
    throw new MuxUploadStateError("Mux asset processing errored");
  }

  const playbackId = findSignedPlaybackId(asset);
  const audioRendition = findAudioRendition(asset);
  const staticAudioStatus = audioRendition
    ? (nonEmptyString(audioRendition.status) ?? "preparing")
    : "preparing";

  if (staticAudioStatus === "errored" || staticAudioStatus === "skipped") {
    throw new MuxUploadStateError(
      `Static audio rendition ${staticAudioStatus}`,
    );
  }

  const durationSeconds = finitePositiveNumber(asset.duration);
  const durationMs =
    durationSeconds === null ? null : Math.round(durationSeconds * 1000);
  const ready =
    assetStatus === "ready" &&
    playbackId !== null &&
    staticAudioStatus === "ready";

  return {
    uploadStatus,
    assetStatus,
    ready,
    assetId,
    playbackId: ready ? playbackId : null,
    staticAudioStatus,
    durationMs: ready ? durationMs : null,
  };
}
