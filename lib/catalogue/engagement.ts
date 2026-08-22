import crypto from "crypto";
import { sql } from "@vercel/postgres";
import type {
  CatalogueEngagementEventRequest,
  CatalogueEngagementEventType,
  CatalogueEngagementSummary,
  CatalogueRecordingEngagement,
  CatalogueShareEngagement,
} from "@/lib/catalogue/engagementTypes";

type PersistInput = CatalogueEngagementEventRequest & {
  shareLinkId: string | null;
  recordingTitle: string | null;
};

type InsertedRow = {
  id: string;
};

type TotalsRow = {
  events: number;
  sessions: number;
  attributed_sessions: number;
  catalogue_opens: number;
  detail_opens: number;
  full_plays: number;
  clip_plays: number;
  shortlist_adds: number;
  shortlist_removes: number;
  licensing_opens: number;
};

type EnquiryTotalsRow = {
  enquiries: number;
  attributed_enquiries: number;
};

type RecordingRow = {
  recording_id: string;
  title: string | null;
  detail_opens: number;
  full_plays: number;
  clip_plays: number;
  shortlist_adds: number;
};

type ShareRow = {
  share_link_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  label: string | null;
  sessions: number;
  events: number;
  licensing_opens: number;
  enquiries: number;
};

export async function persistCatalogueEngagementEvent(
  input: PersistInput,
): Promise<boolean> {
  const id = crypto.randomUUID();

  const result = await sql<InsertedRow>`
    insert into catalogue_engagement_events (
      id,
      client_event_id,
      session_id,
      share_link_id,
      event_type,
      recording_id,
      recording_title_snapshot,
      selection_count
    )
    select
      ${id}::uuid,
      ${input.clientEventId}::uuid,
      ${input.sessionId}::uuid,
      ${input.shareLinkId}::uuid,
      ${input.eventType},
      ${input.recordingId},
      ${input.recordingTitle},
      ${input.selectionCount}
    where (
      select count(*)
      from catalogue_engagement_events
      where session_id = ${input.sessionId}::uuid
        and created_at > now() - interval '1 hour'
    ) < 120
    on conflict (client_event_id) do nothing
    returning id::text
  `;

  return Boolean(result.rows[0]?.id);
}

