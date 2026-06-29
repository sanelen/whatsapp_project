create table if not exists public.bank_import_mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  email_address text not null unique,
  provider text not null default 'gmail' check (provider in ('gmail')),
  label_filter text not null default '',
  subject_filter text not null default '',
  is_active boolean not null default true,
  gmail_topic_name text not null default '',
  gmail_watch_expiration timestamptz,
  last_history_id text not null default '',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_import_mailboxes_organization_id
on public.bank_import_mailboxes(organization_id);

create table if not exists public.bank_import_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.bank_import_mailboxes(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text not null default '',
  gmail_history_id text not null default '',
  message_from text not null default '',
  subject text not null default '',
  received_at timestamptz,
  processed_at timestamptz,
  import_status text not null default 'pending'
    check (import_status in ('pending', 'processed', 'failed', 'ignored')),
  error_message text not null default '',
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mailbox_id, gmail_message_id)
);

create index if not exists idx_bank_import_messages_mailbox_id
on public.bank_import_messages(mailbox_id);

create index if not exists idx_bank_import_messages_received_at
on public.bank_import_messages(received_at);

create table if not exists public.bank_import_files (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.bank_import_messages(id) on delete cascade,
  gmail_attachment_id text not null default '',
  file_name text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null default 0,
  file_sha256 text not null,
  storage_path text not null default '',
  parser_status text not null default 'pending'
    check (parser_status in ('pending', 'parsed', 'duplicate', 'unsupported', 'failed')),
  statement_period_start date,
  statement_period_end date,
  parsed_at timestamptz,
  parser_error text not null default '',
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, gmail_attachment_id),
  unique (file_sha256)
);

create index if not exists idx_bank_import_files_message_id
on public.bank_import_files(message_id);

create index if not exists idx_bank_import_files_statement_period_start
on public.bank_import_files(statement_period_start);

create table if not exists public.bank_import_entries (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.bank_import_files(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  payment_reference_id uuid references public.payment_references(id) on delete set null,
  entry_fingerprint text not null,
  transaction_date date,
  transaction_time text not null default '',
  reference text not null default '',
  description text not null default '',
  payer_name text not null default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  currency text not null default 'ZAR',
  source_page integer,
  source_index integer,
  raw_extracted_text text not null default '',
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_fingerprint)
);

create index if not exists idx_bank_import_entries_file_id
on public.bank_import_entries(file_id);

create index if not exists idx_bank_import_entries_payment_reference_id
on public.bank_import_entries(payment_reference_id);

create index if not exists idx_bank_import_entries_reference
on public.bank_import_entries(reference);

create index if not exists idx_bank_import_entries_transaction_date
on public.bank_import_entries(transaction_date);

alter table public.bank_import_mailboxes enable row level security;
alter table public.bank_import_messages enable row level security;
alter table public.bank_import_files enable row level security;
alter table public.bank_import_entries enable row level security;

drop policy if exists "Service role can manage bank import mailboxes" on public.bank_import_mailboxes;
create policy "Service role can manage bank import mailboxes"
on public.bank_import_mailboxes for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage bank import messages" on public.bank_import_messages;
create policy "Service role can manage bank import messages"
on public.bank_import_messages for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage bank import files" on public.bank_import_files;
create policy "Service role can manage bank import files"
on public.bank_import_files for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage bank import entries" on public.bank_import_entries;
create policy "Service role can manage bank import entries"
on public.bank_import_entries for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
