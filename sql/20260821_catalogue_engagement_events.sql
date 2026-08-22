-- AFR catalogue engagement telemetry
-- Privacy-light first-party event storage.
-- No IP address, user-agent, cookie identifier, or persistent browser ID.

begin;

create table catalogue_engagement_events (
  id uuid primary key,
  client_event_id uuid not null unique,
  session_id uuid not null,

  share_link_id uuid null
    references catalogue_share_links(id)
    on delete set null,

  event_type text not null
    check (
      event_type in (
        'catalogue_open',
        'detail_open',
        'play_full',
        'play_clip',
        'shortlist_add',
        'shortlist_remove',
        'licensing_open'
      )
    ),

  recording_id text null,
  recording_title_snapshot text null,

  selection_count integer null
    check (
      selection_count is null
      or selection_count between 1 and 20
    ),

  created_at timestamp with time zone not null default now(),

  check (
    (
      event_type in (
        'detail_open',
        'play_full',
        'play_clip',
        'shortlist_add',
        'shortlist_remove'
      )
      and recording_id is not null
      and recording_title_snapshot is not null
      and selection_count is null
    )
    or
    (
      event_type = 'catalogue_open'
      and recording_id is null
      and recording_title_snapshot is null
      and selection_count is null
    )
    or
    (
      event_type = 'licensing_open'
      and recording_id is null
      and recording_title_snapshot is null
      and selection_count between 1 and 20
    )
  )
);

create index catalogue_engagement_events_created_at_idx
  on catalogue_engagement_events (created_at desc);

create index catalogue_engagement_events_session_created_idx
  on catalogue_engagement_events (session_id, created_at desc);

create index catalogue_engagement_events_recording_created_idx
  on catalogue_engagement_events (
    recording_id,
    created_at desc
  )
  where recording_id is not null;

create index catalogue_engagement_events_share_created_idx
  on catalogue_engagement_events (
    share_link_id,
    created_at desc
  )
  where share_link_id is not null;

create index catalogue_engagement_events_type_created_idx
  on catalogue_engagement_events (event_type, created_at desc);

commit;
