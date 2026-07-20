create table if not exists public.bank_import_file_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  mailbox_id uuid not null references public.bank_import_mailboxes(id) on delete cascade,
  message_id uuid not null references public.bank_import_messages(id) on delete cascade,
  file_id uuid not null references public.bank_import_files(id) on delete cascade,
  file_sha256 text not null,
  source text not null default 'gmail' check (source in ('gmail', 'drive', 'bank')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (mailbox_id, message_id, file_sha256)
);

create index if not exists idx_bank_import_file_occurrences_hash
on public.bank_import_file_occurrences(organization_id, file_sha256);

create index if not exists idx_bank_import_file_occurrences_mailbox
on public.bank_import_file_occurrences(mailbox_id, last_seen_at desc);

insert into public.bank_import_file_occurrences (
  organization_id, mailbox_id, message_id, file_id, file_sha256, source, first_seen_at, last_seen_at
)
select
  mailbox.organization_id,
  message.mailbox_id,
  file.message_id,
  file.id,
  file.file_sha256,
  case
    when coalesce(file.raw_metadata ->> 'source', '') = 'bank' then 'bank'
    when coalesce(file.raw_metadata ->> 'source', '') = 'drive' then 'drive'
    else 'gmail'
  end,
  file.created_at,
  file.updated_at
from public.bank_import_files file
join public.bank_import_messages message on message.id = file.message_id
join public.bank_import_mailboxes mailbox on mailbox.id = message.mailbox_id
where mailbox.organization_id is not null
on conflict (mailbox_id, message_id, file_sha256) do nothing;

create table if not exists public.bank_import_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trigger text not null default 'scheduled' check (trigger in ('scheduled', 'manual')),
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'failed', 'skipped')),
  cadence_hours integer not null default 72 check (cadence_hours between 1 and 720),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  mailbox_results jsonb not null default '[]'::jsonb,
  reconciliation_summary jsonb not null default '{}'::jsonb,
  error_message text not null default '',
  created_at timestamptz not null default now()
);

insert into public.bank_import_mailboxes (
  organization_id, email_address, provider, label_filter, subject_filter, is_active
)
select organization_id, 'Sanele.main@gmail.com', 'gmail', '', '', false
from public.bank_import_mailboxes
where lower(email_address) = 'info.hambatrading@gmail.com'
  and organization_id is not null
on conflict (email_address) do nothing;

create index if not exists idx_bank_import_reconciliation_runs_latest
on public.bank_import_reconciliation_runs(organization_id, started_at desc);

create unique index if not exists idx_bank_import_reconciliation_one_running
on public.bank_import_reconciliation_runs(organization_id)
where status = 'running';

alter table public.bank_import_file_occurrences enable row level security;
alter table public.bank_import_reconciliation_runs enable row level security;

revoke all on public.bank_import_file_occurrences from anon, authenticated;
revoke all on public.bank_import_reconciliation_runs from anon, authenticated;
grant all on public.bank_import_file_occurrences to service_role;
grant all on public.bank_import_reconciliation_runs to service_role;

drop policy if exists "Service role can manage bank import file occurrences" on public.bank_import_file_occurrences;
create policy "Service role can manage bank import file occurrences"
on public.bank_import_file_occurrences for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage bank import reconciliation runs" on public.bank_import_reconciliation_runs;
create policy "Service role can manage bank import reconciliation runs"
on public.bank_import_reconciliation_runs for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
