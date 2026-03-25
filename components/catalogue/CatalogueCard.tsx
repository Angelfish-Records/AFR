import CatalogueReadinessPills from "@/components/catalogue/CatalogueReadinessPills";
import type { CatalogueRecordListItem } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  record: CatalogueRecordListItem;
  onSelect: (recordingId: string) => void;
};

export default function CatalogueCard(props: Props) {
  const { record, onSelect } = props;

  return (
    <button
      type="button"
      className={styles.cardButton}
      onClick={() => onSelect(record.recordingId)}
    >
      <div className={styles.cardBody}>
        <div className={styles.cardTopRow}>
          <span className={styles.cardKicker}>{record.recordingId}</span>
          {record.duration ? (
            <span className={styles.cardMetaPill}>{record.duration}</span>
          ) : null}
        </div>

        <h2 className={styles.cardTitle}>{record.title}</h2>

        <div className={styles.cardReadinessRow}>
          <CatalogueReadinessPills
            summary={record.syncReadinessSummary}
            compact={false}
          />
        </div>

        {record.shortLogline ? (
          <p className={styles.cardLogline}>{record.shortLogline}</p>
        ) : null}

        <div className={styles.tagRow}>
          {record.genreLabels.map((item) => (
            <span key={`genre-${record.recordingId}-${item}`} className={styles.tag}>
              {item}
            </span>
          ))}

          {record.moodTags.slice(0, 3).map((item) => (
            <span key={`mood-${record.recordingId}-${item}`} className={styles.tagMuted}>
              {item}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}