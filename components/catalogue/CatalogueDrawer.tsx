// components/catalogue/CatalogueDrawer.tsx
import Link from "next/link";
import { useEffect, useMemo } from "react";
import CatalogueDetailSection from "@/components/catalogue/CatalogueDetailSection";
import CatalogueMetaRow from "@/components/catalogue/CatalogueMetaRow";
import CataloguePlaybackTransport from "@/components/catalogue/CataloguePlaybackTransport";
import type { CatalogueRecord } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  record: CatalogueRecord | null;
  recordingId: string | null;
  isOpen: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  shareToken?: string | null;
  onClose: () => void;
};

export default function CatalogueDrawer(props: Props) {
  const {
    record,
    recordingId,
    isOpen,
    isLoading,
    errorMessage,
    shareToken = null,
    onClose,
  } = props;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const singleTrackPrintHref = useMemo(() => {
    if (!recordingId) {
      return null;
    }

    const params = new URLSearchParams();
    params.set("ids", recordingId);

    if (shareToken) {
      params.set("st", shareToken);
    }

    return `/print?${params.toString()}`;
  }, [recordingId, shareToken]);

  return (
    <>
      <div
        className={`${styles.drawerBackdrop} ${
          isOpen ? styles.drawerBackdropVisible : ""
        }`}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <aside
        className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ""}`}
        aria-hidden={!isOpen}
      >
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.drawerEyebrow}>Track detail</p>
            <h2 className={styles.drawerTitle}>
              {record?.title ?? recordingId ?? "Loading"}
            </h2>
          </div>

          <button
            type="button"
            className={styles.drawerCloseButton}
            onClick={onClose}
            aria-label="Close detail panel"
          >
            ×
          </button>
        </div>

        <div className={styles.drawerBody}>
          {isLoading ? (
            <div className={styles.drawerStateBlock}>
              Loading track details…
            </div>
          ) : null}

          {!isLoading && errorMessage ? (
            <div className={styles.drawerStateBlock}>{errorMessage}</div>
          ) : null}

          {!isLoading && !errorMessage && record ? (
            <>
              <header className={styles.detailHero}>
                <div className={styles.detailHeroTopRow}>
                  <div>
                    <p className={styles.detailKicker}>{record.recordingId}</p>
                    <h1 className={styles.detailTitle}>{record.title}</h1>
                  </div>

                  {singleTrackPrintHref ? (
                    <Link
                      href={singleTrackPrintHref}
                      className={styles.drawerPrintButton}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Print one-sheet
                    </Link>
                  ) : null}
                </div>

                {(record.shortLogline || record.syncReadinessSummary) && (
                  <p className={styles.detailLead}>
                    {record.shortLogline ?? record.syncReadinessSummary}
                  </p>
                )}

                <CataloguePlaybackTransport
                  recordingId={record.recordingId}
                  duration={record.duration}
                  previewStartSeconds={record.previewStartSeconds}
                />
              </header>

              <CatalogueDetailSection title="Overview">
                <dl className={styles.metaList}>
                  <CatalogueMetaRow
                    label="Sync readiness"
                    value={record.syncReadinessSummary}
                  />
                  <CatalogueMetaRow
                    label="Recording type"
                    value={record.recordingType}
                  />
                  <CatalogueMetaRow label="Duration" value={record.duration} />
                  <CatalogueMetaRow label="Language" value={record.language} />
                  <CatalogueMetaRow label="Genre" value={record.genreLabels} />
                  <CatalogueMetaRow
                    label="Mood / tags"
                    value={record.moodTags}
                  />
                  <CatalogueMetaRow
                    label="Release date"
                    value={record.releaseDateCurrent}
                  />
                  <CatalogueMetaRow label="ISRC" value={record.isrc} />
                </dl>
              </CatalogueDetailSection>

              <CatalogueDetailSection title="Rights & Clearance">
                <dl className={styles.metaList}>
                  <CatalogueMetaRow
                    label="Rights coverage"
                    value={record.rightsCoverage}
                  />
                  <CatalogueMetaRow
                    label="Geo restrictions"
                    value={record.geoRestrictions}
                  />
                  <CatalogueMetaRow
                    label="Known legal risks"
                    value={record.knownLegalRisks}
                  />
                  <CatalogueMetaRow
                    label="Master owner"
                    value={record.masterOwner}
                  />
                  <CatalogueMetaRow
                    label="Master split"
                    value={record.masterSplitSummary}
                  />
                  <CatalogueMetaRow
                    label="Composition / publishing split"
                    value={record.compositionPublishingSplitSummary}
                  />
                  <CatalogueMetaRow
                    label="Rights administrator"
                    value={record.rightsAdministrator}
                  />
                  <CatalogueMetaRow
                    label="Last reviewed"
                    value={record.lastReviewed}
                  />
                </dl>
              </CatalogueDetailSection>

              <CatalogueDetailSection title="Documentation">
                {record.lyricsPdfLink || record.chainOfTitlePdfLink ? (
                  <div className={styles.documentLinks}>
                    {record.lyricsPdfLink ? (
                      <a
                        href={record.lyricsPdfLink}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.documentLink}
                      >
                        Lyrics PDF
                      </a>
                    ) : null}

                    {record.chainOfTitlePdfLink ? (
                      <a
                        href={record.chainOfTitlePdfLink}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.documentLink}
                      >
                        Chain-of-title PDF
                      </a>
                    ) : null}
                  </div>
                ) : (
                  <p>
                    No documentation links are currently available for this
                    recording.
                  </p>
                )}
              </CatalogueDetailSection>
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