export async function getCatalogueEngagementSummary(
  periodDays = 30,
): Promise<CatalogueEngagementSummary> {
  const safeDays = Math.max(
    1,
    Math.min(365, Math.floor(periodDays)),
  );

  const totalsResult = await sql<TotalsRow>`
    select
      count(*)::int as events,
      count(distinct session_id)::int as sessions,
      count(distinct session_id)
        filter (where share_link_id is not null)::int
        as attributed_sessions,
      count(*) filter (where event_type = 'catalogue_open')::int
        as catalogue_opens,
      count(*) filter (where event_type = 'detail_open')::int
        as detail_opens,
      count(*) filter (where event_type = 'play_full')::int
        as full_plays,
      count(*) filter (where event_type = 'play_clip')::int
        as clip_plays,
      count(*) filter (where event_type = 'shortlist_add')::int
        as shortlist_adds,
      count(*) filter (where event_type = 'shortlist_remove')::int
        as shortlist_removes,
      count(*) filter (where event_type = 'licensing_open')::int
        as licensing_opens
    from catalogue_engagement_events
    where created_at >= now() - make_interval(days => ${safeDays})
  `;

  const enquiryResult = await sql<EnquiryTotalsRow>`
    select
      count(*)::int as enquiries,
      count(*) filter (where share_link_id is not null)::int
        as attributed_enquiries
    from catalogue_licensing_enquiries
    where created_at >= now() - make_interval(days => ${safeDays})
  `;

  const recordingsResult = await sql<RecordingRow>`
    select
      recording_id,
      max(recording_title_snapshot) as title,
      count(*) filter (where event_type = 'detail_open')::int
        as detail_opens,
      count(*) filter (where event_type = 'play_full')::int
        as full_plays,
      count(*) filter (where event_type = 'play_clip')::int
        as clip_plays,
      count(*) filter (where event_type = 'shortlist_add')::int
        as shortlist_adds
    from catalogue_engagement_events
    where created_at >= now() - make_interval(days => ${safeDays})
      and recording_id is not null
    group by recording_id
    order by
      (
        count(*) filter (where event_type = 'detail_open') +
        count(*) filter (where event_type = 'play_full') +
        count(*) filter (where event_type = 'play_clip') +
        count(*) filter (where event_type = 'shortlist_add')
      ) desc,
      recording_id asc
    limit 20
  `;

  const sharesResult = await sql<ShareRow>`
    with relevant_links as (
      select distinct share_link_id
      from catalogue_engagement_events
      where created_at >= now() - make_interval(days => ${safeDays})
        and share_link_id is not null

      union

      select distinct share_link_id
      from catalogue_licensing_enquiries
      where created_at >= now() - make_interval(days => ${safeDays})
        and share_link_id is not null
    ),
    event_rollup as (
      select
        share_link_id,
        count(distinct session_id)::int as sessions,
        count(*)::int as events,
        count(*) filter (where event_type = 'licensing_open')::int
          as licensing_opens
      from catalogue_engagement_events
      where created_at >= now() - make_interval(days => ${safeDays})
        and share_link_id is not null
      group by share_link_id
    ),
    enquiry_rollup as (
      select
        share_link_id,
        count(*)::int as enquiries
      from catalogue_licensing_enquiries
      where created_at >= now() - make_interval(days => ${safeDays})
        and share_link_id is not null
      group by share_link_id
    )
    select
      ids.share_link_id::text as share_link_id,
      links.recipient_name,
      links.recipient_email,
      links.label,
      coalesce(events.sessions, 0)::int as sessions,
      coalesce(events.events, 0)::int as events,
      coalesce(events.licensing_opens, 0)::int as licensing_opens,
      coalesce(enquiries.enquiries, 0)::int as enquiries
    from relevant_links ids
    join catalogue_share_links links
      on links.id = ids.share_link_id
    left join event_rollup events
      on events.share_link_id = ids.share_link_id
    left join enquiry_rollup enquiries
      on enquiries.share_link_id = ids.share_link_id
    order by
      coalesce(enquiries.enquiries, 0) desc,
      coalesce(events.events, 0) desc,
      links.created_at desc
    limit 30
  `;

  const totals = totalsResult.rows[0] ?? {
    events: 0,
    sessions: 0,
    attributed_sessions: 0,
    catalogue_opens: 0,
    detail_opens: 0,
    full_plays: 0,
    clip_plays: 0,
    shortlist_adds: 0,
    shortlist_removes: 0,
    licensing_opens: 0,
  };

  const enquiryTotals = enquiryResult.rows[0] ?? {
    enquiries: 0,
    attributed_enquiries: 0,
  };

  const recordings: CatalogueRecordingEngagement[] =
    recordingsResult.rows.map((row) => ({
      recordingId: row.recording_id,
      title: row.title,
      detailOpens: row.detail_opens,
      fullPlays: row.full_plays,
      clipPlays: row.clip_plays,
      shortlistAdds: row.shortlist_adds,
    }));

  const shares: CatalogueShareEngagement[] =
    sharesResult.rows.map((row) => ({
      shareLinkId: row.share_link_id,
      recipientName: row.recipient_name,
      recipientEmail: row.recipient_email,
      label: row.label,
      sessions: row.sessions,
      events: row.events,
      licensingOpens: row.licensing_opens,
      enquiries: row.enquiries,
    }));

  return {
    periodDays: safeDays,
    generatedAt: new Date().toISOString(),
    totals: {
      events: totals.events,
      sessions: totals.sessions,
      attributedSessions: totals.attributed_sessions,
      catalogueOpens: totals.catalogue_opens,
      detailOpens: totals.detail_opens,
      fullPlays: totals.full_plays,
      clipPlays: totals.clip_plays,
      shortlistAdds: totals.shortlist_adds,
      shortlistRemoves: totals.shortlist_removes,
      licensingOpens: totals.licensing_opens,
      enquiries: enquiryTotals.enquiries,
      attributedEnquiries: enquiryTotals.attributed_enquiries,
    },
    recordings,
    shares,
  };
}

export function isRecordingEngagementEvent(
  eventType: CatalogueEngagementEventType,
): boolean {
  return (
    eventType === "detail_open" ||
    eventType === "play_full" ||
    eventType === "play_clip" ||
    eventType === "shortlist_add" ||
    eventType === "shortlist_remove"
  );
}
