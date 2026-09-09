import type { NextApiRequest, NextApiResponse } from "next";
import {
  getInternalMuxUploadStatus,
  MuxApiError,
  MuxUploadStateError,
} from "@/lib/mux/internalUpload";

type UploadStatusResponse =
  | {
      ok: true;
      uploadStatus: string;
      assetStatus: string | null;
      ready: boolean;
      assetId: string | null;
      playbackId: string | null;
      staticAudioStatus: string | null;
      durationMs: number | null;
    }
  | { ok: false; error: string };

class RequestValidationError extends Error {}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUploadId(value: unknown): string {
  if (!isObjectRecord(value) || typeof value.uploadId !== "string") {
    throw new RequestValidationError("Missing uploadId");
  }

  const uploadId = value.uploadId.trim();
  if (
    uploadId.length === 0 ||
    uploadId.length > 200 ||
    !/^[A-Za-z0-9_-]+$/.test(uploadId)
  ) {
    throw new RequestValidationError("Invalid uploadId");
  }

  return uploadId;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadStatusResponse>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");

  try {
    const body: unknown = req.body;
    const uploadId = parseUploadId(body);
    const status = await getInternalMuxUploadStatus(uploadId);
    res.status(200).json({ ok: true, ...status });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }

    if (error instanceof MuxUploadStateError) {
      res.status(502).json({ ok: false, error: error.message });
      return;
    }

    console.error("[internal mux upload] status failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      muxStatus: error instanceof MuxApiError ? error.status : null,
    });

    res.status(502).json({
      ok: false,
      error: "Mux upload status could not be read",
    });
  }
}
