import Link from "next/link";
import styles from "@/styles/catalogue.module.css";

type Props = {
  selectedRecordingIds: string[];
  shareToken?: string | null;
  onClear: () => void;
};

function PrintIcon() {
  return (
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
  );
}

export default function CatalogueShortlistBar(props: Props) {
  const { selectedRecordingIds, shareToken = null } = props;

  const params = new URLSearchParams();
  params.set("ids", selectedRecordingIds.join(","));

  if (shareToken) {
    params.set("st", shareToken);
  }

  const href = `/print?${params.toString()}`;
  const isDisabled = selectedRecordingIds.length === 0;

  if (isDisabled) {
    return (
      <button
        type="button"
        disabled
        aria-label="Print shortlist"
        className={`${styles.iconActionButton} ${styles.iconActionButtonDisabled}`}
      >
        <PrintIcon />
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`Print shortlist of ${selectedRecordingIds.length} selected track${
        selectedRecordingIds.length === 1 ? "" : "s"
      }`}
      className={styles.iconActionButton}
    >
      <PrintIcon />
    </Link>
  );
}