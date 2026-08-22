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

type ReadinessMode = "all" | "rights" | "delivery";

type Props = {
  record: ReadinessRecord;
  compact?: boolean;
  mode?: ReadinessMode;
};

function normalize(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function displayUpper(value: string | null): string | null {
  const trimmed = value?.trim();

  return trimmed ? trimmed.toUpperCase() : null;
}

function hasFamilyType(record: ReadinessRecord, type: string): boolean {
  const wanted = type.trim().toLowerCase();

  return record.familyRecordingTypes.some(
    (value) => value.trim().toLowerCase() === wanted,
  );
}

function getDeliverables(record: ReadinessRecord): string[] {
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

  return deliverables;
}

export default function CatalogueReadinessPills(props: Props) {
  const {
    record,
    compact = false,
    mode = "all",
  } = props;

  const oneStopStatus = displayUpper(record.oneStopStatus);
  const masterOwner = displayUpper(record.masterOwner);
  const rightsAdministrator = displayUpper(record.rightsAdministrator);
  const deliverables = getDeliverables(record);

  if (mode === "rights") {
    const isOneStop = normalize(record.oneStopStatus) === "one-stop";

    return (
      <div className={styles.rightsTile}>
        <div
          className={`${styles.rightsTileStatus} ${
            isOneStop ? styles.rightsTileStatusPrimary : ""
          }`}
        >
          {oneStopStatus ?? "RIGHTS STATUS —"}
        </div>

        <div className={styles.rightsTileDetails}>
          <div className={styles.rightsTileDetail}>
            <span className={styles.rightsTileLabel}>Master</span>
            <span className={styles.rightsTileValue}>
              {masterOwner ?? "—"}
            </span>
          </div>

          <div className={styles.rightsTileDetail}>
            <span className={styles.rightsTileLabel}>Rights admin</span>
            <span className={styles.rightsTileValue}>
              {rightsAdministrator ?? "—"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "delivery") {
    if (deliverables.length === 0) {
      return <span className={styles.readinessFallback}>—</span>;
    }

    return (
      <div
        className={`${styles.deliverableRow} ${
          compact ? styles.deliverableRowCompact : ""
        }`}
      >
        {deliverables.map((item) => (
          <span key={item} className={styles.deliverablePill}>
            {item}
          </span>
        ))}
      </div>
    );
  }

  const clearanceItems: Array<{
    label: string;
    primary: boolean;
  }> = [];

  if (normalize(record.oneStopStatus) === "one-stop") {
    clearanceItems.push({
      label: "ONE-STOP",
      primary: true,
    });
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
