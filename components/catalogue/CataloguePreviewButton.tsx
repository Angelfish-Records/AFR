"use client";

import React from "react";
import { useCataloguePlayback } from "@/components/catalogue/CataloguePlaybackProvider";
import styles from "@/styles/catalogue.module.css";

type Props = {
  recordingId: string;
  size?: "default" | "large";
};

export default function CataloguePreviewButton(props: Props) {
  const { recordingId, size = "default" } = props;
  const { state, isRecordingActive, toggle } = useCataloguePlayback();

  const isFullActive = isRecordingActive(recordingId, "full");
  const isClipActive = isRecordingActive(recordingId, "clip");

  const isFullLoading =
    isFullActive && state.status === "loading";

  const isClipLoading =
    isClipActive && state.status === "loading";

  const isFullPlaying =
    isFullActive && state.status === "playing";

  const isClipPlaying =
    isClipActive && state.status === "playing";

  const isFullError =
    isFullActive && state.status === "error";

  const isClipError =
    isClipActive && state.status === "error";

  const fullLabel = isFullPlaying
    ? "Pause"
    : isFullError
      ? "Retry"
      : "Full";

  const clipLabel = isClipPlaying
    ? "Pause"
    : isClipError
      ? "Retry"
      : "Clip";

  const fullAriaLabel = isFullLoading
    ? `Loading full track for ${recordingId}`
    : `${fullLabel} full track for ${recordingId}`;

  const clipAriaLabel = isClipLoading
    ? `Loading 30 second clip for ${recordingId}`
    : `${clipLabel} 30 second clip for ${recordingId}`;

  return (
    <div
      className={`${styles.previewButtonGroup} ${
        size === "large"
          ? styles.previewButtonGroupLarge
          : ""
      }`}
    >
      <button
        type="button"
        className={`${styles.previewButton} ${
          isFullPlaying ? styles.previewButtonActive : ""
        } ${
          isFullLoading ? styles.previewButtonLoading : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          void toggle(recordingId, "full");
        }}
        aria-label={fullAriaLabel}
        aria-busy={isFullLoading}
      >
        <span className={styles.previewButtonIcon}>
          <span className={styles.previewButtonGlyph}>
            {isFullPlaying ? "❚❚" : "▶"}
          </span>
        </span>

        <span className={styles.previewButtonLabel}>
          {fullLabel}
        </span>
      </button>

      <button
        type="button"
        className={`${styles.previewButton} ${
          styles.previewButtonSecondary
        } ${
          isClipPlaying ? styles.previewButtonActive : ""
        } ${
          isClipLoading ? styles.previewButtonLoading : ""
        }`}
        onClick={(event) => {
          event.stopPropagation();
          void toggle(recordingId, "clip");
        }}
        aria-label={clipAriaLabel}
        aria-busy={isClipLoading}
      >
        <span className={styles.previewButtonIcon}>
          <span className={styles.previewButtonGlyph}>
            {isClipPlaying ? "❚❚" : "✦"}
          </span>
        </span>

        <span className={styles.previewButtonLabel}>
          {clipLabel}
        </span>
      </button>
    </div>
  );
}
