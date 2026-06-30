alter table public.payment_references
  add column if not exists transaction_at timestamptz;

comment on column public.payment_references.transaction_at is
  'Canonical Capitec actioned timestamp for the matched deposit; displayed in the per-unit Date column.';
