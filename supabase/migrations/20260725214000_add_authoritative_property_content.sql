-- AUT-39 / AUT-40: authoritative property and room facts, approved media,
-- reviewed structured imports, and durable staff-handoff evidence.
--
-- This migration is intentionally additive. Decision-critical values remain in
-- structured columns; only separately approved descriptive copy is eligible for
-- vector indexing by the application.

alter table public.properties
  add column if not exists description text not null default '',
  add column if not exists address text not null default '',
  add column if not exists maps_url text not null default '',
  add column if not exists public_page_url text not null default '',
  add column if not exists photos_url text not null default '',
  add column if not exists pamphlet_url text not null default '',
  add column if not exists contact_primary text not null default '',
  add column if not exists contact_secondary text not null default '',
  add column if not exists viewing_instructions text not null default '',
  add column if not exists parking text not null default '',
  add column if not exists features text[] not null default '{}'::text[],
  add column if not exists descriptive_content_approved boolean not null default false,
  add column if not exists descriptive_content_approved_at timestamptz,
  add column if not exists descriptive_content_approved_by text not null default '';

alter table public.property_chatbot_settings
  alter column provider set default 'openai',
  alter column model set default 'gpt-5.6-luna';

alter table public.property_units
  add column if not exists description text not null default '',
  add column if not exists unit_type text not null default 'room',
  add column if not exists deposit_terms text not null default '',
  add column if not exists available_from date,
  add column if not exists viewing_instructions text not null default '',
  add column if not exists descriptive_content_approved boolean not null default false,
  add column if not exists descriptive_content_approved_at timestamptz,
  add column if not exists descriptive_content_approved_by text not null default '';

alter table public.property_media
  add column if not exists storage_bucket text not null default 'uploads',
  add column if not exists source_kind text not null default 'storage',
  add column if not exists external_url text not null default '',
  add column if not exists mime_type text not null default '',
  add column if not exists byte_size bigint,
  add column if not exists alt_text text not null default '',
  add column if not exists display_order integer not null default 0,
  add column if not exists is_approved boolean not null default false,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_media_source_kind_check'
      and conrelid = 'public.property_media'::regclass
  ) then
    alter table public.property_media
      add constraint property_media_source_kind_check
      check (source_kind in ('storage', 'external'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_media_source_value_check'
      and conrelid = 'public.property_media'::regclass
  ) then
    -- NOT VALID preserves any historical placeholder rows while enforcing the
    -- contract for new/updated rows.
    alter table public.property_media
      add constraint property_media_source_value_check
      check (
        (source_kind = 'storage' and length(trim(storage_path)) > 0)
        or (source_kind = 'external' and length(trim(external_url)) > 0)
      ) not valid;
  end if;
end
$$;

create index if not exists idx_property_media_approved_order
  on public.property_media(property_id, is_approved, display_order, created_at);

create table if not exists public.property_content_imports (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  source_file_name text not null,
  source_format text not null
    check (source_format in ('csv', 'json', 'xlsx')),
  storage_bucket text not null default 'uploads',
  storage_path text not null,
  mapping jsonb not null default '{}'::jsonb,
  preview_rows jsonb not null default '[]'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  status text not null default 'validated'
    check (status in ('validated', 'applied', 'failed', 'rejected')),
  created_by text not null,
  applied_by text not null default '',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_property_content_imports_property_created
  on public.property_content_imports(property_id, created_at desc);

alter table public.property_content_imports enable row level security;

drop policy if exists "Service role can manage property content imports"
  on public.property_content_imports;
create policy "Service role can manage property content imports"
  on public.property_content_imports
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.property_content_imports from anon, authenticated;
grant all on table public.property_content_imports to service_role;

alter table public.channel_conversation_states
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handoff_reason text not null default '',
  add column if not exists handoff_status text not null default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channel_conversation_states_handoff_status_check'
      and conrelid = 'public.channel_conversation_states'::regclass
  ) then
    alter table public.channel_conversation_states
      add constraint channel_conversation_states_handoff_status_check
      check (handoff_status in ('none', 'pending', 'acknowledged', 'resolved'));
  end if;
end
$$;

comment on column public.properties.description is
  'Approved descriptive copy may be vectorized; decision-critical facts remain in their structured columns.';
comment on column public.property_units.description is
  'Approved descriptive copy may be vectorized; rent, deposit, occupancy, availability and viewing remain structured.';
comment on table public.property_content_imports is
  'Audit record for a reviewed property-content mapping. Preview is client-visible before any save.';
