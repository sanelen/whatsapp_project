alter table public.bank_import_entries
  add column if not exists transaction_type text not null default '',
  add column if not exists destination_account_suffix text not null default '',
  add column if not exists available_balance numeric(12,2);

alter table public.payment_references
  add column if not exists bank_import_entry_id uuid references public.bank_import_entries(id) on delete set null;

create unique index if not exists idx_payment_references_bank_import_entry_id
on public.payment_references(bank_import_entry_id)
where bank_import_entry_id is not null;

create table if not exists public.bank_import_property_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  account_number_suffix text not null,
  property_name text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, account_number_suffix)
);

create index if not exists idx_bank_import_property_mappings_organization_id
on public.bank_import_property_mappings(organization_id);

create index if not exists idx_bank_import_property_mappings_property_id
on public.bank_import_property_mappings(property_id);

create table if not exists public.bank_import_unit_match_hints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.property_units(id) on delete set null,
  matcher_type text not null
    check (matcher_type in ('reference_contains', 'reference_equals', 'payer_name_contains', 'amount_equals')),
  matcher_value text not null default '',
  amount_value numeric(12,2),
  priority integer not null default 100,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_import_unit_match_hints_organization_id
on public.bank_import_unit_match_hints(organization_id);

create index if not exists idx_bank_import_unit_match_hints_property_id
on public.bank_import_unit_match_hints(property_id);

create index if not exists idx_bank_import_unit_match_hints_unit_id
on public.bank_import_unit_match_hints(unit_id);

alter table public.bank_import_property_mappings enable row level security;
alter table public.bank_import_unit_match_hints enable row level security;

drop policy if exists "Service role can manage bank import property mappings" on public.bank_import_property_mappings;
create policy "Service role can manage bank import property mappings"
on public.bank_import_property_mappings for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage bank import unit match hints" on public.bank_import_unit_match_hints;
create policy "Service role can manage bank import unit match hints"
on public.bank_import_unit_match_hints for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

insert into public.bank_import_mailboxes (
  organization_id,
  email_address,
  provider,
  subject_filter,
  is_active
)
select
  o.id,
  'info.hambatrading@gmail.com',
  'gmail',
  'Capitec Business Transaction Notification',
  true
from public.organizations o
where lower(o.name) = 'san'
on conflict (email_address) do update
set
  organization_id = excluded.organization_id,
  provider = excluded.provider,
  subject_filter = excluded.subject_filter,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.bank_import_property_mappings (
  organization_id,
  property_id,
  account_number_suffix,
  property_name,
  notes,
  is_active
)
select
  o.id,
  p.id,
  '7904',
  'Essex / Berea',
  'Seeded from 2026-06-29 owner walkthrough.',
  true
from public.organizations o
left join public.properties p
  on p.organization_id = o.id
 and lower(p.name) = 'berea'
where lower(o.name) = 'san'
on conflict (organization_id, account_number_suffix) do update
set
  property_id = excluded.property_id,
  property_name = excluded.property_name,
  notes = excluded.notes,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.bank_import_property_mappings (
  organization_id,
  property_id,
  account_number_suffix,
  property_name,
  notes,
  is_active
)
select
  o.id,
  null,
  '6088',
  'Quarry Heights',
  'Seeded from 2026-06-29 owner walkthrough. Bind to property row when Quarry Heights exists.',
  true
from public.organizations o
where lower(o.name) = 'san'
on conflict (organization_id, account_number_suffix) do update
set
  property_name = excluded.property_name,
  notes = excluded.notes,
  is_active = excluded.is_active,
  updated_at = now();
