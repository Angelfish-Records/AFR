import Link from "next/link";
import { useEffect, useMemo } from "react";
import CatalogueDetailSection from "@/components/catalogue/CatalogueDetailSection";
import CatalogueMetaRow from "@/components/catalogue/CatalogueMetaRow";
import CataloguePlaybackTransport from "@/components/catalogue/CataloguePlaybackTransport";
import CatalogueReadinessPills from "@/components/catalogue/CatalogueReadinessPills";
import type {
  CatalogueRecord,
  CatalogueRecordListItem,
} from "@/lib/catalogue/types";
import enquiryStyles from "@/styles/catalogue-enquiry.module.css";
import styles from "@/styles/catalogue.module.css";

type Props = {
  record: CatalogueRecord | null;
  summaryRecord: CatalogueRecordListItem | null;
  recordingId: string | null;
  isOpen: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  shareToken?: string | null;
  onRequestLicence: (recordingId: string) => void;
  onClose: () => void;
};

export default function CatalogueDrawer(props: Props) {
  const {
    record,
    summaryRecord,
    recordingId,
    isOpen,
    isLoading,
    errorMessage,
    shareToken = null,
    onRequestLicence,
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

  const optimisticTitle =
    record?.title ??
    summaryRecord?.title ??
    recordingId ??
    "Track detail";

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
            <h2 className={styles.drawerTitle}>{optimisticTitle}</h2>
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
          {isLoading && summaryRecord ? (
            <div className={styles.drawerOptimistic}>
              <header className={styles.detailHero}>
                <p className={styles.detailKicker}>
                  {summaryRecord.recordingId}
                </p>

                <h1 className={styles.detailTitle}>
                  {summaryRecord.title}
                </h1>

                {summaryRecord.artistName ? (
                  <p className={styles.detailArtist}>
                    {summaryRecord.artistName}
                  </p>
                ) : null}

                <CatalogueReadinessPills record={summaryRecord} />

                {summaryRecord.shortLogline ? (
                  <p className={styles.detailLead}>
                    {summaryRecord.shortLogline}
                  </p>
                ) : null}
              </header>

              <div
                className={styles.drawerHydrationStatus}
                role="status"
                aria-live="polite"
              >
                <span
                  className={styles.drawerHydrationPulse}
                  aria-hidden="true"
                />
                <span>Loading full track details</span>
              </div>

              <div
                className={styles.drawerSkeleton}
                aria-hidden="true"
              >
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}

          {isLoading && !summaryRecord ? (
            <div
              className={styles.drawerStateBlock}
              role="status"
              aria-live="polite"
            >
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

                    {record.artistName ? (
                      <p className={styles.detailArtist}>
                        {record.artistName}
                      </p>
                    ) : null}
                  </div>

                  <div className={enquiryStyles.drawerActionGroup}>
                    <button
                      type="button"
                      className={enquiryStyles.drawerRequestButton}
                      onClick={() => onRequestLicence(record.recordingId)}
                    >
                      REQUEST LICENCE
                    </button>

                    {singleTrackPrintHref ? (
                      <Link
                        href={singleTrackPrintHref}
                        className={styles.iconActionButton}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open one-sheet for ${record.title}`}
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 24 24"
                          className={styles.iconActionSvg}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M7 9V4h10v5" />
                          <path d="M7 17H5a2 2 0 0 1-2-2v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-2" />
                          <path d="M7 14h10v6H7z" />
                          <path d="M17 11h.01" />
                        </svg>
                      </Link>
                    ) : null}
                  </div>
                </div>

                <CatalogueReadinessPills record={record} />

                {record.shortLogline ? (
                  <p className={styles.detailLead}>{record.shortLogline}</p>
                ) : null}

                <CataloguePlaybackTransport
                  recordingId={record.recordingId}
                  duration={record.duration}
                  previewStartSeconds={record.previewStartSeconds}
                />
              </header>

              <CatalogueDetailSection title="Overview">
                <dl className={styles.metaList}>
                  <CatalogueMetaRow
                    label="Recording type"
                    value={record.recordingType}
                  />
                  <CatalogueMetaRow label="Duration" value={record.duration} />
                  <CatalogueMetaRow
                    label="BPM"
                    value={record.bpm === null ? null : String(record.bpm)}
                  />
                  <CatalogueMetaRow label="Key" value={record.musicalKey} />
                  <CatalogueMetaRow
                    label="Time signature"
                    value={record.timeSignature}
                  />
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
                    label="One-stop status"
                    value={record.oneStopStatus}
                  />
                  <CatalogueMetaRow
                    label="Master owner"
                    value={record.masterOwner}
                  />
                  <CatalogueMetaRow
                    label="Rights administrator"
                    value={record.rightsAdministrator}
                  />
                  <CatalogueMetaRow
                    label="Rights coverage"
                    value={record.rightsCoverage}
                  />
                  <CatalogueMetaRow
                    label="Sample clearance"
                    value={record.sampleClearanceStatus}
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
