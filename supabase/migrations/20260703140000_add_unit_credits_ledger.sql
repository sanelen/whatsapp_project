-- Surplus-credit ledger (FR-2.8, owner rulings 2026-07-03).
-- Surplus beyond rent + deposit headroom is HELD as unit credit; the operator
-- allocates it (never automatically) to arrears (<= 3 months back), next
-- month's rent, or the deposit while headroom remains. Reversible like the
-- deposit ledger: reversed rows stay but stop counting.
--
-- Applied to live project ddlykzackuehdexldazv on 2026-07-03.

create table if not exists public.unit_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid not null references public.property_units (id) on delete cascade,
  unit_payment_period_id uuid references public.unit_payment_periods (id) on delete set null,
  payment_reference_id uuid references public.payment_references (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  reference_text text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by text not null default ''
);

create index if not exists unit_credits_unit_idx on public.unit_credits (unit_id, created_at desc);
create index if not exists unit_credits_reference_idx on public.unit_credits (payment_reference_id);

comment on table public.unit_credits is
  'Held surplus credit per unit; balance = sum(non-reversed credits) - sum(non-reversed allocations).';

create table if not exists public.unit_credit_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid not null references public.property_units (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  destination text not null check (destination in ('arrears', 'advance', 'deposit')),
  target_period_id uuid references public.unit_payment_periods (id) on delete set null,
  note text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by text not null default ''
);

create index if not exists unit_credit_allocations_unit_idx on public.unit_credit_allocations (unit_id, created_at desc);
create index if not exists unit_credit_allocations_period_idx on public.unit_credit_allocations (target_period_id);

comment on table public.unit_credit_allocations is
  'Operator-clicked credit allocations (FR-2.8): arrears within 3 months, next-month advance, or deposit while headroom remains. Never automatic.';

alter table public.payment_match_events
  drop constraint if exists payment_match_events_event_type_check;
alter table public.payment_match_events
  add constraint payment_match_events_event_type_check
  check (
    event_type in (
      'matched', 'unmatched', 'signed_off', 'reverse_signed_off', 'blocked',
      'unblocked', 'status_changed', 'note_added',
      'deposit_split_accepted', 'deposit_split_reversed',
      'credit_held', 'credit_allocated', 'credit_allocation_reversed'
    )
  );

alter table public.unit_credits enable row level security;
alter table public.unit_credit_allocations enable row level security;
