import type { NextApiRequest, NextApiResponse } from "next";
import { createInternalMuxUpload, MuxApiError } from "@/lib/mux/internalUpload";

type CreateUploadResponse =
  | { ok: true; uploadId: string; uploadUrl: string }
  | { ok: false; error: string };

type ParsedBody = {
  title: string | null;
  creatorId: string | null;
  externalId: string | null;
};

class RequestValidationError extends Error {}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new RequestValidationError(`${label} must be text`);
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new RequestValidationError(
      `${label} must be ${maxLength} characters or fewer`,
    );
  }
  return trimmed;
}

function parseBody(value: unknown): ParsedBody {
  if (!isObjectRecord(value)) {
    throw new RequestValidationError("Invalid upload request");
  }

  return {
    title: optionalText(value.title, "Asset title", 512),
    creatorId: optionalText(value.creatorId, "Artist / creator ID", 128),
    externalId: optionalText(value.externalId, "Recording / external ID", 128),
  };
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function requestCorsOrigin(req: NextApiRequest): string {
  const host =
    firstHeader(req.headers["x-forwarded-host"]) ??
    firstHeader(req.headers.host);

  if (!host) {
    throw new RequestValidationError("Could not determine upload origin");
  }

  const suppliedOrigin = firstHeader(req.headers.origin);
  if (suppliedOrigin) {
    let parsed: URL;
    try {
      parsed = new URL(suppliedOrigin);
    } catch {
      throw new RequestValidationError("Invalid request origin");
    }

    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.host.toLowerCase() !== host.toLowerCase()
    ) {
      throw new RequestValidationError("Request origin does not match host");
    }

    return parsed.origin;
  }

  const forwardedProto = firstHeader(req.headers["x-forwarded-proto"])
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https";

  return `${protocol}://${host}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreateUploadResponse>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");

  try {
    const body: unknown = req.body;
    const parsed = parseBody(body);
    const corsOrigin = requestCorsOrigin(req);
    const created = await createInternalMuxUpload({ corsOrigin, ...parsed });

    res.status(200).json({
      ok: true,
      uploadId: created.uploadId,
      uploadUrl: created.uploadUrl,
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }

    console.error("[internal mux upload] create failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      muxStatus: error instanceof MuxApiError ? error.status : null,
    });

    res
      .status(502)
      .json({ ok: false, error: "Mux could not create the upload" });
  }
}
