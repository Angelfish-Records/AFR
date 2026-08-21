import crypto from "crypto";
import { sql } from "@vercel/postgres";
import type { CatalogueLicensingEnquiryRequest } from "@/lib/catalogue/licensingEnquiryTypes";

export type CatalogueLicensingTrackSnapshot = {
  recordingId: string;
  title: string;
  artistName: string | null;
  position: number;
};

export type PersistCatalogueLicensingEnquiryInput = {
  submission: CatalogueLicensingEnquiryRequest;
  shareLinkId: string | null;
  tracks: CatalogueLicensingTrackSnapshot[];
};

export type CatalogueLicensingNotificationStatus =
  | "pending"
  | "sent"
  | "failed";

export type PersistCatalogueLicensingEnquiryResult = {
  id: string;
  notificationStatus: CatalogueLicensingNotificationStatus;
  notificationResendId: string | null;
};

type PersistenceRow = {
  id: string;
  request_hash: string;
  notification_status: string;
  notification_resend_id: string | null;
};

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requestHash(input: PersistCatalogueLicensingEnquiryInput): string {
  const canonical = JSON.stringify({
    shareLinkId: input.shareLinkId,
    submission: input.submission,
    tracks: input.tracks,
  });

  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function parseNotificationStatus(
  value: string,
): CatalogueLicensingNotificationStatus {
  if (value === "sent" || value === "failed") {
    return value;
  }

  return "pending";
}

export async function persistCatalogueLicensingEnquiry(
  input: PersistCatalogueLicensingEnquiryInput,
): Promise<PersistCatalogueLicensingEnquiryResult> {
  if (input.tracks.length === 0) {
    throw new Error("Cannot persist a licensing enquiry without tracks");
  }

  const enquiryId = crypto.randomUUID();
  const hash = requestHash(input);

  const trackRows = input.tracks.map((track) => ({
    id: crypto.randomUUID(),
    recording_id: track.recordingId,
    title_snapshot: track.title,
    artist_snapshot: track.artistName,
    sort_order: track.position,
  }));

  const trackRowsJson = JSON.stringify(trackRows);

  const result = await sql<PersistenceRow>`
    with upserted_enquiry as (
      insert into catalogue_licensing_enquiries (
        id,
        client_request_id,
        request_hash,
        share_link_id,
        requester_name,
        requester_email,
        company,
        project_name,
        medium_use,
        territory,
        term_timeframe,
        rights_request,
        budget,
        deadline,
        notes
      )
      values (
        ${enquiryId}::uuid,
        ${input.submission.clientRequestId},
        ${hash},
        ${input.shareLinkId}::uuid,
        ${input.submission.requesterName},
        ${input.submission.requesterEmail},
        ${nullableText(input.submission.company)},
        ${input.submission.projectName},
        ${input.submission.mediumUse},
        ${input.submission.territory},
        ${input.submission.termTimeframe},
        ${input.submission.rightsRequest},
        ${nullableText(input.submission.budget)},
        ${nullableText(input.submission.deadline)},
        ${nullableText(input.submission.notes)}
      )
      on conflict (client_request_id) do update set
        client_request_id =
          catalogue_licensing_enquiries.client_request_id
      returning
        id,
        request_hash,
        notification_status,
        notification_resend_id
    ),
    inserted_tracks as (
      insert into catalogue_licensing_enquiry_tracks (
        id,
        enquiry_id,
        recording_id,
        title_snapshot,
        artist_snapshot,
        sort_order
      )
      select
        track.id::uuid,
        upserted_enquiry.id,
        track.recording_id,
        track.title_snapshot,
        track.artist_snapshot,
        track.sort_order
      from upserted_enquiry
      cross join lateral jsonb_to_recordset(
        ${trackRowsJson}::jsonb
      ) as track(
        id text,
        recording_id text,
        title_snapshot text,
        artist_snapshot text,
        sort_order integer
      )
      where upserted_enquiry.request_hash = ${hash}
      on conflict (enquiry_id, recording_id) do nothing
      returning id
    )
    select
      id::text,
      request_hash,
      notification_status,
      notification_resend_id
    from upserted_enquiry
  `;

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to persist catalogue licensing enquiry");
  }

  if (row.request_hash !== hash) {
    throw new Error(
      "Client request id was already used for a different enquiry",
    );
  }

  return {
    id: row.id,
    notificationStatus: parseNotificationStatus(row.notification_status),
    notificationResendId: row.notification_resend_id,
  };
}

export async function markCatalogueLicensingNotificationSent(
  enquiryId: string,
  resendMessageId: string,
): Promise<void> {
  await sql`
    update catalogue_licensing_enquiries
    set
      notification_status = 'sent',
      notification_resend_id = ${resendMessageId},
      notification_error = null,
      notified_at = now()
    where id = ${enquiryId}::uuid
  `;
}

export async function markCatalogueLicensingNotificationFailed(
  enquiryId: string,
  errorMessage: string,
): Promise<void> {
  const safeError = errorMessage.trim().slice(0, 2000);

  await sql`
    update catalogue_licensing_enquiries
    set
      notification_status = 'failed',
      notification_error = ${
        safeError || "Unknown notification failure"
      }
    where id = ${enquiryId}::uuid
  `;
}
