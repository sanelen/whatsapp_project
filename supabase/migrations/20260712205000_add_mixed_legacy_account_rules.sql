with targets as (
  select
    o.id as organization_id,
    max(p.id) filter (where lower(p.name) = 'quarry heights') as quarry_id,
    max(p.id) filter (where lower(p.name) in ('west rich', 'west ridge', 'westridge')) as west_id
  from public.organizations o
  join public.properties p on p.organization_id = o.id
  group by o.id
), rules as (
  select organization_id, quarry_id as property_id, 'reference_regex'::text as matcher_type,
    '(?:^|[^A-Z0-9])QH'::text as matcher_value, null::numeric as amount_value, 0 as priority,
    'Mixed legacy account: explicit Quarry reference.'::text as notes
  from targets where quarry_id is not null
  union all
  select organization_id, west_id, 'reference_regex', '(?:^|[^A-Z0-9])(?:WR|WEST)', null, 0,
    'Mixed legacy account: explicit West Ridge reference.'
  from targets where west_id is not null
  union all
  select organization_id, quarry_id, 'amount_equals', '', 2200, 50,
    'Mixed legacy account fallback: R2,200 indicates Quarry Heights.'
  from targets where quarry_id is not null
  union all
  select organization_id, west_id, 'amount_equals', '', 1900, 50,
    'Mixed legacy account fallback: R1,900 indicates West Ridge.'
  from targets where west_id is not null
)
insert into public.bank_import_unit_match_hints (
  organization_id, property_id, unit_id, account_number_suffix,
  matcher_type, matcher_value, amount_value, priority, notes, is_active
)
select organization_id, property_id, null, '6570', matcher_type, matcher_value,
  amount_value, priority, notes, true
from rules r
where not exists (
  select 1 from public.bank_import_unit_match_hints h
  where h.organization_id = r.organization_id
    and h.account_number_suffix = '6570'
    and h.matcher_type = r.matcher_type
    and h.matcher_value = r.matcher_value
    and h.amount_value is not distinct from r.amount_value
    and h.property_id = r.property_id
);
