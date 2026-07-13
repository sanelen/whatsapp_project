insert into public.bank_import_property_mappings (
  organization_id,
  property_id,
  account_number_suffix,
  property_name,
  notes,
  is_active
)
select
  p.organization_id,
  p.id,
  '9613',
  'West Rich',
  'Verified from the historical Capitec transaction history supplied 2026-07-12.',
  true
from public.properties p
where lower(p.name) in ('west rich', 'westridge', 'west ridge')
on conflict (organization_id, account_number_suffix) do update
set
  property_id = excluded.property_id,
  property_name = excluded.property_name,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();
