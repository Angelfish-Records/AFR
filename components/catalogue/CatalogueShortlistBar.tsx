import Link from "next/link";
import styles from "@/styles/catalogue.module.css";

type Props = {
  selectedRecordingIds: string[];
  shareToken?: string | null;
  onClear: () => void;
};

export default function CatalogueShortlistBar(props: Props) {
  const { selectedRecordingIds, shareToken = null, onClear } = props;

  if (selectedRecordingIds.length === 0) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("ids", selectedRecordingIds.join(","));

  if (shareToken) {
    params.set("st", shareToken);
  }

  const href = `/print?${params.toString()}`;

  return (
    <div className={styles.shortlistBar}>
      <div className={styles.shortlistBarMeta}>
        <div className={styles.shortlistBarTitle}>
          {selectedRecordingIds.length} track{selectedRecordingIds.length === 1 ? "" : "s"} selected
        </div>
        <div className={styles.shortlistBarBody}>
          Build a clean print-ready shortlist for discussion, markup, or Save as PDF.
        </div>
      </div>

      <div className={styles.shortlistBarActions}>
        <button
          type="button"
          onClick={onClear}
          className={styles.shortlistSecondaryButton}
        >
          Clear
        </button>

        <Link href={href} className={styles.shortlistPrimaryButton}>
          Print shortlist
        </Link>
      </div>
    </div>
  );
}