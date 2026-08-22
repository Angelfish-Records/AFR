import type { NextApiRequest, NextApiResponse } from "next";
import { getCatalogueApiAttributionContext } from "@/lib/catalogue/access";
import {
  isRecordingEngagementEvent,
  persistCatalogueEngagementEvent,
} from "@/lib/catalogue/engagement";
import {
  CATALOGUE_ENGAGEMENT_EVENT_TYPES,
  type CatalogueEngagementEventRequest,
  type CatalogueEngagementEventType,
} from "@/lib/catalogue/engagementTypes";
import { getCatalogueRecordByRecordingId } from "@/lib/catalogue/queries";

type EventResponse =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

type ParseResult =
  | {
      ok: true;
      value: CatalogueEngagementEventRequest;
    }
  | {
      ok: false;
      error: string;
    };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isEventType(
  value: string,
): value is CatalogueEngagementEventType {
  return CATALOGUE_ENGAGEMENT_EVENT_TYPES.some(
    (candidate) => candidate === value,
  );
}

function parseRequest(bodyUnknown: unknown): ParseResult {
  if (!isObject(bodyUnknown)) {
    return {
      ok: false,
      error: "Invalid event payload",
    };
  }

  const clientEventId =
    typeof bodyUnknown.clientEventId === "string"
      ? bodyUnknown.clientEventId.trim()
      : "";

  const sessionId =
    typeof bodyUnknown.sessionId === "string"
      ? bodyUnknown.sessionId.trim()
      : "";

  const eventTypeRaw =
    typeof bodyUnknown.eventType === "string"
      ? bodyUnknown.eventType.trim()
      : "";

  const recordingId =
    typeof bodyUnknown.recordingId === "string"
      ? bodyUnknown.recordingId.trim()
      : null;

  const selectionCount =
    typeof bodyUnknown.selectionCount === "number" &&
    Number.isInteger(bodyUnknown.selectionCount)
      ? bodyUnknown.selectionCount
      : null;

  if (!isUuid(clientEventId) || !isUuid(sessionId)) {
    return {
      ok: false,
      error: "Invalid event identifier",
    };
  }

  if (!isEventType(eventTypeRaw)) {
    return {
      ok: false,
      error: "Unsupported catalogue event",
    };
  }

  if (isRecordingEngagementEvent(eventTypeRaw)) {
    if (
      !recordingId ||
      recordingId.length > 80 ||
      selectionCount !== null
    ) {
      return {
        ok: false,
        error: "Invalid recording event",
      };
    }
  } else if (eventTypeRaw === "licensing_open") {
    if (
      recordingId !== null ||
      selectionCount === null ||
      selectionCount < 1 ||
      selectionCount > 20
    ) {
      return {
        ok: false,
        error: "Invalid licensing event",
      };
    }
  } else if (
    recordingId !== null ||
    selectionCount !== null
  ) {
    return {
      ok: false,
      error: "Invalid catalogue event shape",
    };
  }

  return {
    ok: true,
    value: {
      clientEventId,
      sessionId,
      eventType: eventTypeRaw,
      recordingId,
      selectionCount,
    },
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EventResponse>,
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

  const parsed = parseRequest(req.body);

  if (!parsed.ok) {
    res.status(400).json({
      ok: false,
      error: parsed.error,
    });
    return;
  }

  try {
    let recordingTitle: string | null = null;

    if (
      isRecordingEngagementEvent(parsed.value.eventType) &&
      parsed.value.recordingId
    ) {
      const record = await getCatalogueRecordByRecordingId(
        parsed.value.recordingId,
      );

      if (!record) {
        res.status(400).json({
          ok: false,
          error: "Recording is not in the current catalogue",
        });
        return;
      }

      recordingTitle = record.title;
    }

    const attribution =
      await getCatalogueApiAttributionContext(req);

    await persistCatalogueEngagementEvent({
      ...parsed.value,
      shareLinkId: attribution.shareLink?.id ?? null,
      recordingTitle,
    });

    res.status(202).json({
      ok: true,
    });
  } catch (error) {
    console.error("[catalogue engagement] event ingestion failed", {
      eventType: parsed.value.eventType,
      recordingId: parsed.value.recordingId,
      error:
        error instanceof Error
          ? error.message
          : "Unknown engagement ingestion error",
    });

    res.status(500).json({
      ok: false,
      error: "Unable to record catalogue event",
    });
  }
}
