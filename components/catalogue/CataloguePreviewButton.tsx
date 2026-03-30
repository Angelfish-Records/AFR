// components/catalogue/CataloguePreviewButton.tsx
"use client";

import React from "react";
import { useCataloguePlayback } from "@/components/catalogue/CataloguePlaybackProvider";
import styles from "@/styles/catalogue.module.css";

type Props = {
  recordingId: string;
};

export default function CataloguePreviewButton(props: Props) {
  const { recordingId } = props;
  const { state, isRecordingActive, toggle } = useCataloguePlayback();
  const isFullActive = isRecordingActive(recordingId, "full");
  const isClipActive = isRecordingActive(recordingId, "clip");
  const isLoadingActiveRow =
    state.status === "loading" && state.activeRecordingId === recordingId;
  const isErrorActiveRow =
    state.status === "error" && state.activeRecordingId === recordingId;
  const fullLabel = isLoadingActiveRow
    ? "Loading"
    : isFullActive && state.status === "playing"
      ? "Pause"
      : isErrorActiveRow
        ? "Retry"
        : "Full";
  const clipLabel = isLoadingActiveRow
    ? "Loading"
    : isClipActive && state.status === "playing"
      ? "Pause"
      : isErrorActiveRow
        ? "Retry"
        : "Clip";

  return (
    <>
      <div className={styles.previewButtonGroup}>
        <button
          type="button"
          className={`${styles.previewButton} ${isFullActive && state.status === "playing" ? styles.previewButtonActive : ""}`}
          onClick={() => void toggle(recordingId, "full")}
          aria-label={`${fullLabel} full track for ${recordingId}`}
        >
          {" "}
          <span className={styles.previewButtonIcon}>
            {" "}
            {isFullActive && state.status === "playing" ? "❚❚" : "▶"}{" "}
          </span>{" "}
          <span className={styles.previewButtonLabel}>{fullLabel}</span>{" "}
        </button>{" "}
        <button
          type="button"
          className={`${styles.previewButton} ${styles.previewButtonSecondary} ${isClipActive && state.status === "playing" ? styles.previewButtonActive : ""}`}
          onClick={() => void toggle(recordingId, "clip")}
          aria-label={`${clipLabel} 30 second clip for ${recordingId}`}
        >
          {" "}
          <span className={styles.previewButtonIcon}>
            {" "}
            {isClipActive && state.status === "playing" ? "❚❚" : "✦"}{" "}
          </span>{" "}
          <span className={styles.previewButtonLabel}>{clipLabel}</span>{" "}
        </button>{" "}
      </div>{" "}
    </>
  );
}
