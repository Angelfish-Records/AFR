import CataloguePreviewButton from "@/components/catalogue/CataloguePreviewButton";
import CatalogueReadinessPills from "@/components/catalogue/CatalogueReadinessPills";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  records: CatalogueRecordListItem[];
  onSelect: (recordingId: string) => void;
  selectedRecordingIds: string[];
  onToggleSelected: (recordingId: string) => void;
};

function joinCompact(values: string[], maxItems: number): string {
  return values.slice(0, maxItems).join(" • ");
}

export default function CatalogueGrid(props: Props) {
  const { records, onSelect, selectedRecordingIds, onToggleSelected } = props;

  return (
    <section className={styles.grid}>
      {records.map((record) => {
        const genreText = joinCompact(record.genreLabels, 2);
        const moodText = joinCompact(record.moodTags, 2);
        const metaText = [genreText, moodText].filter(Boolean).join(" · ");
        const isSelected = selectedRecordingIds.includes(record.recordingId);

        return (
          <article
            key={record.id}
            className={`${styles.cardShell} ${
              isSelected ? styles.cardShellSelected : ""
            }`}
          >
            <div className={styles.cardSelectionRow}>
              <label className={styles.selectionCheckboxLabel}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelected(record.recordingId)}
                  aria-label={`Select ${record.title} for print shortlist`}
                  className={styles.selectionCheckbox}
                />
                <span className={styles.selectionCheckboxVisual} />
              </label>

              <div className={styles.cardMetaPill}>
                {record.duration ?? "—"}
              </div>
            </div>

            <button
              type="button"
              className={styles.cardButton}
              onClick={() => onSelect(record.recordingId)}
            >
              <div className={styles.cardBody}>
                <div className={styles.cardTopRow}>
                  <div className={styles.cardKicker}>{record.recordingId}</div>
                </div>

                <h2 className={styles.cardTitle}>{record.title}</h2>

                {record.artistName ? (
                  <div className={styles.cardArtist}>{record.artistName}</div>
                ) : null}

                <div className={styles.cardReadinessRow}>
                  <CatalogueReadinessPills
                    summary={record.syncReadinessSummary}
                    compact
                  />
                </div>

                {record.shortLogline ? (
                  <p className={styles.cardLogline}>{record.shortLogline}</p>
                ) : null}

                <div className={styles.cardPreviewRow}>
                  <CataloguePreviewButton recordingId={record.recordingId} />
                </div>

                <div className={styles.tagRow}>
                  {metaText ? (
                    <span className={styles.tag}>{metaText}</span>
                  ) : (
                    <span className={styles.tagMuted}>
                      No genre or mood tags
                    </span>
                  )}
                </div>
              </div>
            </button>
          </article>
        );
      })}
    </section>
  );
}
