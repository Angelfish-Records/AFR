-- AFR catalogue licensing enquiry transaction schema
-- Additive migration. Apply once before deploying the enquiry API.

begin;

create table catalogue_licensing_enquiries (
  id uuid primary key,
  client_request_id text not null unique,
  request_hash text not null,

  share_link_id uuid null
    references catalogue_share_links(id)
    on delete set null,

  requester_name text not null,
  requester_email text not null,
  company text null,

  project_name text not null,
  medium_use text not null,
  territory text not null,
  term_timeframe text not null,

  rights_request text not null
    check (rights_request in ('full_sync', 'master_only')),

  budget text null,
  deadline text null,
  notes text null,

  status text not null default 'new',

  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'failed')),
  notification_resend_id text null,
  notification_error text null,
  notified_at timestamp with time zone null,

  created_at timestamp with time zone not null default now()
);

create table catalogue_licensing_enquiry_tracks (
  id uuid primary key,

  enquiry_id uuid not null
    references catalogue_licensing_enquiries(id)
    on delete cascade,

  recording_id text not null,
  title_snapshot text not null,
  artist_snapshot text null,
  sort_order integer not null,

  unique (enquiry_id, recording_id)
);

create index catalogue_licensing_enquiries_created_at_idx
  on catalogue_licensing_enquiries (created_at desc);

create index catalogue_licensing_enquiries_share_link_id_idx
  on catalogue_licensing_enquiries (share_link_id);

create index catalogue_licensing_enquiry_tracks_enquiry_id_idx
  on catalogue_licensing_enquiry_tracks (enquiry_id, sort_order);

commit;
