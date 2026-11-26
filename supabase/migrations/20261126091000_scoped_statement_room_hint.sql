-- Owner-authorized unambiguous room reference on the dedicated 4079 account.
-- Resolve deployed identifiers from the mapping and room label; no receipt edits.
insert into public.bank_import_unit_match_hints
  (organization_id, property_id, unit_id, account_number_suffix, matcher_type, matcher_value, priority, notes, is_active)
select m.organization_id, m.property_id, u.id, '4079', 'reference_equals', 'NW RM 5', 10,
  'Verified account 4079 statement reference; matching remains pending staff sign-off.', true
from public.bank_import_property_mappings m
join public.property_units u on u.property_id=m.property_id
where m.account_number_suffix='4079' and m.is_active
  and regexp_replace(lower(u.label), '[^a-z0-9]', '', 'g')~ '^room0*5$'
  and not exists (select 1 from public.bank_import_unit_match_hints h
    where h.property_id=m.property_id and h.unit_id=u.id and h.account_number_suffix='4079'
      and h.matcher_type='reference_equals' and h.matcher_value='NW RM 5');
