-- AFR direct-Mux catalogue playback + instrumental telemetry.
-- Additive compatibility migration. No data rows are removed.

begin;

do $$
declare
  target_name text;
  target_count integer;
begin
  select
    min(c.conname),
    count(*)::integer
  into target_name, target_count
  from pg_constraint c
  where c.conrelid = 'airtable_content_snapshots'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%snapshot_key%'
    and pg_get_constraintdef(c.oid) like '%sync_catalogue%'
    and pg_get_constraintdef(c.oid) like '%website_catalogue%'
    and pg_get_constraintdef(c.oid) not like '%sync_catalogue_playback%';

  if target_count = 1 then
    execute format(
      'alter table airtable_content_snapshots drop constraint %I',
      target_name
    );
  elsif target_count > 1 then
    raise exception
      'Expected at most one legacy airtable_content_snapshots snapshot-key check; found %',
      target_count;
  end if;
end
$$;

alter table airtable_content_snapshots
  drop constraint if exists airtable_content_snapshots_snapshot_key_v2_check;

alter table airtable_content_snapshots
  add constraint airtable_content_snapshots_snapshot_key_v2_check
  check (
    snapshot_key in (
      'sync_catalogue',
      'sync_catalogue_playback',
      'website_catalogue'
    )
  );

do $$
declare
  target_name text;
  target_count integer;
begin
  select
    min(c.conname),
    count(*)::integer
  into target_name, target_count
  from pg_constraint c
  where c.conrelid = 'catalogue_engagement_events'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%event_type%'
    and pg_get_constraintdef(c.oid) like '%play_full%'
    and pg_get_constraintdef(c.oid) like '%play_clip%'
    and pg_get_constraintdef(c.oid) like '%catalogue_open%'
    and pg_get_constraintdef(c.oid) like '%licensing_open%'
    and pg_get_constraintdef(c.oid) not like '%recording_id%'
    and pg_get_constraintdef(c.oid) not like '%play_instrumental%';

  if target_count = 1 then
    execute format(
      'alter table catalogue_engagement_events drop constraint %I',
      target_name
    );
  elsif target_count > 1 then
    raise exception
      'Expected at most one legacy catalogue event-type check; found %',
      target_count;
  end if;
end
$$;

alter table catalogue_engagement_events
  drop constraint if exists catalogue_engagement_events_event_type_v2_check;

alter table catalogue_engagement_events
  add constraint catalogue_engagement_events_event_type_v2_check
  check (
    event_type in (
      'catalogue_open',
      'detail_open',
      'play_full',
      'play_clip',
      'play_instrumental',
      'shortlist_add',
      'shortlist_remove',
      'licensing_open'
    )
  );

do $$
declare
  target_name text;
  target_count integer;
begin
  select
    min(c.conname),
    count(*)::integer
  into target_name, target_count
  from pg_constraint c
  where c.conrelid = 'catalogue_engagement_events'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%event_type%'
    and pg_get_constraintdef(c.oid) like '%recording_id%'
    and pg_get_constraintdef(c.oid) like '%recording_title_snapshot%'
    and pg_get_constraintdef(c.oid) like '%selection_count%'
    and pg_get_constraintdef(c.oid) like '%play_full%'
    and pg_get_constraintdef(c.oid) like '%play_clip%'
    and pg_get_constraintdef(c.oid) not like '%play_instrumental%';

  if target_count = 1 then
    execute format(
      'alter table catalogue_engagement_events drop constraint %I',
      target_name
    );
  elsif target_count > 1 then
    raise exception
      'Expected at most one legacy catalogue event-shape check; found %',
      target_count;
  end if;
end
$$;

alter table catalogue_engagement_events
  drop constraint if exists catalogue_engagement_events_shape_v2_check;

alter table catalogue_engagement_events
  add constraint catalogue_engagement_events_shape_v2_check
  check (
    (
      event_type in (
        'detail_open',
        'play_full',
        'play_clip',
        'play_instrumental',
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
  );

commit;
