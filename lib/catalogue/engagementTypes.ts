export const CATALOGUE_ENGAGEMENT_EVENT_TYPES = [
  "catalogue_open",
  "detail_open",
  "play_full",
  "play_clip",
  "shortlist_add",
  "shortlist_remove",
  "licensing_open",
] as const;

export type CatalogueEngagementEventType =
  (typeof CATALOGUE_ENGAGEMENT_EVENT_TYPES)[number];

export type CatalogueEngagementEventRequest = {
  clientEventId: string;
  sessionId: string;
  eventType: CatalogueEngagementEventType;
  recordingId: string | null;
  selectionCount: number | null;
};

export type CatalogueEngagementTotals = {
  events: number;
  sessions: number;
  attributedSessions: number;
  catalogueOpens: number;
  detailOpens: number;
  fullPlays: number;
  clipPlays: number;
  shortlistAdds: number;
  shortlistRemoves: number;
  licensingOpens: number;
  enquiries: number;
  attributedEnquiries: number;
};

export type CatalogueRecordingEngagement = {
  recordingId: string;
  title: string | null;
  detailOpens: number;
  fullPlays: number;
  clipPlays: number;
  shortlistAdds: number;
};

export type CatalogueShareEngagement = {
  shareLinkId: string;
  recipientName: string | null;
  recipientEmail: string | null;
  label: string | null;
  sessions: number;
  events: number;
  licensingOpens: number;
  enquiries: number;
};

export type CatalogueEngagementSummary = {
  periodDays: number;
  generatedAt: string;
  totals: CatalogueEngagementTotals;
  recordings: CatalogueRecordingEngagement[];
  shares: CatalogueShareEngagement[];
};
