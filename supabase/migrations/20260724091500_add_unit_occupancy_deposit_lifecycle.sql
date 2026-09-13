-- Tenant-stay deposit lifecycle (owner review 2026-07-24).
--
-- Deposits belong to the tenant's stay in a room, not to the room forever.
-- This migration is additive: existing room-level deposit_contributions keep
-- working, and are backfilled into the first active/holding occupancy episode.

create table if not exists public.unit_occupancies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid not null references public.property_units (id) on delete cascade,
  status text not null default 'active' check (status in ('holding', 'active', 'notice', 'ended')),
  tenant_display_name text not null default '',
  contact_primary text not null default '',
  contact_secondary text not null default '',
  starts_on date,
  ends_on date,
  deposit_target_amount numeric(12, 2) not null default 0 check (deposit_target_amount >= 0),
  close_reason text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  check (
    (status = 'ended' and closed_at is not null)
    or (status <> 'ended')
  )
);

create unique index if not exists unit_occupancies_one_current_per_unit_idx
  on public.unit_occupancies (unit_id)
  where closed_at is null and status in ('holding', 'active', 'notice');

create index if not exists unit_occupancies_unit_created_idx
  on public.unit_occupancies (unit_id, created_at desc);

comment on table public.unit_occupancies is
  'Tenant stay/version for a room. Deposit balances should be scoped here so old tenant deposits do not carry into the next tenant.';

create table if not exists public.deposit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid not null references public.property_units (id) on delete cascade,
  unit_occupancy_id uuid not null references public.unit_occupancies (id) on delete cascade,
  unit_payment_period_id uuid references public.unit_payment_periods (id) on delete set null,
  payment_reference_id uuid references public.payment_references (id) on delete set null,
  deposit_contribution_id uuid references public.deposit_contributions (id) on delete set null,
  entry_type text not null check (entry_type in ('contribution', 'refund', 'deduction', 'interest', 'adjustment', 'reversal')),
  amount numeric(12, 2) not null check (amount <> 0),
  reference_text text not null default '',
  note text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by text not null default ''
);

create index if not exists deposit_ledger_entries_occupancy_idx
  on public.deposit_ledger_entries (unit_occupancy_id, created_at desc);
create index if not exists deposit_ledger_entries_unit_idx
  on public.deposit_ledger_entries (unit_id, created_at desc);
create unique index if not exists deposit_ledger_entries_contribution_once_idx
  on public.deposit_ledger_entries (deposit_contribution_id)
  where deposit_contribution_id is not null;

comment on table public.deposit_ledger_entries is
  'Append-friendly deposit ledger scoped to one tenant occupancy episode. Balance = sum(amount) where reversed_at is null.';

alter table public.deposit_contributions
  add column if not exists unit_occupancy_id uuid references public.unit_occupancies (id) on delete set null;

alter table public.unit_credits
  add column if not exists unit_occupancy_id uuid references public.unit_occupancies (id) on delete set null;

alter table public.unit_credit_allocations
  add column if not exists unit_occupancy_id uuid references public.unit_occupancies (id) on delete set null;

create index if not exists deposit_contributions_occupancy_idx
  on public.deposit_contributions (unit_occupancy_id, created_at desc);

-- Initial current-stay snapshot:
-- - occupied rooms get an active episode
-- - vacant rooms only get a holding episode when active deposit money exists
with active_deposits as (
  select unit_id, sum(amount)::numeric(12, 2) as balance
  from public.deposit_contributions
  where reversed_at is null
  group by unit_id
)
insert into public.unit_occupancies (
  organization_id,
  property_id,
  unit_id,
  status,
  contact_primary,
  contact_secondary,
  deposit_target_amount,
  actor
)
select
  p.organization_id,
  u.property_id,
  u.id,
  case when u.occupancy_status = 'vacant' then 'holding' else 'active' end,
  coalesce(u.contact_primary, ''),
  coalesce(u.contact_secondary, ''),
  coalesce(u.deposit_amount, 0),
  'migration:20260724091500'
