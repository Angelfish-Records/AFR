import styles from "@/styles/catalogue-enquiry.module.css";

type Props = {
  selectedRecordingIds: string[];
  onClear: () => void;
  onRequestLicence: () => void;
};

export default function CatalogueShortlistBar(props: Props) {
  const { selectedRecordingIds, onClear, onRequestLicence } = props;
  const selectedCount = selectedRecordingIds.length;
  const isDisabled = selectedCount === 0;

  return (
    <div className={styles.shortlistBar}>
      <button
        type="button"
        disabled={isDisabled}
        className={`${styles.shortlistRequestButton} ${
          isDisabled ? styles.shortlistRequestButtonDisabled : ""
        }`}
        onClick={onRequestLicence}
      >
        {isDisabled
          ? "SHORTLIST"
          : `${selectedCount} SHORTLISTED · REQUEST LICENCE`}
      </button>

      {!isDisabled ? (
        <button
          type="button"
          className={styles.shortlistClearButton}
          onClick={onClear}
        >
          CLEAR
        </button>
      ) : null}
    </div>
  );
}
