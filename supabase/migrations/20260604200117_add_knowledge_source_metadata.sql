alter table public.knowledge_base
add column if not exists source_type text not null default 'legacy'
  check (source_type in ('file', 'text', 'website', 'api', 'database', 'tool', 'legacy')),
add column if not exists source_id text,
add column if not exists source_name text not null default '',
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists knowledge_base_source_idx
on public.knowledge_base (source_type, source_id)
where is_active and source_id is not null;
