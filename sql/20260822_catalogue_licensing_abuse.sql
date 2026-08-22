-- AFR catalogue licensing enquiry abuse controls
-- Additive pre-deploy migration.
-- Stores only a rotating HMAC network key; never a raw network address.

begin;

create table catalogue_licensing_rate_limits (
  key_hash text primary key
    check (key_hash ~ '^[0-9a-f]{64}$'),

  window_started_at timestamp with time zone
    not null
    default now(),

  request_count integer
    not null
    default 1
    check (request_count >= 1),

  updated_at timestamp with time zone
    not null
    default now()
);

create index catalogue_licensing_rate_limits_updated_at_idx
  on catalogue_licensing_rate_limits (updated_at);

commit;
