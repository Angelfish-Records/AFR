// lib/catalogue/queries.ts
import {
  airtableGet,
  getAirtableConfig,
} from "@/lib/catalogue/airtable";
import { requireAirtableContentSnapshot } from "@/lib/catalogue/contentSnapshots";
import { mapRecordingRecord } from "@/lib/catalogue/mappers";
import type {
  AirtableRecord,
  AirtableRecordFields,
  CatalogueRecord,
  RecordingAirtableFields,
} from "@/lib/catalogue/types";

type AirtableListResponse<
  TFields extends AirtableRecordFields,
> = {
  records: Array<AirtableRecord<TFields>>;
  offset?: string;
};

export type CatalogueAirtableFetchResult = {
  records: CatalogueRecord[];
  pageCount: number;
};

function compareRecordingIds(
  left: string,
  right: string,
): number {
  return left.localeCompare(
    right,
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );
}

function sortCatalogueRecords(
  records: CatalogueRecord[],
): CatalogueRecord[] {
  return records
    .slice()
    .sort((left, right) =>
      compareRecordingIds(
        left.recordingId,
        right.recordingId,
      ),
    );
}

async function listRecordingRowsFromAirtable(): Promise<{
  rows: Array<
    AirtableRecord<RecordingAirtableFields>
  >;
  pageCount: number;
}> {
  const {
    baseId,
    recordingsTableId,
    recordingsViewId,
  } = getAirtableConfig();

  const accumulated: Array<
    AirtableRecord<RecordingAirtableFields>
  > = [];

  let offset: string | undefined;
  let pageCount = 0;

  do {
    const response =
      await airtableGet<
        AirtableListResponse<RecordingAirtableFields>
      >({
        path:
          `${baseId}/` +
          encodeURIComponent(recordingsTableId),
        searchParams: {
          view: recordingsViewId,
          pageSize: "100",
          ...(offset ? { offset } : {}),
        },
      });

    pageCount += 1;
    accumulated.push(...response.records);
    offset = response.offset;
  } while (offset);

  return {
    rows: accumulated,
    pageCount,
  };
}

export async function fetchCatalogueRecordsFromAirtable(): Promise<CatalogueAirtableFetchResult> {
  const { rows, pageCount } =
    await listRecordingRowsFromAirtable();

  return {
    records: sortCatalogueRecords(
      rows.map(mapRecordingRecord),
    ),
    pageCount,
  };
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNullableString(
  value: unknown,
): value is string | null {
  return (
    value === null ||
    typeof value === "string"
  );
}

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) => typeof item === "string",
    )
  );
}

function isNullableFiniteNumber(
  value: unknown,
): value is number | null {
  return (
    value === null ||
    (
      typeof value === "number" &&
      Number.isFinite(value)
    )
  );
}

function isCatalogueRecord(
  value: unknown,
): value is CatalogueRecord {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.recordingId === "string" &&
    typeof value.title === "string" &&
    isNullableString(value.artistName) &&
    isNullableString(
      value.syncReadinessSummary,
    ) &&
    isNullableString(value.recordingType) &&
    isNullableString(value.oneStopStatus) &&
    isNullableString(value.explicitFlag) &&
    isStringArray(
      value.familyRecordingTypes,
    ) &&
    isNullableString(value.stemsAvailable) &&
    isNullableString(
      value.sampleClearanceStatus,
    ) &&
    isNullableString(value.rightsCoverage) &&
    isNullableString(
      value.releaseDateCurrent,
    ) &&
    isNullableString(value.isrc) &&
    isNullableString(value.masterOwner) &&
    isNullableString(value.duration) &&
    isNullableFiniteNumber(value.bpm) &&
    isNullableString(value.musicalKey) &&
    isNullableString(value.timeSignature) &&
    isNullableString(value.language) &&
    isStringArray(value.genreLabels) &&
    isStringArray(value.moodTags) &&
    isNullableString(value.shortLogline) &&
    isNullableString(
      value.rightsAdministrator,
    ) &&
    isNullableString(value.lastReviewed) &&
    isNullableString(value.lyricsPdfLink) &&
    isNullableString(
      value.chainOfTitlePdfLink,
    ) &&
    isNullableFiniteNumber(
      value.previewStartSeconds,
    )
  );
}

function parseCatalogueSnapshotPayload(
  payload: unknown,
): CatalogueRecord[] {
  if (
    !Array.isArray(payload) ||
    !payload.every(isCatalogueRecord)
  ) {
    throw new Error(
      "Sync catalogue snapshot payload is invalid",
    );
  }

  return payload;
}

export async function listCatalogueRecords(): Promise<CatalogueRecord[]> {
  const snapshot =
    await requireAirtableContentSnapshot(
      "sync_catalogue",
    );

  const records =
    parseCatalogueSnapshotPayload(
      snapshot.payload,
    );

  if (snapshot.itemCount !== records.length) {
    throw new Error(
      "Sync catalogue snapshot count does not match its payload",
    );
  }

  return sortCatalogueRecords(records);
}

export async function getCatalogueRecordByRecordingId(
  recordingId: string,
): Promise<CatalogueRecord | null> {
  const normalizedRecordingId =
    recordingId.trim();

  if (!normalizedRecordingId) {
    return null;
  }

  const records =
    await listCatalogueRecords();

  return (
    records.find(
      (record) =>
        record.recordingId ===
        normalizedRecordingId,
    ) ?? null
  );
}
