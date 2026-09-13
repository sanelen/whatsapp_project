-- Overpayment allocation update (owner walkthrough 2026-07-20).
-- The operator may deliberately absorb an overpayment into the selected
-- month's rent record, alongside the existing arrears, advance, and deposit
-- destinations. The source bank reference remains unchanged and fully
-- traceable; this row records the operator's explicit allocation decision.

alter table public.unit_credit_allocations
  drop constraint if exists unit_credit_allocations_destination_check;

alter table public.unit_credit_allocations
  add constraint unit_credit_allocations_destination_check
  check (destination in ('current', 'arrears', 'advance', 'deposit'));

comment on table public.unit_credit_allocations is
  'Operator-clicked overpayment allocations: selected/current month, arrears within 3 months, next-month advance, or deposit while headroom remains. Never automatic.';
