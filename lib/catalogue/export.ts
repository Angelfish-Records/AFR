import type { CatalogueRecord } from "@/lib/catalogue/types";
import { getCatalogueRecordByRecordingId } from "@/lib/catalogue/queries";

export type CatalogueExportRecord = {
  recordingId: string;
  title: string;
  subtitle: string | null;
  logline: string | null;
  readiness: {
    raw: string | null;
    pills: string[];
  };
  audio: {
    duration: string | null;
    previewStartSeconds: number | null;
    previewLabel: string | null;
  };
  descriptors: {
    recordingType: string | null;
    language: string | null;
    genreLabels: string[];
    moodTags: string[];
  };
  rights: {
    coverage: string | null;
    knownLegalRisks: string | null;
    masterOwner: string | null;
    masterSplitSummary: string | null;
    compositionPublishingSplitSummary: string | null;
    rightsAdministrator: string | null;
  };
  identifiers: {
    isrc: string | null;
    releaseDateCurrent: string | null;
    lastReviewed: string | null;
  };
  documentation: {
    lyricsPdfLink: string | null;
    chainOfTitlePdfLink: string | null;
  };
};

function splitReadiness(summary: string | null): string[] {
  if (!summary) {
    return [];
  }

  return summary
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function formatPreviewLabel(previewStartSeconds: number | null): string | null {
  if (previewStartSeconds === null || previewStartSeconds < 0) {
    return null;
  }

  const minutes = Math.floor(previewStartSeconds / 60);
  const seconds = previewStartSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function mapCatalogueRecordToExportRecord(
  record: CatalogueRecord,
): CatalogueExportRecord {
  return {
    recordingId: record.recordingId,
    title: record.title,
    subtitle: record.recordingType,
    logline: record.shortLogline,
    readiness: {
      raw: record.syncReadinessSummary,
      pills: splitReadiness(record.syncReadinessSummary),
    },
    audio: {
      duration: record.duration,
      previewStartSeconds: record.previewStartSeconds,
      previewLabel: formatPreviewLabel(record.previewStartSeconds),
    },
    descriptors: {
      recordingType: record.recordingType,
      language: record.language,
      genreLabels: record.genreLabels,
      moodTags: record.moodTags,
    },
    rights: {
      coverage: record.rightsCoverage,
      knownLegalRisks: record.knownLegalRisks,
      masterOwner: record.masterOwner,
      masterSplitSummary: record.masterSplitSummary,
      compositionPublishingSplitSummary:
        record.compositionPublishingSplitSummary,
      rightsAdministrator: record.rightsAdministrator,
    },
    identifiers: {
      isrc: record.isrc,
      releaseDateCurrent: record.releaseDateCurrent,
      lastReviewed: record.lastReviewed,
    },
    documentation: {
      lyricsPdfLink: record.lyricsPdfLink,
      chainOfTitlePdfLink: record.chainOfTitlePdfLink,
    },
  };
}

export function mapCatalogueRecordsToExportRecords(
  records: CatalogueRecord[],
): CatalogueExportRecord[] {
  return records.map(mapCatalogueRecordToExportRecord);
}

export async function getExportRecordsByRecordingIds(
  recordingIds: string[],
): Promise<CatalogueExportRecord[]> {
  const records = await Promise.all(
    recordingIds.map((recordingId) =>
      getCatalogueRecordByRecordingId(recordingId),
    ),
  );

  return records
    .filter((record): record is CatalogueRecord => record !== null)
    .map(mapCatalogueRecordToExportRecord);
}
