create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_vectors (
  id uuid primary key default gen_random_uuid(),
  knowledge_base_id uuid references public.knowledge_base(id) on delete cascade,
  source_type text not null check (source_type in ('file', 'text', 'website', 'api', 'database', 'tool', 'legacy')),
  source_id text not null,
  source_name text not null default '',
  title text not null,
  content text not null,
  chunk_index integer not null default 0 check (chunk_index >= 0),
  chunk_count integer not null default 1 check (chunk_count > 0),
  embedding_model text not null default 'text-embedding-3-small',
  embedding_dimensions integer not null default 768 check (embedding_dimensions = 768),
  embedding extensions.vector(768) not null,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, chunk_index)
);

create index if not exists knowledge_vectors_source_idx
on public.knowledge_vectors (source_type, source_id)
where is_active;

create index if not exists knowledge_vectors_knowledge_base_idx
on public.knowledge_vectors (knowledge_base_id)
where is_active;

create index if not exists knowledge_vectors_embedding_hnsw_idx
on public.knowledge_vectors
using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_vectors enable row level security;

drop policy if exists "Service role can manage knowledge vectors" on public.knowledge_vectors;
create policy "Service role can manage knowledge vectors"
on public.knowledge_vectors for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop function if exists public.match_knowledge_vectors(extensions.vector, integer, double precision, text);
create or replace function public.match_knowledge_vectors (
  query_embedding extensions.vector(768),
  match_count integer default 5,
  match_threshold double precision default 0.2,
  filter_source_type text default null
)
returns table (
  id uuid,
  knowledge_base_id uuid,
  source_type text,
  source_id text,
  source_name text,
  title text,
  content text,
  chunk_index integer,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    knowledge_vectors.id,
    knowledge_vectors.knowledge_base_id,
    knowledge_vectors.source_type,
    knowledge_vectors.source_id,
    knowledge_vectors.source_name,
    knowledge_vectors.title,
    knowledge_vectors.content,
    knowledge_vectors.chunk_index,
    knowledge_vectors.metadata,
    1 - (knowledge_vectors.embedding <=> query_embedding) as similarity
  from public.knowledge_vectors
  where knowledge_vectors.is_active
    and (filter_source_type is null or knowledge_vectors.source_type = filter_source_type)
    and 1 - (knowledge_vectors.embedding <=> query_embedding) >= match_threshold
  order by knowledge_vectors.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
