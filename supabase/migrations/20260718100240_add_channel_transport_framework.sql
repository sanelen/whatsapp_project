-- Provider-neutral transport foundation. Secrets stay in server environment
-- variables; these tables store only identifiers, status, and protected events.

create table if not exists public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('meta', 'twilio')),
  channel text not null check (channel in ('whatsapp', 'facebook_messenger', 'instagram')),
  status text not null default 'disabled' check (status in ('disabled', 'pending', 'sandbox', 'active', 'error')),
  external_account_id text not null default '',
  external_sender_id text not null default '',
  display_label text not null default '',
  is_primary boolean not null default false,
  configuration jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, channel, external_sender_id)
);

comment on column public.channel_connections.configuration is
  'Non-secret provider metadata only. Never store access tokens, app secrets, auth tokens, or webhook verification tokens here.';

create unique index if not exists idx_channel_connections_one_primary
on public.channel_connections (organization_id, channel)
where is_primary;

create index if not exists idx_channel_connections_organization
on public.channel_connections (organization_id, channel, status);

create table if not exists public.channel_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid references public.channel_connections(id) on delete set null,
  provider text not null check (provider in ('meta', 'twilio')),
  channel text not null check (channel in ('whatsapp', 'facebook_messenger', 'instagram')),
  event_id text not null,
  event_type text not null,
  direction text not null check (direction in ('inbound', 'outbound', 'status', 'system')),
  external_connection_id text not null default '',
  external_sender_id text not null default '',
  external_recipient_id text not null default '',
  provider_message_id text not null default '',
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, channel, event_id)
);

create index if not exists idx_channel_events_processing
on public.channel_events (processing_status, occurred_at);

create index if not exists idx_channel_events_provider_message
on public.channel_events (provider, provider_message_id)
where provider_message_id <> '';

create index if not exists idx_channel_events_connection
on public.channel_events (provider, channel, external_connection_id, occurred_at)
where external_connection_id <> '';

create table if not exists public.customer_channel_identities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  connection_id uuid not null references public.channel_connections(id) on delete cascade,
  external_user_id text not null,
  display_name text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, external_user_id)
);

alter table public.conversations
  add column if not exists channel_connection_id uuid references public.channel_connections(id) on delete set null,
  add column if not exists external_thread_id text,
  add column if not exists bot_paused boolean not null default false,
  add column if not exists assigned_agent text not null default '',
  add column if not exists workflow_state text not null default 'new',
  add column if not exists summary text not null default '';

create unique index if not exists idx_conversations_external_thread
on public.conversations (channel_connection_id, external_thread_id)
where channel_connection_id is not null and external_thread_id is not null;

alter table public.messages
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists idx_messages_provider_message
on public.messages (provider, provider_message_id)
where provider is not null and provider_message_id is not null;

alter table public.channel_connections enable row level security;
alter table public.channel_events enable row level security;
alter table public.customer_channel_identities enable row level security;

revoke all on public.channel_connections from anon, authenticated;
revoke all on public.channel_events from anon, authenticated;
revoke all on public.customer_channel_identities from anon, authenticated;

grant all on public.channel_connections to service_role;
grant all on public.channel_events to service_role;
grant all on public.customer_channel_identities to service_role;
