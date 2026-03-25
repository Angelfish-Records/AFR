import type { CatalogueRecordListItem } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  records: CatalogueRecordListItem[];
  activeRecordingId: string | null;
  onSelect: (recordingId: string) => void;
};

function joinCompact(values: string[], maxItems: number): string {
  return values.slice(0, maxItems).join(" • ");
}

export default function CatalogueTable(props: Props) {
  const { records, activeRecordingId, onSelect } = props;

  return (
    <section className={styles.tableShell}>
      <div className={styles.tableHeaderRow}>
        <div>Track</div>
        <div>Readiness</div>
        <div>Genre / Mood</div>
        <div>Duration</div>
      </div>

      <div className={styles.tableBody}>
        {records.map((record) => {
          const genreText = joinCompact(record.genreLabels, 2);
          const moodText = joinCompact(record.moodTags, 2);
          const metaText = [genreText, moodText].filter(Boolean).join(" — ");
          const isActive = activeRecordingId === record.recordingId;

          return (
            <button
              key={record.id}
              type="button"
              className={`${styles.tableRowButton} ${
                isActive ? styles.tableRowButtonActive : ""
              }`}
              onClick={() => onSelect(record.recordingId)}
            >
              <div className={styles.tableTrackCell}>
                <div className={styles.tableTrackTopLine}>
                  <span className={styles.tableRecordingId}>{record.recordingId}</span>
                </div>
                <div className={styles.tableTrackTitle}>{record.title}</div>
                {record.shortLogline ? (
                  <div className={styles.tableTrackLogline}>{record.shortLogline}</div>
                ) : null}
              </div>

              <div className={styles.tableCellMuted}>
                {record.syncReadinessSummary ?? "—"}
              </div>

              <div className={styles.tableCellMuted}>{metaText || "—"}</div>

              <div className={styles.tableDurationCell}>{record.duration ?? "—"}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}