// lib/catalogue/queries.ts
import { airtableGet, getAirtableConfig } from "@/lib/catalogue/airtable";
import { requireAirtableContentSnapshot } from "@/lib/catalogue/contentSnapshots";
import { mapRecordingRecord } from "@/lib/catalogue/mappers";
import type {
  AirtableCellValue,
  AirtableRecord,
  AirtableRecordFields,
  CatalogueRecord,
  RecordingAirtableFields,
} from "@/lib/catalogue/types";

type AirtableListResponse<TFields extends AirtableRecordFields> = {
  records: Array<AirtableRecord<TFields>>;
  offset?: string;
};

export type CataloguePlaybackSourceMetadata = {
  recordingId: string;
  playbackId: string;
  durationMs: number;
};

export type CataloguePlaybackSnapshotEntry = {
  recordingId: string;
  original: CataloguePlaybackSourceMetadata;
  instrumental: CataloguePlaybackSourceMetadata | null;
};

export type CatalogueAirtableFetchResult = {
  records: CatalogueRecord[];
  playback: CataloguePlaybackSnapshotEntry[];
  pageCount: number;
};

function compareRecordingIds(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortCatalogueRecords(records: CatalogueRecord[]): CatalogueRecord[] {
  return records
    .slice()
    .sort((left, right) =>
      compareRecordingIds(left.recordingId, right.recordingId),
    );
}

function sortPlaybackEntries(
  entries: CataloguePlaybackSnapshotEntry[],
): CataloguePlaybackSnapshotEntry[] {
  return entries
    .slice()
    .sort((left, right) =>
      compareRecordingIds(left.recordingId, right.recordingId),
    );
}

function asNonEmptyString(value: AirtableCellValue): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInteger(value: AirtableCellValue): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

function asLinkedRecordIds(value: AirtableCellValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" && /^rec[A-Za-z0-9]+$/.test(item),
  );
}

function normalizeRecordingType(value: AirtableCellValue): string {
  return asNonEmptyString(value)?.toLowerCase() ?? "";
}

function requirePlaybackSource(
  row: AirtableRecord<RecordingAirtableFields>,
  label: string,
): CataloguePlaybackSourceMetadata {
  const recordingId = asNonEmptyString(row.fields["Recording ID"]);
  const playbackId = asNonEmptyString(row.fields["Mux Playback ID"]);
  const durationMs = asPositiveInteger(row.fields["Mux Duration ms"]);

  if (!recordingId || !playbackId || durationMs === null) {
    throw new Error(
      `${label} ${recordingId ?? row.id} is missing valid Mux playback metadata`,
    );
  }

  return {
    recordingId,
    playbackId,
    durationMs,
  };
}

function optionalInstrumentalPlaybackSource(
  row: AirtableRecord<RecordingAirtableFields>,
): CataloguePlaybackSourceMetadata | null {
  const playbackId = asNonEmptyString(row.fields["Mux Playback ID"]);

  if (!playbackId) {
    return null;
  }

  const recordingId = asNonEmptyString(row.fields["Recording ID"]);
  const durationMs = asPositiveInteger(row.fields["Mux Duration ms"]);

  if (!recordingId || durationMs === null) {
    throw new Error(
      `Instrumental ${recordingId ?? row.id} has a Mux Playback ID but no valid Mux Duration ms`,
    );
  }

  return {
    recordingId,
    playbackId,
    durationMs,
  };
}

