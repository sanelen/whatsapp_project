-- Optional alert delivery ledger. Apply only when enabling the reviewed alert integration.
-- No recipient details, message bodies or tenant information are stored here.
create table if not exists public.rent_management_alert_deliveries (
  id text primary key,
  import_run_id uuid not null references public.bank_import_reconciliation_runs(id),
  organization_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  status text not null check (status in ('claimed', 'sent', 'unknown')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rent_management_alert_deliveries enable row level security;
revoke all on public.rent_management_alert_deliveries from anon, authenticated;
grant select, insert, update on public.rent_management_alert_deliveries to service_role;
