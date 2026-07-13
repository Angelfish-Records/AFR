create extension if not exists pgcrypto;

create table if not exists campaign_dispatches (
  id uuid primary key default gen_random_uuid(),
  airtable_campaign_id text not null unique,
  campaign_pitch text not null,
  audience_key text not null,
  audience_summary text not null default '',
  filters jsonb not null default '{}'::jsonb,
  sender_key text not null,
  from_address text not null,
  reply_to text not null,
  status text not null default 'ready',
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_dispatches_status
  on campaign_dispatches (status);

create table if not exists campaign_dispatch_recipients (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references campaign_dispatches(id) on delete cascade,
  airtable_contact_id text not null,
  recipient_email text not null,
  from_address text not null,
  reply_to text not null,
  template_vars jsonb not null default '{}'::jsonb,
  personalised_snapshot text not null default '',
  status text not null default 'queued',
  resend_message_id text,
  attempts integer not null default 0,
  last_error text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dispatch_id, recipient_email)
);

create index if not exists idx_campaign_dispatch_recipients_dispatch_status
  on campaign_dispatch_recipients (dispatch_id, status, created_at);

create index if not exists idx_campaign_dispatch_recipients_resend_message
  on campaign_dispatch_recipients (resend_message_id)
  where resend_message_id is not null;

create index if not exists idx_campaign_dispatch_recipients_contact
  on campaign_dispatch_recipients (airtable_contact_id);
