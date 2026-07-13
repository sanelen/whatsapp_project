-- Combined-payment reference splitting (explicit operator decision).
-- Parent references keep the bank_import_entry_id linkage and leave the pool
-- once split (split_at set); children carry split_parent_id and flow through
-- the existing match/sign-off machinery.

alter table public.payment_references
  add column if not exists split_parent_id uuid references public.payment_references(id),
  add column if not exists split_at timestamptz,
  add column if not exists split_by text;

create index if not exists payment_references_split_parent_id_idx
  on public.payment_references (split_parent_id)
  where split_parent_id is not null;

alter table public.payment_match_events
  drop constraint if exists payment_match_events_event_type_check;

alter table public.payment_match_events
  add constraint payment_match_events_event_type_check
  check (event_type = any (array[
    'matched'::text,
    'unmatched'::text,
    'signed_off'::text,
    'reverse_signed_off'::text,
    'blocked'::text,
    'unblocked'::text,
    'status_changed'::text,
    'note_added'::text,
    'deposit_split_accepted'::text,
    'deposit_split_reversed'::text,
    'credit_held'::text,
    'credit_allocated'::text,
    'credit_allocation_reversed'::text,
    'reference_split_accepted'::text,
    'reference_split_reversed'::text
  ]));
