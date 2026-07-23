-- Durable, server-only state for the controlled WhatsApp assistant pilot.
-- Pilot access is always enabled explicitly by an operator after verifying the
-- sender. Never infer approval from whichever customer messaged most recently.

alter table public.channel_events
  drop constraint if exists channel_events_processing_status_check;

alter table public.channel_events
  add constraint channel_events_processing_status_check
  check (processing_status in ('received', 'processing', 'processed', 'ignored', 'failed'));

create table if not exists public.channel_conversation_states (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'twilio')),
  channel text not null check (channel in ('whatsapp', 'facebook_messenger', 'instagram')),
  external_connection_id text not null,
  external_user_id text not null,
  flow_state jsonb not null default '{"step":"menu"}'::jsonb,
  bot_paused boolean not null default false,
  pilot_enabled boolean not null default false,
  last_inbound_event_id text not null default '',
  last_outbound_message_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, channel, external_connection_id, external_user_id)
);

create index if not exists idx_channel_conversation_states_pilot
on public.channel_conversation_states (provider, channel, pilot_enabled, updated_at desc);

alter table public.channel_conversation_states enable row level security;
revoke all on public.channel_conversation_states from anon, authenticated;
grant all on public.channel_conversation_states to service_role;

-- Events received before the dispatcher exists must never produce a delayed
-- reply if Meta retries them after deployment.
update public.channel_events
set processing_status = 'processed',
    processed_at = coalesce(processed_at, now()),
    updated_at = now()
where provider = 'meta'
  and channel = 'whatsapp'
  and event_type = 'message.received'
  and processing_status = 'received';

-- Intentionally do not seed an enabled pilot sender here. Enabling a pilot is
-- an explicit, audited operator action and must not reset STOP or handoff state.
