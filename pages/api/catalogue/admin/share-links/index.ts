import type { NextApiRequest, NextApiResponse } from "next";
import { listCatalogueRecords } from "@/lib/catalogue/queries";
import {
  createCatalogueShareLink,
  listCatalogueShareLinks,
} from "@/lib/catalogue/shareLinks";
import type { CatalogueShareLinkSummary } from "@/lib/catalogue/shareLinkTypes";

type GetResponse = {
  ok: true;
  links: CatalogueShareLinkSummary[];
};

type PostResponse = {
  ok: true;
  link: CatalogueShareLinkSummary;
  shareUrl: string;
};

type ErrorResponse = {
  ok: false;
  error: string;
};

type ParsedCreateBody = {
  recipientName: string | null;
  recipientEmail: string | null;
  label: string | null;
  welcomeMessage: string | null;
  curatedRecordingIds: string[];
  expiresAt: string | null;
};

class RequestValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function optionalText(
  value: unknown,
  fieldLabel: string,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new RequestValidationError(`${fieldLabel} must be text`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new RequestValidationError(
      `${fieldLabel} must be ${maxLength} characters or fewer`,
    );
  }

  return trimmed;
}

function isBasicEmail(value: string): boolean {
  const separatorIndex = value.indexOf("@");

  if (
    separatorIndex <= 0 ||
    separatorIndex !== value.lastIndexOf("@")
  ) {
    return false;
  }

  const domain = value.slice(separatorIndex + 1);

  return domain.includes(".") && !value.includes(" ");
}

function parseCuratedRecordingIds(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new RequestValidationError(
      "Curated recording IDs must be an array",
    );
  }

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      throw new RequestValidationError(
        "Curated recording IDs must be strings",
      );
    }

    const recordingId = item.trim();

    if (
      recordingId.length === 0 ||
      recordingId.length > 80
    ) {
      throw new RequestValidationError(
        "Invalid curated recording ID",
      );
    }

    if (!seen.has(recordingId)) {
      seen.add(recordingId);
      ids.push(recordingId);
    }
  }

  if (ids.length > 50) {
    throw new RequestValidationError(
      "A curated share link may contain at most 50 recordings",
    );
  }

  return ids;
}

function parseCreateBody(bodyUnknown: unknown): ParsedCreateBody {
  if (!isRecord(bodyUnknown)) {
    throw new RequestValidationError("Invalid share-link request");
  }

  const recipientName = optionalText(
    bodyUnknown.recipientName,
    "Recipient / entity",
    160,
  );

  const recipientEmail = optionalText(
    bodyUnknown.recipientEmail,
    "Recipient email",
    254,
  );

  if (recipientEmail && !isBasicEmail(recipientEmail)) {
    throw new RequestValidationError("Recipient email is invalid");
  }

  const label = optionalText(
    bodyUnknown.label,
    "Internal label",
    200,
  );

  const welcomeMessage = optionalText(
    bodyUnknown.welcomeMessage,
    "Welcome message",
    600,
  );

  const expiresAt = optionalText(
    bodyUnknown.expiresAt,
    "Expiry",
    100,
  );

  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
    throw new RequestValidationError("Expiry date is invalid");
  }

  return {
    recipientName,
    recipientEmail,
    label,
    welcomeMessage,
    curatedRecordingIds: parseCuratedRecordingIds(
      bodyUnknown.curatedRecordingIds,
    ),
    expiresAt,
  };
}

function getCreatedBy(req: NextApiRequest): string | null {
  const authHeader = req.headers.authorization ?? "";
  const [scheme, encoded] = authHeader.split(" ");

  if (scheme !== "Basic" || !encoded) {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex === -1) {
      return null;
    }

    const user = decoded.slice(0, separatorIndex).trim();
    return user.length > 0 ? user : null;
  } catch {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetResponse | PostResponse | ErrorResponse>,
): Promise<void> {
  if (req.method === "GET") {
    try {
      const links = await listCatalogueShareLinks(50);
      res.status(200).json({ ok: true, links });
      return;
    } catch {
      res.status(500).json({
        ok: false,
        error: "Failed to load share links",
      });
      return;
    }
  }

  if (req.method === "POST") {
    try {
      const body = parseCreateBody(req.body);
      const publicBaseUrl =
        process.env.CATALOGUE_PUBLIC_BASE_URL?.trim();

      if (!publicBaseUrl) {
        res.status(500).json({
          ok: false,
          error: "Missing CATALOGUE_PUBLIC_BASE_URL",
        });
        return;
      }

      if (body.curatedRecordingIds.length > 0) {
        const currentRecords = await listCatalogueRecords();
        const currentIds = new Set(
          currentRecords.map((record) => record.recordingId),
        );

        const invalidIds = body.curatedRecordingIds.filter(
          (recordingId) => !currentIds.has(recordingId),
        );

        if (invalidIds.length > 0) {
          throw new RequestValidationError(
            `Curated recording is not in the current catalogue: ${invalidIds[0]}`,
          );
        }
      }

      const { link, rawToken } = await createCatalogueShareLink({
        ...body,
        createdBy: getCreatedBy(req),
      });

      const shareUrl = new URL(publicBaseUrl);
      shareUrl.searchParams.set("st", rawToken);

      res.status(200).json({
        ok: true,
        link,
        shareUrl: shareUrl.toString(),
      });
      return;
    } catch (error) {
      if (error instanceof RequestValidationError) {
        res.status(400).json({
          ok: false,
          error: error.message,
        });
        return;
      }

      console.error("[catalogue share admin] create failed", {
        error:
          error instanceof Error
            ? error.message
            : "Unknown share-link creation error",
      });

      res.status(500).json({
        ok: false,
        error: "Failed to create share link",
      });
      return;
    }
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({
    ok: false,
    error: "Method not allowed",
  });
}
