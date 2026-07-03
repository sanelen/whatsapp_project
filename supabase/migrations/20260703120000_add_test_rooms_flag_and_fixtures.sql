-- Owner request 2026-07-03: two TEST rooms per location for automated
-- (headed) e2e scenarios. Only rooms with is_test = true may ever carry fake
-- amounts or be edited/reallocated by tests; real rooms are off-limits.
--
-- Applied to live project ddlykzackuehdexldazv on 2026-07-03.
-- Verified: berea/Quarry Heights/West Rich each gained exactly 2 test rooms;
-- real room counts unchanged (10/18/12).
alter table public.property_units
  add column if not exists is_test boolean not null default false;

comment on column public.property_units.is_test is
  'TEST/FAKE fixture room for automated e2e scenarios. Tests may only mutate rows where is_test = true. Amounts on these rows are fake.';

insert into public.property_units
  (property_id, label, rent_amount, deposit_amount, expected_reference, match_keywords, display_order, is_test)
select p.id, t.label, 1000, 1000, t.ref, array[t.ref], 900 + t.ord, true
from public.properties p
cross join (values
  ('TEST ROOM 1', 'TESTROOM1', 1),
  ('TEST ROOM 2', 'TESTROOM2', 2)
) as t(label, ref, ord)
where not exists (
  select 1 from public.property_units u
  where u.property_id = p.id and u.label = t.label
);
