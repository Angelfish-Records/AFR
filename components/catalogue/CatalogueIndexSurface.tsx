// components/catalogue/CatalogueIndexSurface.tsx
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import CatalogueDrawer from "@/components/catalogue/CatalogueDrawer";
import { CataloguePlaybackProvider } from "@/components/catalogue/CataloguePlaybackProvider";
import CatalogueEmptyState from "@/components/catalogue/CatalogueEmptyState";
import CatalogueGrid from "@/components/catalogue/CatalogueGrid";
import CatalogueLayout from "@/components/catalogue/CatalogueLayout";
import CatalogueShortlistBar from "@/components/catalogue/CatalogueShortlistBar";
import CatalogueTable from "@/components/catalogue/CatalogueTable";
import CatalogueViewToggle, {
  type CatalogueViewMode,
} from "@/components/catalogue/CatalogueViewToggle";
import type {
  CatalogueRecord,
  CatalogueRecordListItem,
} from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  records: CatalogueRecordListItem[];
};

type DetailApiResponse = {
  record: CatalogueRecord;
};

function getSingleQueryValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (
    Array.isArray(value) &&
    typeof value[0] === "string" &&
    value[0].trim().length > 0
  ) {
    return value[0].trim();
  }

  return null;
}

export default function CatalogueIndexSurface(props: Props) {
  const { records } = props;
  const router = useRouter();

  const [viewMode, setViewMode] = useState<CatalogueViewMode>("table");
  const [activeRecord, setActiveRecord] = useState<CatalogueRecord | null>(
    null,
  );
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(
    null,
  );
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>(
    [],
  );

  const activeRecordingId = getSingleQueryValue(router.query.recordingId);
  const shareToken =
    getSingleQueryValue(router.query.st) ?? getSingleQueryValue(router.query.t);

  const activeListItem = useMemo(() => {
    if (!activeRecordingId) {
      return null;
    }

    return (
      records.find((record) => record.recordingId === activeRecordingId) ?? null
    );
  }, [activeRecordingId, records]);

  const toggleSelectedRecording = useCallback((recordingId: string) => {
    setSelectedRecordingIds((current) =>
      current.includes(recordingId)
        ? current.filter((value) => value !== recordingId)
        : [...current, recordingId],
    );
  }, []);

  const clearSelectedRecordings = useCallback(() => {
    setSelectedRecordingIds([]);
  }, []);

  const openRecord = useCallback(
    async (recordingId: string) => {
      const nextQuery: Record<string, string> = {};

      if (shareToken) {
        nextQuery.st = shareToken;
      }

      nextQuery.recordingId = recordingId;

      await router.push(
        {
          pathname: "/",
          query: nextQuery,
        },
        undefined,
        { shallow: true, scroll: false },
      );
    },
    [router, shareToken],
  );

  const closeDrawer = useCallback(async () => {
    const nextQuery: Record<string, string> = {};

    if (shareToken) {
      nextQuery.st = shareToken;
    }

    await router.push(
      {
        pathname: "/",
        query: nextQuery,
      },
      undefined,
      { shallow: true, scroll: false },
    );

    setActiveRecord(null);
    setDetailErrorMessage(null);
    setIsLoadingDetail(false);
  }, [router, shareToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecord(): Promise<void> {
      if (!activeRecordingId) {
        setActiveRecord(null);
        setDetailErrorMessage(null);
        setIsLoadingDetail(false);
        return;
      }

      setIsLoadingDetail(true);
      setDetailErrorMessage(null);

      try {
        const url = new URL(
          `/api/catalogue/records/${encodeURIComponent(activeRecordingId)}`,
          window.location.origin,
        );

        if (shareToken) {
          url.searchParams.set("st", shareToken);
        }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Failed to load record (${response.status})`);
        }

        const payload = (await response.json()) as DetailApiResponse;

        if (!cancelled) {
          setActiveRecord(payload.record);
        }
      } catch (error) {
        if (!cancelled) {
          setActiveRecord(null);
          setDetailErrorMessage(
            error instanceof Error ? error.message : "Failed to load record",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      }
    }

    void loadRecord();

    return () => {
      cancelled = true;
    };
  }, [activeRecordingId, shareToken]);

  return (
    <CataloguePlaybackProvider accessToken={shareToken}>
      <CatalogueLayout>
        <div className={styles.logoHeader}>
          <Image
            src="/brand/AFR_logo_suiboku_light_text.png"
            alt="Angelfish Records"
            width={100}
            height={132}
            priority
            className={styles.logoImage}
          />
        </div>
        <div className={styles.surfaceHeaderRow}>
          <div className={styles.surfaceControlLeft} aria-hidden="true" />

          <div className={styles.surfaceHeaderTitle}>SYNC CATALOGUE</div>

          <div className={styles.surfaceControlRight}>
            <CatalogueShortlistBar
              selectedRecordingIds={selectedRecordingIds}
              shareToken={shareToken}
              onClear={clearSelectedRecordings}
            />
            <CatalogueViewToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>
        {records.length === 0 ? (
          <CatalogueEmptyState
            title="No catalogue records are currently available"
            body="The configured Airtable view is returning no records yet. Once tracks are added to the dedicated sync view, they will appear here automatically."
          />
        ) : viewMode === "table" ? (
          <CatalogueTable
            records={records}
            activeRecordingId={activeRecordingId}
            onSelect={openRecord}
            selectedRecordingIds={selectedRecordingIds}
            onToggleSelected={toggleSelectedRecording}
          />
        ) : (
          <CatalogueGrid
            records={records}
            onSelect={openRecord}
            selectedRecordingIds={selectedRecordingIds}
            onToggleSelected={toggleSelectedRecording}
          />
        )}
        <CatalogueDrawer
          record={activeRecord}
          recordingId={activeRecordingId ?? activeListItem?.recordingId ?? null}
          isOpen={Boolean(activeRecordingId)}
          isLoading={isLoadingDetail}
          errorMessage={detailErrorMessage}
          shareToken={shareToken}
          onClose={closeDrawer}
        />
      </CatalogueLayout>
    </CataloguePlaybackProvider>
  );
}
