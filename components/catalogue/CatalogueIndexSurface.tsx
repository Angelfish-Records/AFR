// components/catalogue/CatalogueIndexSurface.tsx
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import CatalogueCuratedIntro from "@/components/catalogue/CatalogueCuratedIntro";
import CatalogueDrawer from "@/components/catalogue/CatalogueDrawer";
import CatalogueDiscoveryBar, {
  type CatalogueFilterKey,
} from "@/components/catalogue/CatalogueDiscoveryBar";
import { CataloguePlaybackProvider } from "@/components/catalogue/CataloguePlaybackProvider";
import CatalogueEmptyState from "@/components/catalogue/CatalogueEmptyState";
import CatalogueGrid from "@/components/catalogue/CatalogueGrid";
import CatalogueLayout, {
  type CatalogueThemeMode,
} from "@/components/catalogue/CatalogueLayout";
import CatalogueLicensingEnquiry from "@/components/catalogue/CatalogueLicensingEnquiry";
import { useCatalogueEngagement } from "@/components/catalogue/useCatalogueEngagement";
import CatalogueShortlistBar from "@/components/catalogue/CatalogueShortlistBar";
import CatalogueTable from "@/components/catalogue/CatalogueTable";
import CatalogueViewToggle, {
  type CatalogueViewMode,
} from "@/components/catalogue/CatalogueViewToggle";
import type { CatalogueSharePresentation } from "@/lib/catalogue/shareLinkTypes";
import type {
  CatalogueRecord,
  CatalogueRecordListItem,
} from "@/lib/catalogue/types";
import styles from "@/styles/catalogue.module.css";

type Props = {
  records: CatalogueRecordListItem[];
  hasShareAttribution: boolean;
  sharePresentation: CatalogueSharePresentation | null;
};

type DetailApiResponse = {
  record: CatalogueRecord;
};

const CATALOGUE_THEME_STORAGE_KEY = "afr-catalogue-theme";

function isCatalogueThemeMode(
  value: string | null,
): value is CatalogueThemeMode {
  return value === "dark" || value === "light";
}

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

