drop function if exists public.match_knowledge_vectors(extensions.vector, integer, double precision, text);

create or replace function public.match_knowledge_vectors (
  query_embedding extensions.vector(768),
  match_count integer default 5,
  match_threshold double precision default 0.2,
  filter_source_type text default null,
  filter_organization_id text default null,
  filter_property_id text default null
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
    and (filter_organization_id is null or knowledge_vectors.metadata->>'organizationId' = filter_organization_id)
    and (filter_property_id is null or knowledge_vectors.metadata->>'propertyId' = filter_property_id)
    and 1 - (knowledge_vectors.embedding <=> query_embedding) >= match_threshold
  order by knowledge_vectors.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
