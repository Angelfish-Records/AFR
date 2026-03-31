"use client";

import React from "react";
import CataloguePreviewButton from "@/components/catalogue/CataloguePreviewButton";
import { useCataloguePlayback } from "@/components/catalogue/CataloguePlaybackProvider";
import styles from "@/styles/catalogue.module.css";

type Props = {
  recordingId: string;
  duration?: string | null;
  previewStartSeconds?: number | null;
};

function formatSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function CataloguePlaybackTransport(props: Props) {
  const { recordingId, duration = null, previewStartSeconds = null } = props;
  const { state, seekTo } = useCataloguePlayback();

  const isActive = state.activeRecordingId === recordingId;
  const currentTime = isActive ? state.currentTimeSeconds : 0;
  const durationSeconds =
    isActive && state.durationSeconds !== null ? state.durationSeconds : null;

  const scrubberRef = React.useRef<HTMLDivElement | null>(null);
  const isDraggingRef = React.useRef(false);

  const seekFromClientX = React.useCallback(
    (clientX: number) => {
      const scrubber = scrubberRef.current;

      if (
        !scrubber ||
        !isActive ||
        durationSeconds === null ||
        durationSeconds <= 0
      ) {
        return;
      }

      const rect = scrubber.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const ratio = Math.min(Math.max(relativeX / rect.width, 0), 1);
      seekTo(ratio * durationSeconds);
    },
    [durationSeconds, isActive, seekTo],
  );

  const beginDrag = React.useCallback(
    (clientX: number) => {
      if (!isActive || durationSeconds === null || durationSeconds <= 0) {
        return;
      }

      isDraggingRef.current = true;
      seekFromClientX(clientX);
    },
    [durationSeconds, isActive, seekFromClientX],
  );

  const handlePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isActive || durationSeconds === null || durationSeconds <= 0) {
        return;
      }

      event.preventDefault();
      beginDrag(event.clientX);
    },
    [beginDrag, durationSeconds, isActive],
  );

  const handleSeekKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isActive || durationSeconds === null || durationSeconds <= 0) {
        return;
      }

      const stepSeconds = Math.max(durationSeconds / 20, 5);

      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        seekTo(currentTime + stepSeconds);
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        seekTo(currentTime - stepSeconds);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        seekTo(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        seekTo(durationSeconds);
      }
    },
    [currentTime, durationSeconds, isActive, seekTo],
  );

  React.useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      if (!isDraggingRef.current) {
        return;
      }

      seekFromClientX(event.clientX);
    }

    function endDrag(): void {
      isDraggingRef.current = false;
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [seekFromClientX]);

  const progressPercent =
    durationSeconds && durationSeconds > 0
      ? Math.min(100, (currentTime / durationSeconds) * 100)
      : 0;

  const clipStartPercent =
    durationSeconds &&
    durationSeconds > 0 &&
    previewStartSeconds !== null &&
    previewStartSeconds >= 0
      ? Math.min(100, (previewStartSeconds / durationSeconds) * 100)
      : null;

  const clipEndPercent =
    isActive &&
    durationSeconds &&
    durationSeconds > 0 &&
    state.clipEndSeconds !== null
      ? Math.min(100, (state.clipEndSeconds / durationSeconds) * 100)
      : clipStartPercent !== null && durationSeconds
        ? Math.min(
            100,
            (((previewStartSeconds ?? 0) + 30) / durationSeconds) * 100,
          )
        : null;

  const statusLabel = isActive
    ? state.status === "loading"
      ? "Loading audio…"
      : state.status === "error"
        ? (state.errorMessage ?? "Playback failed")
        : state.status === "playing"
          ? state.activeMode === "clip"
            ? "Playing preview clip"
            : "Playing full track"
          : state.status === "paused"
            ? "Paused"
            : "Ready"
    : "Ready";

  return (
    <div className={styles.transportShell}>
      <div className={styles.transportTopRow}>
        <CataloguePreviewButton recordingId={recordingId} />
        <div className={styles.transportMeta}>
          <div className={styles.transportStatus}>{statusLabel}</div>
          <div className={styles.transportTiming}>
            <span>{formatSeconds(currentTime)}</span>
            <span>
              {duration ??
                (durationSeconds ? formatSeconds(durationSeconds) : "—")}
            </span>
          </div>
        </div>
      </div>

      <div
        ref={scrubberRef}
        className={`${styles.transportBarShell} ${
          !isActive || durationSeconds === null || durationSeconds <= 0
            ? styles.transportBarShellDisabled
            : ""
        }`}
        role="slider"
        tabIndex={
          !isActive || durationSeconds === null || durationSeconds <= 0 ? -1 : 0
        }
        onPointerDown={handlePointerDown}
        onKeyDown={handleSeekKeyDown}
        aria-label={`Seek within ${recordingId}`}
        aria-valuemin={0}
        aria-valuemax={durationSeconds ?? 0}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={`${formatSeconds(currentTime)} of ${
          durationSeconds !== null ? formatSeconds(durationSeconds) : "0:00"
        }`}
      >
        <div className={styles.transportBarTrack} />
        {clipStartPercent !== null && clipEndPercent !== null ? (
          <div
            className={styles.transportBarClip}
            style={{
              left: `${clipStartPercent}%`,
              width: `${Math.max(0, clipEndPercent - clipStartPercent)}%`,
            }}
          />
        ) : null}
        <div
          className={styles.transportBarProgress}
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className={styles.transportBarThumb}
          style={{ left: `${progressPercent}%` }}
        />
      </div>

      {previewStartSeconds !== null ? (
        <div className={styles.transportFootnote}>
          Clip starts at {formatSeconds(previewStartSeconds)}.
        </div>
      ) : null}
    </div>
  );
}
