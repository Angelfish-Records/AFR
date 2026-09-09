"use client";

import React from "react";
import { useCataloguePlayback } from "@/components/catalogue/CataloguePlaybackProvider";
import styles from "@/styles/catalogue.module.css";

type Props = {
  recordingId: string;
  hasInstrumentalPlayback?: boolean;
  size?: "default" | "large";
};

export default function CataloguePreviewButton(props: Props) {
  const {
    recordingId,
    hasInstrumentalPlayback = false,
    size = "default",
  } = props;
  const { state, isRecordingActive, toggle } = useCataloguePlayback();

  const isFullActive = isRecordingActive(recordingId, "full");
  const isClipActive = isRecordingActive(recordingId, "clip");
  const isInstrumentalActive = isRecordingActive(recordingId, "instrumental");

  const isFullLoading = isFullActive && state.status === "loading";
  const isClipLoading = isClipActive && state.status === "loading";
  const isInstrumentalLoading =
    isInstrumentalActive && state.status === "loading";

  const isFullPlaying = isFullActive && state.status === "playing";
  const isClipPlaying = isClipActive && state.status === "playing";
  const isInstrumentalPlaying =
    isInstrumentalActive && state.status === "playing";

  const isFullError = isFullActive && state.status === "error";
  const isClipError = isClipActive && state.status === "error";
  const isInstrumentalError = isInstrumentalActive && state.status === "error";

  const fullLabel = isFullPlaying
    ? "Pause"
    : isFullError
      ? "Retry"
      : "Original";

  const clipLabel = isClipPlaying ? "Pause" : isClipError ? "Retry" : "Clip";

  const instrumentalLabel = isInstrumentalPlaying
    ? "Pause"
    : isInstrumentalError
      ? "Retry"
      : "Inst.";

  const fullAriaLabel = isFullLoading
    ? `Loading original for ${recordingId}`
    : `${
        isFullPlaying ? "Pause" : isFullError ? "Retry" : "Play"
      } original for ${recordingId}`;

  const clipAriaLabel = isClipLoading
    ? `Loading 30 second instrumental clip for ${recordingId}`
    : `${
        isClipPlaying ? "Pause" : isClipError ? "Retry" : "Play"
      } 30 second instrumental clip for ${recordingId}`;

  const instrumentalAriaLabel = isInstrumentalLoading
    ? `Loading instrumental for ${recordingId}`
    : `${instrumentalLabel} instrumental for ${recordingId}`;

  return (
    <div
      className={`${styles.previewButtonGroup} ${
        size === "large" ? styles.previewButtonGroupLarge : ""
      }`}
    >
      {hasInstrumentalPlayback ? (
        <>
          <button
            type="button"
            className={`${styles.previewButton} ${
              isInstrumentalPlaying ? styles.previewButtonActive : ""
            } ${isInstrumentalLoading ? styles.previewButtonLoading : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              void toggle(recordingId, "instrumental");
            }}
            aria-label={instrumentalAriaLabel}
            aria-busy={isInstrumentalLoading}
          >
            <span className={styles.previewButtonIcon}>
              <span className={styles.previewButtonGlyph}>
                {isInstrumentalPlaying ? "❚❚" : "◇"}
              </span>
            </span>

            <span className={styles.previewButtonLabel}>
              {instrumentalLabel}
            </span>
          </button>

          <button
            type="button"
            className={`${styles.previewButton} ${
              styles.previewButtonSecondary
            } ${isClipPlaying ? styles.previewButtonActive : ""} ${
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

            <span className={styles.previewButtonLabel}>{clipLabel}</span>
          </button>
        </>
      ) : null}

      <button
        type="button"
        className={`${styles.previewButton} ${styles.previewButtonSecondary} ${
          isFullPlaying ? styles.previewButtonActive : ""
        } ${isFullLoading ? styles.previewButtonLoading : ""}`}
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

        <span className={styles.previewButtonLabel}>{fullLabel}</span>
      </button>
    </div>
  );
}