async function listRecordingRowsFromAirtable(): Promise<{
  rows: Array<AirtableRecord<RecordingAirtableFields>>;
  pageCount: number;
}> {
  const { baseId, recordingsTableId, recordingsViewId } = getAirtableConfig();

  const accumulated: Array<AirtableRecord<RecordingAirtableFields>> = [];

  let offset: string | undefined;
  let pageCount = 0;

  do {
    const response = await airtableGet<
      AirtableListResponse<RecordingAirtableFields>
    >({
      path: `${baseId}/` + encodeURIComponent(recordingsTableId),
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

async function listRecordingRowsByAirtableIds(recordIds: string[]): Promise<{
  rows: Array<AirtableRecord<RecordingAirtableFields>>;
  pageCount: number;
}> {
  if (recordIds.length === 0) {
    return {
      rows: [],
      pageCount: 0,
    };
  }

  const { baseId, recordingsTableId } = getAirtableConfig();

  const uniqueRecordIds = Array.from(new Set(recordIds));

  const formula =
    uniqueRecordIds.length === 1
      ? `RECORD_ID()='${uniqueRecordIds[0]}'`
      : `OR(${uniqueRecordIds
          .map((recordId) => `RECORD_ID()='${recordId}'`)
          .join(",")})`;

  const accumulated: Array<AirtableRecord<RecordingAirtableFields>> = [];

  let offset: string | undefined;
  let pageCount = 0;

  do {
    const response = await airtableGet<
      AirtableListResponse<RecordingAirtableFields>
    >({
      path: `${baseId}/` + encodeURIComponent(recordingsTableId),
      searchParams: {
        filterByFormula: formula,
        pageSize: "100",
        ...(offset ? { offset } : {}),
      },
    });

    pageCount += 1;
    accumulated.push(...response.records);
    offset = response.offset;
  } while (offset);

  if (accumulated.length !== uniqueRecordIds.length) {
    throw new Error(
      `Catalogue family lookup resolved ${accumulated.length} of ${uniqueRecordIds.length} Airtable recording rows`,
    );
  }

  return {
    rows: accumulated,
    pageCount,
  };
}

export async function fetchCatalogueRecordsFromAirtable(): Promise<CatalogueAirtableFetchResult> {
  const canonicalResult = await listRecordingRowsFromAirtable();

  const familyRecordIds = Array.from(
    new Set(
      canonicalResult.rows.flatMap((row) =>
        asLinkedRecordIds(row.fields["Family Recordings"]),
      ),
    ),
  );

  const familyResult = await listRecordingRowsByAirtableIds(familyRecordIds);

  const familyById = new Map(familyResult.rows.map((row) => [row.id, row]));

  const records: CatalogueRecord[] = [];
  const playback: CataloguePlaybackSnapshotEntry[] = [];

  for (const canonicalRow of canonicalResult.rows) {
    const mapped = mapRecordingRecord(canonicalRow);
    const linkedIds = asLinkedRecordIds(
      canonicalRow.fields["Family Recordings"],
    );

    if (linkedIds.length === 0) {
      throw new Error(
        `Catalogue record ${mapped.recordingId} has no Family Recordings relationship`,
      );
    }

    const familyRows = linkedIds.map((airtableRecordId) => {
      const row = familyById.get(airtableRecordId);

      if (!row) {
        throw new Error(
          `Catalogue record ${mapped.recordingId} references missing family row ${airtableRecordId}`,
        );
      }

      return row;
    });

    const instrumentalRows = familyRows.filter(
      (row) =>
        normalizeRecordingType(row.fields["Recording Type"]) === "instrumental",
    );

    if (instrumentalRows.length > 1) {
      throw new Error(
        `Catalogue record ${mapped.recordingId} has multiple Instrumental family rows`,
      );
    }

    const original = requirePlaybackSource(canonicalRow, "Original recording");

    const instrumental =
      instrumentalRows.length === 1
        ? optionalInstrumentalPlaybackSource(instrumentalRows[0])
        : null;

    records.push({
      ...mapped,
      hasInstrumentalPlayback: instrumental !== null,
    });

    playback.push({
      recordingId: mapped.recordingId,
      original,
      instrumental,
    });
  }

  return {
    records: sortCatalogueRecords(records),
    playback: sortPlaybackEntries(playback),
    pageCount: canonicalResult.pageCount + familyResult.pageCount,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

type SnapshotCatalogueRecord = Omit<
  CatalogueRecord,
  "hasInstrumentalPlayback" | "workId"
> & {
  workId?: string;
  hasInstrumentalPlayback?: boolean;
};

function isCatalogueRecordShape(
  value: unknown,
): value is SnapshotCatalogueRecord {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.recordingId === "string" &&
    (value.workId === undefined ||
      (typeof value.workId === "string" && value.workId.trim().length > 0)) &&
    typeof value.title === "string" &&
    isNullableString(value.artistName) &&
    isNullableString(value.syncReadinessSummary) &&
    isNullableString(value.recordingType) &&
    isNullableString(value.oneStopStatus) &&
    isNullableString(value.explicitFlag) &&
    isStringArray(value.familyRecordingTypes) &&
    isNullableString(value.stemsAvailable) &&
    isNullableString(value.sampleClearanceStatus) &&
    isNullableString(value.rightsCoverage) &&
    isNullableString(value.releaseDateCurrent) &&
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
    isNullableString(value.rightsAdministrator) &&
    isNullableString(value.lastReviewed) &&
    isNullableString(value.lyricsPdfLink) &&
    isNullableString(value.chainOfTitlePdfLink) &&
    isNullableFiniteNumber(value.previewStartSeconds) &&
    (value.hasInstrumentalPlayback === undefined ||
      typeof value.hasInstrumentalPlayback === "boolean")
  );
}

function normalizeCatalogueRecord(
  value: SnapshotCatalogueRecord,
): CatalogueRecord {
  return {
    ...value,
    workId:
      typeof value.workId === "string" && value.workId.trim().length > 0
        ? value.workId.trim()
        : value.recordingId,
    hasInstrumentalPlayback: value.hasInstrumentalPlayback === true,
  };
}

function parseCatalogueSnapshotPayload(payload: unknown): CatalogueRecord[] {
  if (!Array.isArray(payload) || !payload.every(isCatalogueRecordShape)) {
    throw new Error("Sync catalogue snapshot payload is invalid");
  }

  return payload.map(normalizeCatalogueRecord);
}

function isPlaybackSourceMetadata(
  value: unknown,
): value is CataloguePlaybackSourceMetadata {
  return (
    isObject(value) &&
    typeof value.recordingId === "string" &&
    value.recordingId.length > 0 &&
    typeof value.playbackId === "string" &&
    value.playbackId.length > 0 &&
    typeof value.durationMs === "number" &&
    Number.isInteger(value.durationMs) &&
    value.durationMs > 0
  );
}

function isPlaybackSnapshotEntry(
  value: unknown,
): value is CataloguePlaybackSnapshotEntry {
  return (
    isObject(value) &&
    typeof value.recordingId === "string" &&
    value.recordingId.length > 0 &&
    isPlaybackSourceMetadata(value.original) &&
    (value.instrumental === null ||
      isPlaybackSourceMetadata(value.instrumental))
  );
}

function parsePlaybackSnapshotPayload(
  payload: unknown,
): CataloguePlaybackSnapshotEntry[] {
  if (!Array.isArray(payload) || !payload.every(isPlaybackSnapshotEntry)) {
    throw new Error("Sync catalogue playback snapshot payload is invalid");
  }

  return sortPlaybackEntries(payload);
}

export async function listCatalogueRecords(): Promise<CatalogueRecord[]> {
  const snapshot = await requireAirtableContentSnapshot("sync_catalogue");

  const records = parseCatalogueSnapshotPayload(snapshot.payload);

  if (snapshot.itemCount !== records.length) {
    throw new Error("Sync catalogue snapshot count does not match its payload");
  }

  return sortCatalogueRecords(records);
}

export async function getCatalogueRecordByRecordingId(
  recordingId: string,
): Promise<CatalogueRecord | null> {
  const normalizedRecordingId = recordingId.trim();

  if (!normalizedRecordingId) {
    return null;
  }

  const records = await listCatalogueRecords();

  return (
    records.find((record) => record.recordingId === normalizedRecordingId) ??
    null
  );
}

export async function listCataloguePlaybackEntries(): Promise<
  CataloguePlaybackSnapshotEntry[]
> {
  const snapshot = await requireAirtableContentSnapshot(
    "sync_catalogue_playback",
  );

  const entries = parsePlaybackSnapshotPayload(snapshot.payload);

  if (snapshot.itemCount !== entries.length) {
    throw new Error(
      "Sync catalogue playback snapshot count does not match its payload",
    );
  }

  return entries;
}

export async function getCataloguePlaybackEntryByRecordingId(
  recordingId: string,
): Promise<CataloguePlaybackSnapshotEntry | null> {
  const normalizedRecordingId = recordingId.trim();

  if (!normalizedRecordingId) {
    return null;
  }

  const entries = await listCataloguePlaybackEntries();

  return (
    entries.find((entry) => entry.recordingId === normalizedRecordingId) ?? null
  );
}
