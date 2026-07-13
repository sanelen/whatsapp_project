alter table public.bank_import_unit_match_hints
  add column if not exists account_number_suffix text;

create index if not exists idx_bank_import_unit_match_hints_account_suffix
on public.bank_import_unit_match_hints(organization_id, account_number_suffix)
where account_number_suffix is not null;

comment on column public.bank_import_unit_match_hints.account_number_suffix is
  'Optional bank account scope. Required for amount-only property rules on shared accounts.';
