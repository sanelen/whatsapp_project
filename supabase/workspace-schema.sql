create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'ORG',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  location text not null default '',
  icon text not null default 'PR',
  image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_chatbot_settings (
  property_id uuid primary key references public.properties(id) on delete cascade,
  provider text not null default 'openai',
  model text not null default 'gpt-5.4',
  temperature numeric(3,2) not null default 0.40 check (temperature >= 0 and temperature <= 2),
  system_prompt text not null default '',
  knowledge_sources text[] not null default '{}',
  quick_replies text[] not null default '{}',
  whatsapp_templates text[] not null default '{}',
  retrieval_top_k integer not null default 5 check (retrieval_top_k > 0 and retrieval_top_k <= 50),
  retrieval_similarity_threshold numeric(4,3) not null default 0.200 check (retrieval_similarity_threshold >= 0 and retrieval_similarity_threshold <= 1),
  retrieval_memory_mode text not null default 'hybrid' check (retrieval_memory_mode in ('hybrid', 'rolling_window', 'summary_memory', 'retrieval_only')),
  retrieval_history_window integer not null default 20 check (retrieval_history_window >= 1 and retrieval_history_window <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  label text not null,
  contact_primary text not null default '',
  contact_secondary text not null default '',
  rent_amount numeric(12,2) not null default 0 check (rent_amount >= 0),
  occupancy_status text not null default 'occupied' check (occupancy_status in ('occupied', 'vacant')),
  is_blocked boolean not null default false,
  expected_reference text not null default '',
  match_keywords text[] not null default '{}',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, label)
);

create table if not exists public.unit_payment_periods (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  period_start date not null,
  expected_amount numeric(12,2) not null default 0 check (expected_amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid', 'overdue', 'blocked', 'mismatch')),
  is_blocked boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, period_start)
);

create table if not exists public.payment_references (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  unit_payment_period_id uuid references public.unit_payment_periods(id) on delete set null,
  bank_import_entry_id uuid references public.bank_import_entries(id) on delete set null,
  reference text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  received_at date not null,
  bank text not null default '',
  signed_off boolean not null default false,
  signed_off_at timestamptz,
  signed_off_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.bank_import_entries (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.bank_import_files(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  payment_reference_id uuid references public.payment_references(id) on delete set null,
  entry_fingerprint text not null,
  transaction_type text not null default '',
  transaction_date date,
  transaction_time text not null default '',
  destination_account_suffix text not null default '',
  reference text not null default '',
  description text not null default '',
  payer_name text not null default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  available_balance numeric(12,2),
  currency text not null default 'ZAR',
  source_page integer,
  source_index integer,
  raw_extracted_text text not null default '',
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_fingerprint)
);

create table if not exists public.bank_import_property_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  account_number_suffix text not null,
  property_name text not null default '',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, account_number_suffix)
);

create table if not exists public.bank_import_unit_match_hints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  unit_id uuid references public.property_units(id) on delete set null,
  matcher_type text not null
    check (matcher_type in ('reference_contains', 'reference_equals', 'payer_name_contains', 'amount_equals')),
  matcher_value text not null default '',
  amount_value numeric(12,2),
  priority integer not null default 100,
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_properties_organization_id on public.properties(organization_id);
create index if not exists idx_property_units_property_id on public.property_units(property_id);
create index if not exists idx_unit_payment_periods_unit_id on public.unit_payment_periods(unit_id);
create index if not exists idx_unit_payment_periods_period_start on public.unit_payment_periods(period_start);
create index if not exists idx_payment_references_organization_id on public.payment_references(organization_id);
create index if not exists idx_payment_references_property_id on public.payment_references(property_id);
create index if not exists idx_payment_references_unit_payment_period_id on public.payment_references(unit_payment_period_id);
create index if not exists idx_payment_references_received_at on public.payment_references(received_at);
create unique index if not exists idx_payment_references_bank_import_entry_id on public.payment_references(bank_import_entry_id) where bank_import_entry_id is not null;
create index if not exists idx_bank_import_mailboxes_organization_id on public.bank_import_mailboxes(organization_id);
create index if not exists idx_bank_import_messages_mailbox_id on public.bank_import_messages(mailbox_id);
create index if not exists idx_bank_import_messages_received_at on public.bank_import_messages(received_at);
create index if not exists idx_bank_import_files_message_id on public.bank_import_files(message_id);
create index if not exists idx_bank_import_files_statement_period_start on public.bank_import_files(statement_period_start);
create index if not exists idx_bank_import_entries_file_id on public.bank_import_entries(file_id);
create index if not exists idx_bank_import_entries_payment_reference_id on public.bank_import_entries(payment_reference_id);
create index if not exists idx_bank_import_entries_reference on public.bank_import_entries(reference);
create index if not exists idx_bank_import_entries_transaction_date on public.bank_import_entries(transaction_date);
create index if not exists idx_bank_import_property_mappings_organization_id on public.bank_import_property_mappings(organization_id);
create index if not exists idx_bank_import_property_mappings_property_id on public.bank_import_property_mappings(property_id);
create index if not exists idx_bank_import_unit_match_hints_organization_id on public.bank_import_unit_match_hints(organization_id);
create index if not exists idx_bank_import_unit_match_hints_property_id on public.bank_import_unit_match_hints(property_id);
create index if not exists idx_bank_import_unit_match_hints_unit_id on public.bank_import_unit_match_hints(unit_id);

alter table public.organizations enable row level security;
alter table public.properties enable row level security;
alter table public.property_chatbot_settings enable row level security;
alter table public.property_units enable row level security;
alter table public.unit_payment_periods enable row level security;
alter table public.payment_references enable row level security;
alter table public.bank_import_mailboxes enable row level security;
alter table public.bank_import_messages enable row level security;
alter table public.bank_import_files enable row level security;
alter table public.bank_import_entries enable row level security;
alter table public.bank_import_property_mappings enable row level security;
alter table public.bank_import_unit_match_hints enable row level security;

create policy "Service role can manage organizations"
on public.organizations for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage properties"
on public.properties for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage property chatbot settings"
on public.property_chatbot_settings for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage property units"
on public.property_units for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage unit payment periods"
on public.unit_payment_periods for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage payment references"
on public.payment_references for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage bank import mailboxes"
on public.bank_import_mailboxes for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage bank import messages"
on public.bank_import_messages for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage bank import files"
on public.bank_import_files for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create policy "Service role can manage bank import entries"
on public.bank_import_entries for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage bank import property mappings" on public.bank_import_property_mappings;
create policy "Service role can manage bank import property mappings"
on public.bank_import_property_mappings for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage bank import unit match hints" on public.bank_import_unit_match_hints;
create policy "Service role can manage bank import unit match hints"
on public.bank_import_unit_match_hints for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
