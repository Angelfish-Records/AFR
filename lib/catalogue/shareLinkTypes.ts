export type CatalogueShareLinkSummary = {
  id: string;
  recipientName: string | null;
  recipientEmail: string | null;
  label: string | null;
  welcomeMessage: string | null;
  curatedRecordingIds: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  lastAccessedAt: string | null;
};

export type CatalogueShareLinkCreateInput = {
  recipientName: string | null;
  recipientEmail: string | null;
  label: string | null;
  welcomeMessage: string | null;
  curatedRecordingIds: string[];
  expiresAt: string | null;
  createdBy: string | null;
};

export type CatalogueSharePresentation = {
  recipientName: string | null;
  welcomeMessage: string | null;
  curatedRecordingIds: string[];
};
