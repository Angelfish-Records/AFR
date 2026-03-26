import type {
  AirtableAttachment,
  AirtableCellValue,
  AirtableRecord,
  CatalogueRecord,
  RecordingAirtableFields,
} from "@/lib/catalogue/types";

function asString(value: AirtableCellValue): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function asNumber(value: AirtableCellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asStringArray(value: AirtableCellValue): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  const single = asString(value);
  if (!single) {
    return [];
  }

  return single
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function asAttachmentArray(value: AirtableCellValue): AirtableAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is AirtableAttachment => {
    return typeof item === "object" && item !== null;
  });
}

function asUrl(value: AirtableCellValue): string | null {
  const direct = asString(value);
  if (direct) {
    return direct;
  }

  const attachments = asAttachmentArray(value);
  const firstAttachmentUrl = attachments[0]?.url;
  return typeof firstAttachmentUrl === "string" ? firstAttachmentUrl : null;
}

function formatDateForDisplay(raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat("en-NZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function requireString(
  value: AirtableCellValue,
  fieldName: string,
  recordId: string
): string {
  const stringValue = asString(value);

  if (!stringValue) {
    throw new Error(`Missing required field "${fieldName}" on record ${recordId}`);
  }

  return stringValue;
}

export function mapRecordingRecord(
  record: AirtableRecord<RecordingAirtableFields>
): CatalogueRecord {
  const { fields } = record;

  const recordingId = requireString(fields["Recording ID"], "Recording ID", record.id);
  const title = requireString(
    fields["Recording Title (Display)"],
    "Recording Title (Display)",
    record.id
  );

  const previewStartSecondsRaw = asNumber(fields["Preview Start Seconds"]);
  const previewStartSeconds =
    previewStartSecondsRaw !== null && previewStartSecondsRaw >= 0
      ? previewStartSecondsRaw
      : null;

  return {
    id: record.id,
    recordingId,
    title,
    syncReadinessSummary: asString(fields["Sync Readiness Summary"]),
    recordingType: asString(fields["Recording Type"]),
    rightsCoverage: asString(fields["Rights Coverage"]),
    geoRestrictions: asString(fields["Geo Restrictions"]),
    knownLegalRisks: asString(fields["Known Legal Risks"]),
    releaseDateCurrent: formatDateForDisplay(asString(fields["Release Date (Current)"])),
    isrc: asString(fields.ISRC),
    masterOwner: asString(fields["Master Owner"]),
    masterSplitSummary: asString(fields["Master Split [Rights Source]"]),
    compositionPublishingSplitSummary: asString(
      fields["Composition/Publishing Split [Rights Source]"]
    ),
    duration: asString(fields.Duration),
    language: asString(fields.Language),
    genreLabels: asStringArray(fields.Genre),
    moodTags: asStringArray(fields["Mood / Tags"]),
    shortLogline: asString(fields["Short Logline"]),
    rightsAdministrator: asString(fields["Rights Administrator"]),
    lastReviewed: formatDateForDisplay(asString(fields["Last Reviewed"])),
    lyricsPdfLink: asUrl(fields["Lyrics PDF Link"]),
    chainOfTitlePdfLink: asUrl(fields["Chain-of-Title PDF Link"]),
    previewStartSeconds,
  };
}