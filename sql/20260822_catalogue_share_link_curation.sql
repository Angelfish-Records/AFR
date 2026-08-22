-- AFR catalogue curated share-link presentation
-- Additive only. Existing links retain full-catalogue behaviour.

begin;

alter table catalogue_share_links
  add column welcome_message text null,
  add column curated_recording_ids text[]
    not null
    default '{}'::text[];

alter table catalogue_share_links
  add constraint catalogue_share_links_welcome_message_length_ck
    check (
      welcome_message is null
      or char_length(welcome_message) <= 600
    ),
  add constraint catalogue_share_links_curated_recording_ids_count_ck
    check (
      cardinality(curated_recording_ids) <= 50
    ),
  add constraint catalogue_share_links_curated_recording_ids_nonnull_ck
    check (
      array_position(curated_recording_ids, null) is null
    );

commit;
