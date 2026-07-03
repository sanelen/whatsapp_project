-- Deposit ledger (REQUIREMENTS FR-2.8, slice 2 — owner ruling 2026-07-02).
--
-- When an operator accepts an overpayment split, the rent portion stays on the
-- payment reference / period as normal collected rent, and the deposit portion
-- is recorded here. Each unit's running deposit balance = sum of non-reversed
-- contributions, tracked toward property_units.deposit_amount.

create table if not exists public.deposit_contributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid not null references public.property_units (id) on delete cascade,
  unit_payment_period_id uuid references public.unit_payment_periods (id) on delete set null,
  payment_reference_id uuid references public.payment_references (id) on delete set null,
  -- Snapshot of the accepted split so the ledger stands alone.
  amount numeric(12, 2) not null check (amount > 0),
  rent_portion numeric(12, 2) not null default 0,
  surplus_amount numeric(12, 2) not null default 0,
  reference_text text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now(),
  -- Reversal keeps the audit trail append-friendly: reversed rows stay, but
  -- stop counting toward the unit's deposit balance.
  reversed_at timestamptz,
  reversed_by text not null default ''
);

create index if not exists deposit_contributions_unit_idx
  on public.deposit_contributions (unit_id, created_at desc);
create index if not exists deposit_contributions_reference_idx
  on public.deposit_contributions (payment_reference_id);

comment on table public.deposit_contributions is
  'Deposit ledger: accepted overpayment splits per unit; running balance = sum(amount) where reversed_at is null.';

-- Extend the audit event vocabulary for split accept/reverse.
alter table public.payment_match_events
  drop constraint if exists payment_match_events_event_type_check;
alter table public.payment_match_events
  add constraint payment_match_events_event_type_check
  check (
    event_type in (
      'matched',
      'unmatched',
      'signed_off',
      'reverse_signed_off',
      'blocked',
      'unblocked',
      'status_changed',
      'note_added',
      'deposit_split_accepted',
      'deposit_split_reversed'
    )
  );

-- Service-role (admin client) is used for all dashboard reads/writes and
-- bypasses RLS; enabling RLS with no policies locks the table to anon/auth.
alter table public.deposit_contributions enable row level security;
