alter table public.bank_import_unit_match_hints
  drop constraint if exists bank_import_unit_match_hints_matcher_type_check;

alter table public.bank_import_unit_match_hints
  add constraint bank_import_unit_match_hints_matcher_type_check
  check (
    matcher_type in (
      'reference_contains',
      'reference_equals',
      'reference_regex',
      'payer_name_contains',
      'amount_equals'
    )
  );

comment on column public.bank_import_unit_match_hints.matcher_type is
  'How the bank import should match a unit hint: reference_contains | reference_equals | reference_regex | payer_name_contains | amount_equals';
