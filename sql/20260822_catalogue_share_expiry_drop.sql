-- AFR catalogue share-link expiry retirement
-- POST-DEPLOY ONLY.
-- Apply only after production application code no longer queries expires_at.
-- Share links remain valid until explicitly revoked.

begin;

alter table catalogue_share_links
  drop column if exists expires_at;

commit;
