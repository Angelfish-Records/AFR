export type CatalogueRecord = {
  id: string;
  recordingId: string;
  title: string;
  artistName: string | null;
  syncReadinessSummary: string | null;
  recordingType: string | null;
  oneStopStatus: string | null;
  explicitFlag: string | null;
  familyRecordingTypes: string[];
  stemsAvailable: string | null;
  sampleClearanceStatus: string | null;
  rightsCoverage: string | null;
  releaseDateCurrent: string | null;
  isrc: string | null;
  masterOwner: string | null;
  duration: string | null;
  bpm: number | null;
  musicalKey: string | null;
  timeSignature: string | null;
  language: string | null;
  genreLabels: string[];
  moodTags: string[];
  shortLogline: string | null;
  rightsAdministrator: string | null;
  lastReviewed: string | null;
  lyricsPdfLink: string | null;
  chainOfTitlePdfLink: string | null;
  previewStartSeconds: number | null;
};

export type CatalogueRecordListItem = Pick<
  CatalogueRecord,
  | "id"
  | "recordingId"
  | "title"
  | "artistName"
  | "syncReadinessSummary"
  | "recordingType"
  | "oneStopStatus"
  | "explicitFlag"
  | "familyRecordingTypes"
  | "stemsAvailable"
  | "masterOwner"
  | "rightsAdministrator"
  | "duration"
  | "genreLabels"
  | "moodTags"
  | "shortLogline"
>;

export type AirtableAttachment = {
  id?: string;
  url?: string;
  filename?: string;
  type?: string;
};

export type AirtableCellValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | AirtableAttachment[]
  | Record<string, unknown>;

export type AirtableRecordFields = Record<string, AirtableCellValue>;

export type AirtableRecord<TFields extends AirtableRecordFields> = {
  id: string;
  createdTime?: string;
  fields: TFields;
};

export type RecordingAirtableFields = {
  "Recording ID"?: AirtableCellValue;
  "Recording Title (Display)"?: AirtableCellValue;
  "Artist (Derived)"?: AirtableCellValue;
  "Sync Readiness Summary"?: AirtableCellValue;
  "Recording Type"?: AirtableCellValue;
  "One-Stop Status"?: AirtableCellValue;
  "Explicit Flag"?: AirtableCellValue;
  "Family Recording Types [Lookup]"?: AirtableCellValue;
  "Stems Available"?: AirtableCellValue;
  "Sample Clearance Status"?: AirtableCellValue;
  "Rights Coverage"?: AirtableCellValue;
  "Release Date (Current)"?: AirtableCellValue;
  ISRC?: AirtableCellValue;
  "Master Owner"?: AirtableCellValue;
  Duration?: AirtableCellValue;
  BPM?: AirtableCellValue;
  Key?: AirtableCellValue;
  "Time Signature"?: AirtableCellValue;
  Language?: AirtableCellValue;
  Genre?: AirtableCellValue;
  "Mood / Tags"?: AirtableCellValue;
  "Short Logline"?: AirtableCellValue;
  "Rights Administrator"?: AirtableCellValue;
  "Last Reviewed"?: AirtableCellValue;
  "Lyrics PDF Link"?: AirtableCellValue;
  "Chain-of-Title PDF Link"?: AirtableCellValue;
  "Preview Start Seconds"?: AirtableCellValue;
};
