create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null,
  contact_primary text not null default '',
  contact_secondary text not null default '',
  rent_amount numeric(12,2) not null default 0 check (rent_amount >= 0),
  occupancy_status text not null default 'occupied' check (occupancy_status in ('occupied', 'vacant')),
  is_blocked boolean not null default false,
  expected_reference text not null default '',
  match_keywords text[] not null default '{}',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_property_units_property_label
on public.property_units(property_id, label);

create index if not exists idx_property_units_property_id
on public.property_units(property_id);

create table if not exists public.unit_payment_periods (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  period_start date not null,
  expected_amount numeric(12,2) not null default 0 check (expected_amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'overdue', 'blocked', 'mismatch')),
  is_blocked boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, period_start)
);

create index if not exists idx_unit_payment_periods_unit_id
on public.unit_payment_periods(unit_id);

create index if not exists idx_unit_payment_periods_period_start
on public.unit_payment_periods(period_start);

create table if not exists public.payment_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  unit_payment_period_id uuid references public.unit_payment_periods(id) on delete set null,
  reference text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  received_at date not null,
  bank text not null default '',
  signed_off boolean not null default false,
  signed_off_at timestamptz,
  signed_off_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_references_organization_id
on public.payment_references(organization_id);

create index if not exists idx_payment_references_property_id
on public.payment_references(property_id);

create index if not exists idx_payment_references_unit_payment_period_id
on public.payment_references(unit_payment_period_id);

create index if not exists idx_payment_references_received_at
on public.payment_references(received_at);

alter table public.property_units enable row level security;
alter table public.unit_payment_periods enable row level security;
alter table public.payment_references enable row level security;

drop policy if exists "Service role can manage property units" on public.property_units;
create policy "Service role can manage property units"
on public.property_units for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage unit payment periods" on public.unit_payment_periods;
create policy "Service role can manage unit payment periods"
on public.unit_payment_periods for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage payment references" on public.payment_references;
create policy "Service role can manage payment references"
on public.payment_references for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
