import {
  airtableGet,
  escapeAirtableFormulaString,
  getAirtableConfig,
} from "@/lib/catalogue/airtable";
import { DEFAULT_CATALOGUE_PAGE_SIZE } from "@/lib/catalogue/constants";
import { mapRecordingRecord } from "@/lib/catalogue/mappers";
import type {
  AirtableRecord,
  AirtableRecordFields,
  CatalogueRecord,
  RecordingAirtableFields,
} from "@/lib/catalogue/types";

type AirtableListResponse<TFields extends AirtableRecordFields> = {
  records: Array<AirtableRecord<TFields>>;
  offset?: string;
};

function compareRecordingIds(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function listRecordingRows(): Promise<
  Array<AirtableRecord<RecordingAirtableFields>>
> {
  const { baseId, recordingsTableId, recordingsViewId } = getAirtableConfig();

  const accumulated: Array<AirtableRecord<RecordingAirtableFields>> = [];
  let offset: string | undefined;

  do {
    const response = await airtableGet<AirtableListResponse<RecordingAirtableFields>>({
      path: `${baseId}/${encodeURIComponent(recordingsTableId)}`,
      searchParams: {
        view: recordingsViewId,
        pageSize: String(DEFAULT_CATALOGUE_PAGE_SIZE),
        ...(offset ? { offset } : {}),
      },
    });

    accumulated.push(...response.records);
    offset = response.offset;
  } while (offset);

  return accumulated;
}

async function findRecordingRowByRecordingId(
  recordingId: string
): Promise<AirtableRecord<RecordingAirtableFields> | null> {
  const { baseId, recordingsTableId, recordingsViewId } = getAirtableConfig();

  const normalizedRecordingId = recordingId.trim();

  if (normalizedRecordingId.length === 0) {
    return null;
  }

  const escapedRecordingId = escapeAirtableFormulaString(normalizedRecordingId);

  const response = await airtableGet<AirtableListResponse<RecordingAirtableFields>>({
    path: `${baseId}/${encodeURIComponent(recordingsTableId)}`,
    searchParams: {
      view: recordingsViewId,
      maxRecords: "1",
      filterByFormula: `{Recording ID}="${escapedRecordingId}"`,
    },
  });

  return response.records[0] ?? null;
}

export async function listCatalogueRecords(): Promise<CatalogueRecord[]> {
  const rows = await listRecordingRows();

  return rows
    .map(mapRecordingRecord)
    .sort((left, right) =>
      compareRecordingIds(left.recordingId, right.recordingId)
    );
}

export async function getCatalogueRecordByRecordingId(
  recordingId: string
): Promise<CatalogueRecord | null> {
  const row = await findRecordingRowByRecordingId(recordingId);

  if (!row) {
    return null;
  }

  return mapRecordingRecord(row);
}