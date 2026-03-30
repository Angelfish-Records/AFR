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
  const { state } = useCataloguePlayback();

  const isActive = state.activeRecordingId === recordingId;
  const currentTime = isActive ? state.currentTimeSeconds : 0;
  const durationSeconds =
    isActive && state.durationSeconds !== null ? state.durationSeconds : null;

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
      ? Math.min(100, ((previewStartSeconds ?? 0) + 30) / durationSeconds * 100)
      : null;

  const statusLabel = isActive
    ? state.status === "loading"
      ? "Loading audio…"
      : state.status === "error"
      ? state.errorMessage ?? "Playback failed"
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
            <span>{duration ?? (durationSeconds ? formatSeconds(durationSeconds) : "—")}</span>
          </div>
        </div>
      </div>

      <div className={styles.transportBarShell} aria-hidden="true">
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
      </div>

      {previewStartSeconds !== null ? (
        <div className={styles.transportFootnote}>
          Impact moment preview starts at {formatSeconds(previewStartSeconds)}.
        </div>
      ) : null}
    </div>
  );
}