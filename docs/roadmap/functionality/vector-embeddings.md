# Vector Embeddings Roadmap

Last updated: 2026-06-14

## Goals

- Make every property chatbot retrieve only its own property knowledge by default.
- Support text knowledge and uploaded files as durable, independently deletable sources.
- Store uploaded files in Supabase Storage and chunk/index supported files into pgvector.
- Surface retrieval logs in the chatbot tester so results can be validated.

## Knowledge Sources

- Text sources use stable source IDs per property.
- File sources use stable source IDs per upload.
- Metadata must include organization ID/name, property ID/name, source type, source ID, source name, parser status, chunk strategy, chunk size, chunk overlap, storage path, and vector count.

## File Uploads

- Accept any uploaded file into Supabase Storage.
- Store files under `uploads/{organizationId}/{propertyId}/{sourceId}/{originalFileName}`.
- Index supported formats first: text, Markdown, CSV, JSON, HTML, PDF, DOCX, and XLSX.
- Unsupported formats remain stored but show `unsupported` indexing status.

## Chunking

- Provide chunk strategy options:
  - `recursive_character`
  - `character`
  - `markdown_headers`
  - `token`
  - `csv_rows`
- Store chunk size and overlap per source.
- Re-index a source when content or chunk settings change.

## Deletion

Deleting a source must remove:

- Supabase Storage object
- source metadata
- `knowledge_base` rows
- linked `knowledge_vectors` rows

## Chatbot Retrieval

- Add per-chatbot retrieval settings:
  - top-k chunks
  - similarity threshold
  - memory mode
  - chat history window size
- Start with practical memory modes:
  - `rolling_window`
  - `summary_memory`
  - `retrieval_only`
  - `hybrid`

## Retrieval Logs

For each chatbot test message, show:

- organization and property
- retrieval mode and memory mode
- top-k requested and chunks returned
- similarity threshold
- source name and file name
- chunk strategy, chunk index, and chunk count
- similarity score
- chunk text preview
