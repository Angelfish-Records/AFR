"use client";

import {
  useCallback,
  useRef,
} from "react";
import type {
  CatalogueEngagementEventType,
  CatalogueEngagementEventRequest,
} from "@/lib/catalogue/engagementTypes";

type TrackOptions = {
  recordingId?: string;
  selectionCount?: number;
};

function createUuid(): string | null {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return null;
}

export function useCatalogueEngagement(
  shareToken: string | null,
): {
  trackEvent: (
    eventType: CatalogueEngagementEventType,
    options?: TrackOptions,
  ) => void;
} {
  const sessionIdRef = useRef<string | null>(null);

  const getSessionId = useCallback((): string | null => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = createUuid();
    }

    return sessionIdRef.current;
  }, []);

  const trackEvent = useCallback(
    (
      eventType: CatalogueEngagementEventType,
      options: TrackOptions = {},
    ): void => {
      if (typeof window === "undefined") {
        return;
      }

      const sessionId = getSessionId();
      const clientEventId = createUuid();

      if (!sessionId || !clientEventId) {
        return;
      }

      const payload: CatalogueEngagementEventRequest = {
        clientEventId,
        sessionId,
        eventType,
        recordingId: options.recordingId ?? null,
        selectionCount: options.selectionCount ?? null,
      };

      const url = new URL(
        "/api/catalogue/events",
        window.location.origin,
      );

      if (shareToken) {
        url.searchParams.set("st", shareToken);
      }

      void fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        keepalive: true,
      }).catch(() => {
        // Engagement telemetry is best-effort and must not affect UX.
      });
    },
    [getSessionId, shareToken],
  );

  return {
    trackEvent,
  };
}
