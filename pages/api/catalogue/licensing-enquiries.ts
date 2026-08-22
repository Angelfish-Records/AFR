import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { getCatalogueApiAttributionContext } from "@/lib/catalogue/access";
import {
  consumeCatalogueLicensingRateLimit,
  isCatalogueLicensingHoneypotTriggered,
  isCatalogueLicensingJsonRequest,
  isCatalogueLicensingPayloadTooLarge,
  isCatalogueLicensingSameOriginRequest,
} from "@/lib/catalogue/licensingEnquiryAbuse";
import {
  markCatalogueLicensingNotificationFailed,
  markCatalogueLicensingNotificationSent,
  persistCatalogueLicensingEnquiry,
  type CatalogueLicensingTrackSnapshot,
} from "@/lib/catalogue/licensingEnquiries";
import { sendCatalogueLicensingNotification } from "@/lib/catalogue/licensingEnquiryNotification";
import type {
  CatalogueLicensingEnquiryRequest,
  CatalogueLicensingEnquiryResponse,
  CatalogueLicensingRightsRequest,
} from "@/lib/catalogue/licensingEnquiryTypes";
import { listCatalogueRecords } from "@/lib/catalogue/queries";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16kb",
    },
  },
};

type ParseResult =
  | {
      ok: true;
      value: CatalogueLicensingEnquiryRequest;
    }
  | {
      ok: false;
      error: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseText(
  body: Record<string, unknown>,
  key: string,
  maxLength: number,
  required: boolean,
): string | null {
  const value = body[key];

  if (typeof value !== "string") {
    return required ? null : "";
  }

  const trimmed = value.trim();

  if (required && trimmed.length === 0) {
    return null;
  }

  if (trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

function isValidEmail(value: string): boolean {
  if (value.length < 3 || value.length > 254) {
    return false;
  }

  const at = value.indexOf("@");

  if (at <= 0 || at !== value.lastIndexOf("@")) {
    return false;
  }

  const dot = value.lastIndexOf(".");
  return dot > at + 1 && dot < value.length - 1;
}

function parseRightsRequest(
  value: unknown,
): CatalogueLicensingRightsRequest | null {
  if (value === "full_sync" || value === "master_only") {
    return value;
  }

  return null;
}

function parseRequest(bodyUnknown: unknown): ParseResult {
  if (!isObject(bodyUnknown)) {
    return {
      ok: false,
      error: "Invalid request body",
    };
  }

  const body = bodyUnknown;

  const clientRequestId = parseText(body, "clientRequestId", 120, true);
  const requesterName = parseText(body, "requesterName", 160, true);
  const requesterEmailRaw = parseText(body, "requesterEmail", 254, true);
  const company = parseText(body, "company", 200, false);
  const projectName = parseText(body, "projectName", 200, true);
  const mediumUse = parseText(body, "mediumUse", 300, true);
  const territory = parseText(body, "territory", 200, true);
  const termTimeframe = parseText(body, "termTimeframe", 300, true);
  const budget = parseText(body, "budget", 200, false);
  const deadline = parseText(body, "deadline", 200, false);
  const notes = parseText(body, "notes", 4000, false);
  const rightsRequest = parseRightsRequest(body.rightsRequest);

  if (
    !clientRequestId ||
    !/^catreq_[A-Za-z0-9_-]{16,110}$/.test(clientRequestId)
  ) {
    return {
      ok: false,
      error: "Invalid request id",
    };
  }

  if (
    !requesterName ||
    !requesterEmailRaw ||
    !projectName ||
    !mediumUse ||
    !territory ||
    !termTimeframe ||
    company === null ||
    budget === null ||
    deadline === null ||
    notes === null ||
    !rightsRequest
  ) {
    return {
      ok: false,
      error: "Please complete the required enquiry fields",
    };
  }

  const requesterEmail = requesterEmailRaw.toLowerCase();

  if (!isValidEmail(requesterEmail)) {
    return {
      ok: false,
      error: "Please enter a valid email address",
    };
  }

  const recordingIdsUnknown = body.recordingIds;

  if (!Array.isArray(recordingIdsUnknown)) {
    return {
      ok: false,
      error: "No catalogue recordings were selected",
    };
  }

  const recordingIds: string[] = [];

  for (const value of recordingIdsUnknown) {
    if (typeof value !== "string") {
      return {
        ok: false,
        error: "Invalid recording selection",
      };
    }

    const recordingId = value.trim();

    if (!recordingId || recordingId.length > 80) {
      return {
        ok: false,
        error: "Invalid recording selection",
      };
    }

    if (!recordingIds.includes(recordingId)) {
      recordingIds.push(recordingId);
    }
  }

  if (recordingIds.length === 0 || recordingIds.length > 20) {
    return {
      ok: false,
      error: "Select between 1 and 20 catalogue recordings",
    };
  }

  return {
    ok: true,
    value: {
      clientRequestId,
      recordingIds,
      requesterName,
      requesterEmail,
      company,
      projectName,
      mediumUse,
      territory,
      termTimeframe,
      rightsRequest,
      budget,
      deadline,
      notes,
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CatalogueLicensingEnquiryResponse>,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");

  if (!isCatalogueLicensingJsonRequest(req)) {
    res.status(415).json({
      ok: false,
      error: "Content-Type must be application/json",
    });
    return;
  }

  if (isCatalogueLicensingPayloadTooLarge(req)) {
    res.status(413).json({
      ok: false,
      error: "Licensing enquiry is too large",
    });
    return;
  }

  if (!isCatalogueLicensingSameOriginRequest(req)) {
    res.status(403).json({
      ok: false,
      error: "Cross-origin licensing submissions are not accepted",
    });
    return;
  }

  if (isCatalogueLicensingHoneypotTriggered(req.body)) {
    res.status(200).json({
      ok: true,
      enquiryId: crypto.randomUUID(),
    });
    return;
  }

  const parsed = parseRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({
      ok: false,
      error: parsed.error,
    });
    return;
  }

  try {
    const rateLimit =
      await consumeCatalogueLicensingRateLimit(req);

    if (!rateLimit.allowed) {
      res.setHeader(
        "Retry-After",
        String(rateLimit.retryAfterSeconds),
      );

      res.status(429).json({
        ok: false,
        error:
          "Too many licensing enquiries from this network. Please try again later.",
      });
      return;
    }

    const catalogueRecords = await listCatalogueRecords();

    const recordById = new Map(
      catalogueRecords.map((record) => [record.recordingId, record]),
    );

    const tracks: CatalogueLicensingTrackSnapshot[] = [];

    for (let index = 0; index < parsed.value.recordingIds.length; index++) {
      const recordingId = parsed.value.recordingIds[index];
      const record = recordById.get(recordingId);

      if (!record) {
        res.status(400).json({
          ok: false,
          error:
            "One or more selected recordings are not in the current catalogue",
        });
        return;
      }

      tracks.push({
        recordingId: record.recordingId,
        title: record.title,
        artistName: record.artistName,
        position: index,
      });
    }

    const attribution =
      await getCatalogueApiAttributionContext(req);

    const persisted = await persistCatalogueLicensingEnquiry({
      submission: parsed.value,
      shareLinkId: attribution.shareLink?.id ?? null,
      tracks,
    });

    if (persisted.notificationStatus === "sent") {
      res.status(200).json({
        ok: true,
        enquiryId: persisted.id,
      });
      return;
    }

    try {
      const resendMessageId = await sendCatalogueLicensingNotification({
        enquiryId: persisted.id,
        submission: parsed.value,
        tracks,
        shareLink: attribution.shareLink,
      });

      await markCatalogueLicensingNotificationSent(
        persisted.id,
        resendMessageId,
      );

      res.status(200).json({
        ok: true,
        enquiryId: persisted.id,
      });
      return;
    } catch (notificationError) {
      const message =
        notificationError instanceof Error
          ? notificationError.message
          : String(notificationError);

      try {
        await markCatalogueLicensingNotificationFailed(
          persisted.id,
          message,
        );
      } catch (markError) {
        console.error(
          "[catalogue licensing] failed to record notification failure",
          {
            enquiryId: persisted.id,
            error: markError,
          },
        );
      }

      console.error("[catalogue licensing] notification failed", {
        enquiryId: persisted.id,
        error: notificationError,
      });

      res.status(503).json({
        ok: false,
        persisted: true,
        error:
          "Your enquiry was saved, but notification delivery is delayed. Please try again.",
      });
      return;
    }
  } catch (error) {
    console.error("[catalogue licensing] enquiry submission failed", error);

    res.status(500).json({
      ok: false,
      error: "Unable to submit the licensing enquiry",
    });
  }
}
