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

create index if not exists idx_properties_organization_id on public.properties(organization_id);

alter table public.organizations enable row level security;
alter table public.properties enable row level security;
alter table public.property_chatbot_settings enable row level security;

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
