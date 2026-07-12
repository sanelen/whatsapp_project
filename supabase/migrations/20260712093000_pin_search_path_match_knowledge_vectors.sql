-- Security advisor 0011: function_search_path_mutable.
-- Pin search_path so role-level search_path changes cannot redirect
-- table/operator resolution. `extensions` is required for the pgvector
-- type/operators (<=>); the function body already schema-qualifies its table.
-- Applied to the live project via MCP on 2026-07-12; advisor WARN verified
-- cleared and the function verified to return rows with the caller's
-- search_path stripped to pg_catalog.
alter function public.match_knowledge_vectors(
  vector, integer, double precision, text, text, text
) set search_path = public, extensions;
