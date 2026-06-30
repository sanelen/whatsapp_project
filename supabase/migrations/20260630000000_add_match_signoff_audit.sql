-- Match & sign-off (per-unit table) — matching provenance + append-only audit log.
--
-- The match link itself already exists: payment_references.unit_id +
-- unit_payment_period_id (a reference in the pool is "matched" by pointing it at a
-- unit's period), and sign-off uses payment_references.signed_off / signed_off_at /
-- signed_off_by. This migration adds what the per-unit table + "Reverse sign-off"
-- flow still needs: who/when/how a match happened, a due date for the "overdue Nd"
-- status, and a full audit trail so every action is logged and reversible.

-- 1) Matching provenance on the pool -> unit link.
alter table public.payment_references
  add column if not exists matched_at timestamptz,
  add column if not exists matched_by text not null default '',
  add column if not exists match_method text not null default 'manual';

comment on column public.payment_references.match_method is
  'How the reference was matched to a unit: manual | auto_reference | auto_keyword | auto_amount';

-- 2) Due date drives the "overdue Nd" status shown in the per-unit table.
alter table public.unit_payment_periods
  add column if not exists due_date date;

-- Constrain period status to the set used by the dashboard + per-unit table.
-- (table is currently empty, so this is safe to add now)
alter table public.unit_payment_periods
  drop constraint if exists unit_payment_periods_status_check;
alter table public.unit_payment_periods
  add constraint unit_payment_periods_status_check
  check (status in ('unpaid', 'paid', 'partial', 'mismatch', 'overdue', 'blocked', 'excluded'));

-- 3) Append-only audit log. Every match / unmatch / sign-off / reverse sign-off /
--    block records a row here, satisfying the per-unit table's "all logged"
--    requirement and making reverse sign-off fully traceable. Snapshots of
--    reference text + amounts are stored so the log stands alone even if the
--    underlying reference is later deleted (FKs are ON DELETE SET NULL).
create table if not exists public.payment_match_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid references public.properties (id) on delete set null,
  unit_id uuid references public.property_units (id) on delete set null,
  unit_payment_period_id uuid references public.unit_payment_periods (id) on delete set null,
  payment_reference_id uuid references public.payment_references (id) on delete set null,
  event_type text not null check (
    event_type in (
      'matched',
      'unmatched',
      'signed_off',
      'reverse_signed_off',
      'blocked',
      'unblocked',
      'status_changed',
      'note_added'
    )
  ),
  actor text not null default '',
  reference_text text not null default '',
  amount numeric not null default 0,
  expected_amount numeric not null default 0,
  previous_status text not null default '',
  new_status text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payment_match_events_org_created_idx
  on public.payment_match_events (organization_id, created_at desc);
create index if not exists payment_match_events_reference_idx
  on public.payment_match_events (payment_reference_id);
create index if not exists payment_match_events_unit_idx
  on public.payment_match_events (unit_id);

comment on table public.payment_match_events is
  'Append-only audit trail for reference match / unmatch / sign-off / reverse sign-off, powering the per-unit sign-off log.';

-- Service-role (admin client) is used for all dashboard reads/writes and bypasses
-- RLS; enabling RLS with no policies locks the table to anon/auth clients.
alter table public.payment_match_events enable row level security;
