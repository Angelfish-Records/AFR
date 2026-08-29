"use client";

import { useState } from "react";
import styles from "@/styles/catalogue-admin.module.css";

type SnapshotStatus = {
  itemCount: number;
  refreshedAt: string;
};

type SnapshotStatusWithPageCount = SnapshotStatus & {
  airtablePageCount: number;
};

type RefreshSuccessResponse = {
  ok: true;
  syncCatalogue: SnapshotStatusWithPageCount;
  websiteCatalogue: SnapshotStatusWithPageCount;
  totalAirtablePageCount: number;
};

type RefreshFailureResponse = {
  ok: false;
  error: string;
};

type RefreshResponse =
  | RefreshSuccessResponse
  | RefreshFailureResponse;

type Props = {
  initialSyncSnapshot: SnapshotStatus;
  initialWebsiteSnapshot: SnapshotStatus;
};

function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isSnapshotStatusWithPageCount(
  value: unknown,
): value is SnapshotStatusWithPageCount {
  if (!isObjectRecord(value)) {
    return false;
  }

  return (
    Number.isInteger(value.itemCount) &&
    typeof value.refreshedAt === "string" &&
    Number.isInteger(value.airtablePageCount)
  );
}

function parseRefreshResponse(
  value: unknown,
): RefreshResponse | null {
  if (!isObjectRecord(value)) {
    return null;
  }

  if (value.ok === false) {
    return typeof value.error === "string"
      ? {
          ok: false,
          error: value.error,
        }
      : null;
  }

  if (
    value.ok !== true ||
    !isSnapshotStatusWithPageCount(
      value.syncCatalogue,
    ) ||
    !isSnapshotStatusWithPageCount(
      value.websiteCatalogue,
    ) ||
    !Number.isInteger(value.totalAirtablePageCount)
  ) {
    return null;
  }

  return {
    ok: true,
    syncCatalogue: value.syncCatalogue,
    websiteCatalogue: value.websiteCatalogue,
    totalAirtablePageCount:
      value.totalAirtablePageCount as number,
  };
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(parsed);
}

export default function CatalogueSnapshotAdmin(
  props: Props,
) {
  const [syncSnapshot, setSyncSnapshot] = useState(
    props.initialSyncSnapshot,
  );
  const [websiteSnapshot, setWebsiteSnapshot] =
    useState(props.initialWebsiteSnapshot);
  const [isRefreshing, setIsRefreshing] =
    useState(false);
  const [message, setMessage] =
    useState<string | null>(null);
  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  async function handleRefresh(): Promise<void> {
    setIsRefreshing(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        "/api/catalogue/admin/refresh-snapshots",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const payload: unknown =
        await response.json();

      const parsed =
        parseRefreshResponse(payload);

      if (!response.ok || !parsed || !parsed.ok) {
        const failureMessage =
          parsed && !parsed.ok
            ? parsed.error
            : `Refresh failed (${response.status})`;

        throw new Error(failureMessage);
      }

      setSyncSnapshot({
        itemCount: parsed.syncCatalogue.itemCount,
        refreshedAt:
          parsed.syncCatalogue.refreshedAt,
      });

      setWebsiteSnapshot({
        itemCount:
          parsed.websiteCatalogue.itemCount,
        refreshedAt:
          parsed.websiteCatalogue.refreshedAt,
      });

      setMessage(
        `Refreshed both snapshots using ${parsed.totalAirtablePageCount} Airtable page ` +
          `request${parsed.totalAirtablePageCount === 1 ? "" : "s"}. Reloading admin data…`,
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 650);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Catalogue refresh failed",
      );
      setIsRefreshing(false);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.snapshotHeader}>
        <div>
          <h2 className={styles.cardTitle}>
            Catalogue data source
          </h2>
          <p className={styles.snapshotDescription}>
            Public catalogue traffic reads these durable
            Neon snapshots. Airtable is contacted only
            when you explicitly refresh them here.
          </p>
        </div>

        <span className={styles.snapshotRuntimeBadge}>
          Runtime · Neon
        </span>
      </div>

      <div className={styles.snapshotGrid}>
        <div className={styles.snapshotItem}>
          <span className={styles.snapshotLabel}>
            Sync catalogue
          </span>
          <strong className={styles.snapshotCount}>
            {syncSnapshot.itemCount}
          </strong>
          <span className={styles.snapshotMeta}>
            tracks · refreshed{" "}
            {formatDateTime(syncSnapshot.refreshedAt)}
          </span>
        </div>

        <div className={styles.snapshotItem}>
          <span className={styles.snapshotLabel}>
            Website catalogue
          </span>
          <strong className={styles.snapshotCount}>
            {websiteSnapshot.itemCount}
          </strong>
          <span className={styles.snapshotMeta}>
            releases · refreshed{" "}
            {formatDateTime(
              websiteSnapshot.refreshedAt,
            )}
          </span>
        </div>
      </div>

      <div className={styles.snapshotFooter}>
        <div>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={isRefreshing}
            onClick={() => void handleRefresh()}
          >
            {isRefreshing
              ? "Refreshing from Airtable…"
              : "Refresh from Airtable"}
          </button>

          {message ? (
            <p className={styles.snapshotMessage}>
              {message}
            </p>
          ) : null}

          {errorMessage ? (
            <p className={styles.error}>
              {errorMessage}
            </p>
          ) : null}
        </div>

        <p className={styles.snapshotNote}>
          A successful refresh replaces both snapshots
          together. Empty or failed Airtable pulls leave
          the current last-known-good data intact.
        </p>
      </div>
    </section>
  );
}
