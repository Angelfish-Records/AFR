import type { CatalogueRecord } from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type ReadinessRecord = Pick<
  CatalogueRecord,
  | "recordingType"
  | "oneStopStatus"
  | "explicitFlag"
  | "familyRecordingTypes"
  | "stemsAvailable"
  | "masterOwner"
  | "rightsAdministrator"
>;

type Props = {
  record: ReadinessRecord;
  compact?: boolean;
};

function normalize(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function hasFamilyType(record: ReadinessRecord, type: string): boolean {
  const wanted = type.trim().toLowerCase();

  return record.familyRecordingTypes.some(
    (value) => value.trim().toLowerCase() === wanted,
  );
}

export default function CatalogueReadinessPills(props: Props) {
  const { record, compact = false } = props;

  const clearanceItems: Array<{ label: string; primary: boolean }> = [];

  if (normalize(record.oneStopStatus) === "one-stop") {
    clearanceItems.push({ label: "ONE-STOP", primary: true });
  }

  if (record.masterOwner) {
    clearanceItems.push({
      label: `MASTER · ${record.masterOwner.toUpperCase()}`,
      primary: false,
    });
  }

  if (record.rightsAdministrator) {
    clearanceItems.push({
      label: `RIGHTS ADMIN · ${record.rightsAdministrator.toUpperCase()}`,
      primary: false,
    });
  }

  const deliverables: string[] = [];
  const explicitFlag = normalize(record.explicitFlag);
  const recordingType = normalize(record.recordingType);

  if (explicitFlag === "explicit") {
    deliverables.push("EXPLICIT");
  } else if (explicitFlag === "clean") {
    deliverables.push("CLEAN");
  }

  if (explicitFlag !== "clean" && hasFamilyType(record, "Clean")) {
    deliverables.push("CLEAN ALT");
  }

  if (
    recordingType === "instrumental" ||
    hasFamilyType(record, "Instrumental")
  ) {
    deliverables.push("INSTRUMENTAL");
  }

  if (normalize(record.stemsAvailable) === "yes") {
    deliverables.push("STEMS");
  }

  if (clearanceItems.length === 0 && deliverables.length === 0) {
    return <span className={styles.readinessFallback}>—</span>;
  }

  return (
    <div
      className={`${styles.clearanceStack} ${
        compact ? styles.clearanceStackCompact : ""
      }`}
    >
      {clearanceItems.length > 0 ? (
        <div className={styles.clearanceRow}>
          {clearanceItems.map((item) => (
            <span
              key={item.label}
              className={`${styles.clearancePill} ${
                item.primary
                  ? styles.clearancePillPrimary
                  : styles.clearancePillControl
              }`}
            >
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      {deliverables.length > 0 ? (
        <div className={styles.deliverableRow}>
          {deliverables.map((item) => (
            <span key={item} className={styles.deliverablePill}>
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}