from public.property_units u
join public.properties p on p.id = u.property_id
left join active_deposits d on d.unit_id = u.id
where not exists (
  select 1
  from public.unit_occupancies existing
  where existing.unit_id = u.id
    and existing.closed_at is null
    and existing.status in ('holding', 'active', 'notice')
)
and (
  u.occupancy_status = 'occupied'
  or coalesce(d.balance, 0) > 0
);

update public.deposit_contributions dc
set unit_occupancy_id = o.id
from public.unit_occupancies o
where dc.unit_occupancy_id is null
  and dc.unit_id = o.unit_id
  and o.closed_at is null
  and o.status in ('holding', 'active', 'notice');

insert into public.deposit_ledger_entries (
  organization_id,
  property_id,
  unit_id,
  unit_occupancy_id,
  unit_payment_period_id,
  payment_reference_id,
  deposit_contribution_id,
  entry_type,
  amount,
  reference_text,
  actor,
  created_at,
  reversed_at,
  reversed_by
)
select
  dc.organization_id,
  dc.property_id,
  dc.unit_id,
  dc.unit_occupancy_id,
  dc.unit_payment_period_id,
  dc.payment_reference_id,
  dc.id,
  'contribution',
  dc.amount,
  dc.reference_text,
  dc.actor,
  dc.created_at,
  dc.reversed_at,
  dc.reversed_by
from public.deposit_contributions dc
where dc.unit_occupancy_id is not null
  and not exists (
    select 1
    from public.deposit_ledger_entries existing
    where existing.deposit_contribution_id = dc.id
  );

create or replace function public.resolve_deposit_contribution_occupancy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.unit_occupancy_id is null then
    select id
    into new.unit_occupancy_id
    from public.unit_occupancies
    where unit_id = new.unit_id
      and closed_at is null
      and status in ('holding', 'active', 'notice')
    order by created_at desc
    limit 1;
  end if;

  return new;
end;
$$;

create or replace function public.sync_deposit_contribution_ledger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.unit_occupancy_id is not null then
      insert into public.deposit_ledger_entries (
        organization_id,
        property_id,
        unit_id,
        unit_occupancy_id,
        unit_payment_period_id,
        payment_reference_id,
        deposit_contribution_id,
        entry_type,
        amount,
        reference_text,
        actor,
        created_at,
        reversed_at,
        reversed_by
      )
      values (
        new.organization_id,
        new.property_id,
        new.unit_id,
        new.unit_occupancy_id,
        new.unit_payment_period_id,
        new.payment_reference_id,
        new.id,
        'contribution',
        new.amount,
        new.reference_text,
        new.actor,
        new.created_at,
        new.reversed_at,
        new.reversed_by
      )
      on conflict do nothing;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    update public.deposit_ledger_entries
    set reversed_at = new.reversed_at,
        reversed_by = new.reversed_by
    where deposit_contribution_id = new.id;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists resolve_deposit_contribution_occupancy_before_insert
  on public.deposit_contributions;
create trigger resolve_deposit_contribution_occupancy_before_insert
before insert on public.deposit_contributions
for each row
execute function public.resolve_deposit_contribution_occupancy();

drop trigger if exists sync_deposit_contribution_ledger_after_insert
  on public.deposit_contributions;
create trigger sync_deposit_contribution_ledger_after_insert
after insert on public.deposit_contributions
for each row
execute function public.sync_deposit_contribution_ledger();

drop trigger if exists sync_deposit_contribution_ledger_after_reversal
  on public.deposit_contributions;
create trigger sync_deposit_contribution_ledger_after_reversal
after update of reversed_at, reversed_by on public.deposit_contributions
for each row
execute function public.sync_deposit_contribution_ledger();

alter table public.unit_occupancies enable row level security;
alter table public.deposit_ledger_entries enable row level security;
