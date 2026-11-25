-- Non-reversible fingerprint only; no message body, recipient, or tenant data.
alter table public.rent_management_alert_deliveries add column if not exists content_hash text;
create index if not exists rent_management_alert_deliveries_latest_scope
  on public.rent_management_alert_deliveries (organization_id, property_id, created_at desc);
