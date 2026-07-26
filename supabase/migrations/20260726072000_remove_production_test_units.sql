-- Owner decision 2026-07-26: production inventory contains real rooms only.
--
-- The older 20260703120000 migration created two headed-E2E fixtures per
-- property. They are no longer permitted in the shared live project. This
-- cleanup is deliberately idempotent so a full migration replay creates and
-- then removes the historical fixtures.

delete from public.property_units
where is_test = true
   or upper(trim(label)) in ('TEST ROOM 1', 'TEST ROOM 2');

comment on column public.property_units.is_test is
  'Reserved for disposable non-production fixtures. Production inventory rows must remain false.';
