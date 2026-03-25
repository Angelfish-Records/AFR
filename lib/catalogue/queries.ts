import { airtableGet, getAirtableConfig } from "@/lib/catalogue/airtable";
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

export async function listCatalogueRecords(): Promise<CatalogueRecord[]> {
  const rows = await listRecordingRows();

  return rows
    .map(mapRecordingRecord)
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function getCatalogueRecordByRecordingId(
  recordingId: string
): Promise<CatalogueRecord | null> {
  const normalized = recordingId.trim().toLowerCase();
  const records = await listCatalogueRecords();

  const match =
    records.find((record) => record.recordingId.toLowerCase() === normalized) ?? null;

  return match;
}