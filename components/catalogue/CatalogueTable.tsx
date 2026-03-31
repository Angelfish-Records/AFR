// components/catalogue/CatalogueTable.tsx
import CataloguePreviewButton from "@/components/catalogue/CataloguePreviewButton";
import CatalogueReadinessPills from "@/components/catalogue/CatalogueReadinessPills";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  records: CatalogueRecordListItem[];
  activeRecordingId: string | null;
  onSelect: (recordingId: string) => void;
  selectedRecordingIds: string[];
  onToggleSelected: (recordingId: string) => void;
};

function joinCompact(values: string[], maxItems: number): string {
  return values.slice(0, maxItems).join(" / ");
}

export default function CatalogueTable(props: Props) {
  const {
    records,
    activeRecordingId,
    onSelect,
    selectedRecordingIds,
    onToggleSelected,
  } = props;

  return (
    <section className={styles.tableShell}>
      <div className={styles.tableHeaderRow}>
        <div>Select</div>
        <div>Track</div>
        <div>Preview</div>
        <div>Readiness</div>
        <div>Genre / Mood</div>
        <div>Duration</div>
      </div>

      <div className={styles.tableBody}>
        {records.map((record) => {
          const genreText = joinCompact(record.genreLabels, 2);
          const moodText = joinCompact(record.moodTags, 2);
          const metaText = [genreText, moodText].filter(Boolean).join(" • ");
          const isActive = activeRecordingId === record.recordingId;
          const isSelected = selectedRecordingIds.includes(record.recordingId);

          return (
            <div
              key={record.id}
              className={`${styles.tableRowButton} ${
                isActive ? styles.tableRowButtonActive : ""
              }`}
            >
              <div className={styles.tableSelectCell}>
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
              </div>

              <button
                type="button"
                className={styles.tableTrackButton}
                onClick={() => onSelect(record.recordingId)}
              >
                <div className={styles.tableTrackCell}>
                  <div className={styles.tableTrackTopLine}>
                    <span className={styles.tableRecordingId}>
                      {record.recordingId}
                    </span>
                  </div>
                  <div className={styles.tableTrackTitle}>{record.title}</div>
                  {record.shortLogline ? (
                    <div className={styles.tableTrackLogline}>
                      {record.shortLogline}
                    </div>
                  ) : null}
                </div>
              </button>

              <div className={styles.tablePreviewCell}>
                <CataloguePreviewButton recordingId={record.recordingId} />
              </div>

              <div className={styles.tableReadinessCell}>
                <CatalogueReadinessPills
                  summary={record.syncReadinessSummary}
                  compact
                />
              </div>

              <div className={styles.tableCellMuted}>{metaText || "—"}</div>

              <div className={styles.tableDurationCell}>
                {record.duration ?? "—"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
