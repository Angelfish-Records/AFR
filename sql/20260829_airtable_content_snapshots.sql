-- AFR Airtable content snapshots.
-- Additive pre-deploy migration.
-- Public catalogue reads use these durable last-known-good snapshots.

begin;

create table airtable_content_snapshots (
  snapshot_key text primary key
    check (
      snapshot_key in (
        'sync_catalogue',
        'website_catalogue'
      )
    ),

  payload jsonb not null
    check (jsonb_typeof(payload) = 'array'),

  item_count integer not null
    check (item_count >= 0),

  source_hash text not null
    check (
      source_hash ~ '^[0-9a-f]{64}$'
    ),

  refreshed_at timestamp with time zone
    not null
    default now()
);

create index
  airtable_content_snapshots_refreshed_at_idx
  on airtable_content_snapshots (
    refreshed_at desc
  );

create table airtable_content_refresh_locks (
  lock_key text primary key
    check (lock_key = 'catalogue'),

  locked_until timestamp with time zone
    not null,

  updated_at timestamp with time zone
    not null
    default now()
);

insert into airtable_content_refresh_locks (
  lock_key,
  locked_until
)
values (
  'catalogue',
  '-infinity'::timestamp with time zone
);

commit;
