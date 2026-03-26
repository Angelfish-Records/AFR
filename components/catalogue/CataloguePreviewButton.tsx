"use client";

import React from "react";
import Hls from "hls.js";
import styles from "@/styles/catalogue.module.css";

type PreviewResponse =
  | {
      ok: true;
      playbackUrl: string;
      expiresAt: number;
      clipStartSeconds: number;
      clipLengthSeconds: number;
    }
  | {
      ok: false;
      error: string;
    };

type Props = {
  recordingId: string;
  accessToken?: string | null;
};

type PreviewStatus = "idle" | "loading" | "playing-full" | "playing-clip" | "paused" | "error";
type PreviewMode = "full" | "clip";

type PreviewPlayEventDetail = {
  recordingId: string;
};

const PREVIEW_PLAY_EVENT = "afr-catalogue-preview-play";

export default function CataloguePreviewButton(props: Props) {
  const { recordingId, accessToken = null } = props;

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const sourceUrlRef = React.useRef<string | null>(null);
  const clipStartRef = React.useRef<number>(0);
  const clipEndRef = React.useRef<number | null>(null);

  const [status, setStatus] = React.useState<PreviewStatus>("idle");

  const teardownHls = React.useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {
        // ignore
      }
      hlsRef.current = null;
    }
  }, []);

  const pauseAudio = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    try {
      audio.pause();
    } catch {
      // ignore
    }
  }, []);

  const attachSource = React.useCallback(
    async (playbackUrl: string): Promise<void> => {
      const audio = audioRef.current;
      if (!audio) {
        throw new Error("Audio element unavailable");
      }

      if (sourceUrlRef.current === playbackUrl) {
        return;
      }

      teardownHls();
      sourceUrlRef.current = playbackUrl;

      await new Promise<void>((resolve, reject) => {
        const cleanupNativeListeners = () => {
          audio.removeEventListener("canplay", onNativeReady);
          audio.removeEventListener("error", onNativeError);
        };

        const onNativeReady = () => {
          cleanupNativeListeners();
          resolve();
        };

        const onNativeError = () => {
          cleanupNativeListeners();
          reject(new Error("Failed to load preview"));
        };

        if (audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.addEventListener("canplay", onNativeReady);
          audio.addEventListener("error", onNativeError);
          audio.src = playbackUrl;
          audio.load();
          return;
        }

        if (!Hls.isSupported()) {
          reject(new Error("HLS is not supported in this browser"));
          return;
        }

        const hls = new Hls();
        hlsRef.current = hls;

        const cleanupHlsListeners = () => {
          hls.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
          hls.off(Hls.Events.ERROR, onHlsError);
        };

        const onManifestParsed = () => {
          cleanupHlsListeners();
          resolve();
        };

        const onHlsError = (_event: string, data: { fatal?: boolean }) => {
          if (!data?.fatal) {
            return;
          }

          cleanupHlsListeners();
          reject(new Error("Failed to load preview"));
        };

        hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        hls.on(Hls.Events.ERROR, onHlsError);

        hls.loadSource(playbackUrl);
        hls.attachMedia(audio);
      });
    },
    [teardownHls]
  );

  const fetchPreview = React.useCallback(async (): Promise<void> => {
    const params = new URLSearchParams();

    if (accessToken) {
      params.set("t", accessToken);
    }

    const query = params.toString();
    const url = `/api/catalogue/preview/${encodeURIComponent(recordingId)}${
      query ? `?${query}` : ""
    }`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as PreviewResponse;

    if (!response.ok || !payload.ok) {
      throw new Error(
        response.ok && !payload.ok ? payload.error : "Failed to load preview"
      );
    }

    clipStartRef.current = payload.clipStartSeconds;
    clipEndRef.current = payload.clipStartSeconds + payload.clipLengthSeconds;
    await attachSource(payload.playbackUrl);
  }, [accessToken, attachSource, recordingId]);

  const startPlayback = React.useCallback(
    async (mode: PreviewMode) => {
      const audio = audioRef.current;
      if (!audio || status === "loading") {
        return;
      }

      const isPlayingTargetMode =
        (mode === "full" && status === "playing-full") ||
        (mode === "clip" && status === "playing-clip");

      if (isPlayingTargetMode) {
        pauseAudio();
        setStatus("paused");
        return;
      }

      try {
        setStatus("loading");

        if (!sourceUrlRef.current) {
          await fetchPreview();
        }

        window.dispatchEvent(
          new CustomEvent<PreviewPlayEventDetail>(PREVIEW_PLAY_EVENT, {
            detail: { recordingId },
          })
        );

        audio.currentTime = mode === "full" ? 0 : clipStartRef.current;
        await audio.play();
        setStatus(mode === "full" ? "playing-full" : "playing-clip");
      } catch {
        setStatus("error");
      }
    },
    [fetchPreview, pauseAudio, recordingId, status]
  );

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTimeUpdate = () => {
      if (status !== "playing-clip") {
        return;
      }

      const clipEnd = clipEndRef.current;

      if (clipEnd !== null && audio.currentTime >= clipEnd) {
        audio.pause();
        setStatus("paused");
      }
    };

    const onPause = () => {
      setStatus((current) => (current === "loading" ? current : "paused"));
    };

    const onEnded = () => {
      setStatus("paused");
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [status]);

  React.useEffect(() => {
    const onOtherPreviewPlay = (event: Event) => {
      const customEvent = event as CustomEvent<PreviewPlayEventDetail>;
      const nextRecordingId = customEvent.detail?.recordingId;

      if (!nextRecordingId || nextRecordingId === recordingId) {
        return;
      }

      pauseAudio();
      setStatus((current) =>
        current === "playing-full" ||
        current === "playing-clip" ||
        current === "loading"
          ? "paused"
          : current
      );
    };

    window.addEventListener(PREVIEW_PLAY_EVENT, onOtherPreviewPlay);

    return () => {
      window.removeEventListener(PREVIEW_PLAY_EVENT, onOtherPreviewPlay);
    };
  }, [pauseAudio, recordingId]);

  React.useEffect(() => {
    return () => {
      pauseAudio();
      teardownHls();
    };
  }, [pauseAudio, teardownHls]);

  const fullLabel =
    status === "loading"
      ? "Loading"
      : status === "playing-full"
      ? "Pause"
      : status === "error"
      ? "Retry"
      : "Full";

  const clipLabel =
    status === "loading"
      ? "Loading"
      : status === "playing-clip"
      ? "Pause"
      : status === "error"
      ? "Retry"
      : "Clip";

  return (
    <>
      <div className={styles.previewButtonGroup}>
        <button
          type="button"
          className={`${styles.previewButton} ${
            status === "playing-full" ? styles.previewButtonActive : ""
          }`}
          onClick={() => void startPlayback("full")}
          aria-label={`${fullLabel} full track for ${recordingId}`}
        >
          <span className={styles.previewButtonIcon}>
            {status === "playing-full" ? "❚❚" : "▶"}
          </span>
          <span className={styles.previewButtonLabel}>{fullLabel}</span>
        </button>

        <button
          type="button"
          className={`${styles.previewButton} ${styles.previewButtonSecondary} ${
            status === "playing-clip" ? styles.previewButtonActive : ""
          }`}
          onClick={() => void startPlayback("clip")}
          aria-label={`${clipLabel} 30 second clip for ${recordingId}`}
        >
          <span className={styles.previewButtonIcon}>
            {status === "playing-clip" ? "❚❚" : "✦"}
          </span>
          <span className={styles.previewButtonLabel}>{clipLabel}</span>
        </button>
      </div>

      <audio ref={audioRef} preload="metadata" style={{ display: "none" }} />
    </>
  );
}