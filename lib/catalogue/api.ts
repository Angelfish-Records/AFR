import type { CatalogueRecord, CatalogueRecordListItem } from "@/lib/catalogue/types";

export type CatalogueListResponse = {
  records: CatalogueRecordListItem[];
  count: number;
};

export type CatalogueDetailResponse = {
  record: CatalogueRecord;
};

export function toCatalogueListItem(
  record: CatalogueRecord,
): CatalogueRecordListItem {
  return {
    id: record.id,
    recordingId: record.recordingId,
    title: record.title,
    artistName: record.artistName,
    syncReadinessSummary: record.syncReadinessSummary,
    recordingType: record.recordingType,
    oneStopStatus: record.oneStopStatus,
    explicitFlag: record.explicitFlag,
    familyRecordingTypes: record.familyRecordingTypes,
    stemsAvailable: record.stemsAvailable,
    masterOwner: record.masterOwner,
    rightsAdministrator: record.rightsAdministrator,
    duration: record.duration,
    genreLabels: record.genreLabels,
    moodTags: record.moodTags,
    shortLogline: record.shortLogline,
  };
}