function normalizeSearchValue(value: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function includesNormalized(values: string[], expected: string): boolean {
  const normalizedExpected = expected.trim().toLowerCase();

  return values.some(
    (value) => value.trim().toLowerCase() === normalizedExpected,
  );
}

export default function CatalogueIndexSurface(props: Props) {
  const {
    records,
    hasShareAttribution,
    sharePresentation,
  } = props;
  const router = useRouter();

  const [viewMode, setViewMode] = useState<CatalogueViewMode>("table");
  const [themeMode, setThemeMode] = useState<CatalogueThemeMode>("dark");
  const [activeRecord, setActiveRecord] = useState<CatalogueRecord | null>(
    null,
  );
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailErrorMessage, setDetailErrorMessage] = useState<string | null>(
    null,
  );
  const [drawerRecordingId, setDrawerRecordingId] = useState<string | null>(
    null,
  );
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<CatalogueFilterKey[]>([]);
  const [enquiryRecordingIds, setEnquiryRecordingIds] = useState<string[]>([]);
  const [isShowingFullCatalogue, setIsShowingFullCatalogue] = useState(false);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(
        CATALOGUE_THEME_STORAGE_KEY,
      );

      if (isCatalogueThemeMode(storedTheme)) {
        setThemeMode(storedTheme);
      }
    } catch {
      // Theme persistence is optional.
    }
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((current) => {
      const nextTheme: CatalogueThemeMode =
        current === "dark" ? "light" : "dark";

      try {
        window.localStorage.setItem(
          CATALOGUE_THEME_STORAGE_KEY,
          nextTheme,
        );
      } catch {
        // Switching still works without persistence.
      }

      return nextTheme;
    });
  }, []);

  const activeRecordingId = getSingleQueryValue(
    router.query.recordingId,
  );

  useEffect(() => {
    setDrawerRecordingId(activeRecordingId);
  }, [activeRecordingId]);

  const requestedShareToken =
    getSingleQueryValue(router.query.st) ??
    getSingleQueryValue(router.query.t);

  const shareToken = hasShareAttribution
    ? requestedShareToken
    : null;

  const curatedRecordingIds =
    sharePresentation?.curatedRecordingIds ?? [];

  const hasCuratedSelection = curatedRecordingIds.length > 0;

  const curatedRecordingIdSet = useMemo(
    () => new Set(curatedRecordingIds),
    [curatedRecordingIds],
  );

  const curatedRecords = useMemo(
    () =>
      records.filter((record) =>
        curatedRecordingIdSet.has(record.recordingId),
      ),
    [curatedRecordingIdSet, records],
  );

  const catalogueScopeRecords =
    hasCuratedSelection && !isShowingFullCatalogue
      ? curatedRecords
      : records;

  const shouldShowSharePresentation =
    sharePresentation !== null &&
    (
      hasCuratedSelection ||
      Boolean(sharePresentation.welcomeMessage)
    );

  const { trackEvent } = useCatalogueEngagement(shareToken);
  const catalogueOpenTrackedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady || catalogueOpenTrackedRef.current) {
      return;
    }

    catalogueOpenTrackedRef.current = true;
    trackEvent("catalogue_open");
  }, [router.isReady, trackEvent]);

  useEffect(() => {
    if (!router.isReady || !activeRecordingId) {
      return;
    }

    trackEvent("detail_open", {
      recordingId: activeRecordingId,
    });
  }, [activeRecordingId, router.isReady, trackEvent]);

  const handlePlaybackStart = useCallback(
    (recordingId: string, mode: "full" | "clip") => {
      trackEvent(mode === "full" ? "play_full" : "play_clip", {
        recordingId,
      });
    },
    [trackEvent],
  );

  const toggleFilter = useCallback((filter: CatalogueFilterKey) => {
    setActiveFilters((current) =>
      current.includes(filter)
        ? current.filter((value) => value !== filter)
        : [...current, filter],
    );
  }, []);

  const resetDiscovery = useCallback(() => {
    setSearchQuery("");
    setActiveFilters([]);
  }, []);

  const visibleRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return catalogueScopeRecords.filter((record) => {
      if (query) {
        const haystack = [
          record.title,
          record.artistName ?? "",
          record.shortLogline ?? "",
          ...record.genreLabels,
          ...record.moodTags,
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      for (const filter of activeFilters) {
        if (
          filter === "oneStop" &&
          normalizeSearchValue(record.oneStopStatus) !== "one-stop"
        ) {
          return false;
        }

        if (
          filter === "clean" &&
          normalizeSearchValue(record.explicitFlag) !== "clean" &&
          !includesNormalized(record.familyRecordingTypes, "clean")
        ) {
          return false;
        }

        if (
          filter === "instrumental" &&
          normalizeSearchValue(record.recordingType) !== "instrumental" &&
          !includesNormalized(record.familyRecordingTypes, "instrumental")
        ) {
          return false;
        }

        if (
          filter === "stems" &&
          normalizeSearchValue(record.stemsAvailable) !== "yes"
        ) {
          return false;
        }
      }

      return true;
    });
  }, [activeFilters, catalogueScopeRecords, searchQuery]);

  const activeListItem = useMemo(() => {
    if (!drawerRecordingId) {
      return null;
    }

    return (
      records.find((record) => record.recordingId === drawerRecordingId) ?? null
    );
  }, [drawerRecordingId, records]);

  const enquiryRecords = useMemo(() => {
    return enquiryRecordingIds
      .map(
        (recordingId) =>
          records.find((record) => record.recordingId === recordingId) ?? null,
      )
      .filter(
        (record): record is CatalogueRecordListItem => record !== null,
      );
  }, [enquiryRecordingIds, records]);

  const toggleSelectedRecording = useCallback(
    (recordingId: string) => {
      const isCurrentlySelected =
        selectedRecordingIds.includes(recordingId);

      setSelectedRecordingIds((current) =>
        current.includes(recordingId)
          ? current.filter((value) => value !== recordingId)
          : [...current, recordingId],
      );

      trackEvent(
        isCurrentlySelected ? "shortlist_remove" : "shortlist_add",
        {
          recordingId,
        },
      );
    },
    [selectedRecordingIds, trackEvent],
  );

  const clearSelectedRecordings = useCallback(() => {
    for (const recordingId of selectedRecordingIds) {
      trackEvent("shortlist_remove", {
        recordingId,
      });
    }

    setSelectedRecordingIds([]);
  }, [selectedRecordingIds, trackEvent]);

  const openLicensingEnquiry = useCallback(
    (recordingIds: string[]) => {
      const availableIds = new Set(
        records.map((record) => record.recordingId),
      );

      const safeIds = Array.from(
        new Set(
          recordingIds.filter((recordingId) =>
            availableIds.has(recordingId),
          ),
        ),
      );

      if (safeIds.length === 0) {
        return;
      }

      trackEvent("licensing_open", {
        selectionCount: safeIds.length,
      });

      setEnquiryRecordingIds(safeIds);
    },
    [records, trackEvent],
  );

  const closeLicensingEnquiry = useCallback(() => {
    setEnquiryRecordingIds([]);
  }, []);

  const openRecord = useCallback(
    (recordingId: string) => {
      setDrawerRecordingId(recordingId);
      setActiveRecord(null);
      setIsLoadingDetail(true);
      setDetailErrorMessage(null);

      const nextQuery: Record<string, string> = {};

      if (shareToken) {
        nextQuery.st = shareToken;
      }

      nextQuery.recordingId = recordingId;

      void router
        .push(
          {
            pathname: "/",
            query: nextQuery,
          },
          undefined,
          { shallow: true, scroll: false },
        )
        .catch(() => {
          setDrawerRecordingId(activeRecordingId);
        });
    },
    [activeRecordingId, router, shareToken],
  );

  const closeDrawer = useCallback(() => {
    setDrawerRecordingId(null);
    setActiveRecord(null);
    setDetailErrorMessage(null);
    setIsLoadingDetail(false);

    const nextQuery: Record<string, string> = {};

    if (shareToken) {
      nextQuery.st = shareToken;
    }

    void router
      .push(
        {
          pathname: "/",
          query: nextQuery,
        },
        undefined,
        { shallow: true, scroll: false },
      )
      .catch(() => {
        setDrawerRecordingId(activeRecordingId);
      });
  }, [activeRecordingId, router, shareToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecord(): Promise<void> {
      if (!drawerRecordingId) {
        setActiveRecord(null);
        setDetailErrorMessage(null);
        setIsLoadingDetail(false);
        return;
      }

      setIsLoadingDetail(true);
      setDetailErrorMessage(null);

      try {
        const url = new URL(
          `/api/catalogue/records/${encodeURIComponent(drawerRecordingId)}`,
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
  }, [drawerRecordingId, shareToken]);

  return (
    <CataloguePlaybackProvider
      accessToken={shareToken}
      onPlaybackStart={handlePlaybackStart}
    >
      <CatalogueLayout theme={themeMode}>
        <div className={styles.logoHeader}>
          <Image
            src="/brand/AFR-logo-white-horizontal.png"
            alt="Angelfish Records"
            width={100}
            height={132}
            priority
            className={styles.logoImage}
          />
        </div>
        <div className={styles.surfaceHeaderRow}>
          <div className={styles.surfaceControlLeft}>
            <CatalogueShortlistBar
              selectedRecordingIds={selectedRecordingIds}
              onClear={clearSelectedRecordings}
              onRequestLicence={() =>
                openLicensingEnquiry(selectedRecordingIds)
              }
            />
          </div>

          <div className={styles.surfaceHeaderTitle}>SYNC CATALOGUE</div>

          <div className={styles.surfaceControlRight}>
            <CatalogueViewToggle value={viewMode} onChange={setViewMode} />

            <button
              type="button"
              className={styles.themeToggle}
              onClick={toggleThemeMode}
              aria-label={
                themeMode === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              title={
                themeMode === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {themeMode === "dark" ? (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={styles.themeToggleIcon}
                >
                  <circle cx="12" cy="12" r="3.25" />
                  <path d="M12 2.75v2.1M12 19.15v2.1M2.75 12h2.1M19.15 12h2.1M5.46 5.46l1.49 1.49M17.05 17.05l1.49 1.49M18.54 5.46l-1.49 1.49M6.95 17.05l-1.49 1.49" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={styles.themeToggleIcon}
                >
                  <path d="M20.1 15.05A8.3 8.3 0 0 1 8.95 3.9 8.55 8.55 0 1 0 20.1 15.05Z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {shouldShowSharePresentation && sharePresentation ? (
          <CatalogueCuratedIntro
            recipientName={sharePresentation.recipientName}
            welcomeMessage={sharePresentation.welcomeMessage}
            hasCuratedSelection={hasCuratedSelection}
            isShowingFullCatalogue={isShowingFullCatalogue}
            curatedCount={curatedRecords.length}
            totalCount={records.length}
            onToggleCatalogueScope={() =>
              setIsShowingFullCatalogue((current) => !current)
            }
          />
        ) : null}

        {catalogueScopeRecords.length > 0 ? (
          <CatalogueDiscoveryBar
            query={searchQuery}
            activeFilters={activeFilters}
            visibleCount={visibleRecords.length}
            totalCount={catalogueScopeRecords.length}
            onQueryChange={setSearchQuery}
            onToggleFilter={toggleFilter}
            onReset={resetDiscovery}
          />
        ) : null}

        {records.length === 0 ? (
          <CatalogueEmptyState
            title="No catalogue records are currently available"
            body="The configured Airtable view is returning no records yet. Once tracks are added to the dedicated sync view, they will appear here automatically."
          />
        ) : catalogueScopeRecords.length === 0 ? (
          <CatalogueEmptyState
            title="This curated selection is no longer available"
            body="The selected recordings are no longer in the current catalogue. Use View full catalogue above to browse the available recordings."
          />
        ) : visibleRecords.length === 0 ? (
          <CatalogueEmptyState
            title="No tracks match these filters"
            body="Try another search term or reset the active filters."
          />
        ) : viewMode === "table" ? (
          <CatalogueTable
            records={visibleRecords}
            activeRecordingId={drawerRecordingId}
            onSelect={openRecord}
            selectedRecordingIds={selectedRecordingIds}
            onToggleSelected={toggleSelectedRecording}
          />
        ) : (
          <CatalogueGrid
            records={visibleRecords}
            onSelect={openRecord}
            selectedRecordingIds={selectedRecordingIds}
            onToggleSelected={toggleSelectedRecording}
          />
        )}
        <CatalogueDrawer
          record={activeRecord}
          summaryRecord={activeListItem}
          recordingId={drawerRecordingId}
          isOpen={Boolean(drawerRecordingId)}
          isLoading={isLoadingDetail}
          errorMessage={detailErrorMessage}
          shareToken={shareToken}
          onRequestLicence={(recordingId) =>
            openLicensingEnquiry([recordingId])
          }
          onClose={closeDrawer}
        />

        <CatalogueLicensingEnquiry
          isOpen={enquiryRecords.length > 0}
          records={enquiryRecords}
          shareToken={shareToken}
          onClose={closeLicensingEnquiry}
        />
      </CatalogueLayout>
    </CataloguePlaybackProvider>
  );
}
