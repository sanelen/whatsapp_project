alter table public.property_units
  add column if not exists deposit_amount numeric(12,2) not null default 0 check (deposit_amount >= 0),
  add column if not exists parking text not null default '',
  add column if not exists ensuite boolean not null default false,
  add column if not exists max_occupants integer not null default 1 check (max_occupants >= 0),
  add column if not exists is_available boolean not null default false,
  add column if not exists features text[] not null default '{}'::text[];

create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete cascade,
  kind text not null default 'photo'
    check (kind in ('photo', 'floorplan', 'video', 'document')),
  storage_path text not null default '',
  caption text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (property_id is not null or unit_id is not null)
);

create index if not exists idx_property_media_property_id on public.property_media(property_id);
create index if not exists idx_property_media_unit_id on public.property_media(unit_id);

alter table public.property_media enable row level security;

drop policy if exists "Service role can manage property media" on public.property_media;
create policy "Service role can manage property media"
on public.property_media for all
to service_role
using (true)
with check (true);
