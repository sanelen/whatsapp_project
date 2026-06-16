# Knowledge Base / Vector Retrieval (AUT-17)

Document/text upload → chunk → 768-dim embedding → vector retrieval → grounded chat.

## Core lib: `src/lib/kb/vector.ts`
- `chunkKnowledgeText`, `createKnowledgeEmbedding`, `indexKnowledgeEntry`,
  `searchKnowledgeVectors`, `retrieveKnowledge`, `resolveOpenAiEmbeddingKey`.
- Constants: `KNOWLEDGE_EMBEDDING_MODEL` (OpenAI `text-embedding-3-small`),
  `KNOWLEDGE_EMBEDDING_DIMENSIONS` (**768**), `DEFAULT_MATCH_COUNT`, `DEFAULT_MATCH_THRESHOLD`.
- Types: `KnowledgeSourceType`, `KnowledgeVectorMatch`, `KnowledgeVectorMetadata`,
  `IndexKnowledgeInput`, `SearchKnowledgeInput`, `KnowledgeIndexResult`.

## Storage (Supabase)
- `knowledge_base` rows store content + `source_type`, `source_id`, `source_name`, `metadata`.
- `knowledge_vectors`: `embedding vector(768)`, HNSW cosine index, RLS, source/chunk fields.
- RPC `match_knowledge_vectors` for similarity search. Current signature accepts organization
  and property filters; property scope is enforced by default.
- Migrations: `supabase/migrations/20260530215725_add_knowledge_vector_retrieval.sql`,
  `20260604200117_add_knowledge_source_metadata.sql`,
  `20260614102000_scope_knowledge_vector_matches.sql`,
  `20260614103000_add_retrieval_settings_to_property_chatbots.sql`. Applied to live `hambatrading`.

## Source parsing / uploads
- `src/lib/kb/sources.ts` builds storage paths, normalizes chunk settings, and parses text,
  markdown, CSV, JSON, HTML, PDF, DOCX, XLS/XLSX. Heavy parsers are lazy-imported.
- Multipart uploads land in Supabase Storage bucket `uploads` under
  `{organizationId}/{propertyId}/{sourceId}/{fileName}`.
- Unsupported/corrupt binaries are stored, marked `unsupported`, and excluded from retrieval.

## API routes (`src/app/api/kb/`)
- `upload/`, `update/` — save KB source/row and index vectors when extracted text exists.
- `search/` — calls `retrieveKnowledge`: vector retrieval first, scoped text fallback.
- `list/`, `delete/` — source listing and source deletion, including storage object cleanup.

## Chat retrieval modes
- `/api/chat` calls `retrieveKnowledge` directly instead of self-fetching `/api/kb/search`.
- `hybrid` = chat history + KB, `rolling_window` = chat history only,
  `retrieval_only` = latest user turn + KB. `summary_memory` currently falls back to `hybrid`
  until the summary lifecycle is decided.

## UI (`workspace`)
- ChatNexus-style tabs: Overview, File, Text, Website, API, Database, Tools (last few are
  placeholder/metadata-ready). Includes retrieval settings and retrieval-preview metadata.
- **Text tab** = stable overwrite flow keyed `property:<propertyId>:text`; overwrite
  refreshes the vector rows. Legacy plain KB block was removed.
- File tab uses real multipart upload and shows source info/delete controls.

## Verification
- `npm run audit:vector-pipeline` currently reports 0 findings across 32 checks.
