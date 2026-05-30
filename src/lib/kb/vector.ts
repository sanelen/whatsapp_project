import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';

export const KNOWLEDGE_EMBEDDING_MODEL = 'text-embedding-3-small';
export const KNOWLEDGE_EMBEDDING_DIMENSIONS = 768;
export const DEFAULT_MATCH_COUNT = 5;
export const DEFAULT_MATCH_THRESHOLD = 0.2;

export type KnowledgeSourceType = 'file' | 'text' | 'website' | 'api' | 'database' | 'tool' | 'legacy';

export type KnowledgeVectorMetadata = {
  sourceType: KnowledgeSourceType;
  sourceId: string;
  sourceName: string;
  category?: string;
  title?: string;
  tags?: string[];
  chunkIndex: number;
  chunkCount: number;
  ingestionStatus: 'indexed';
  [key: string]: string | number | boolean | string[] | null | undefined;
};

export type KnowledgeVectorMatch = {
  id: string;
  knowledge_base_id: string | null;
  source_type: KnowledgeSourceType;
  source_id: string;
  source_name: string;
  title: string;
  content: string;
  chunk_index: number;
  metadata: KnowledgeVectorMetadata;
  similarity: number;
};

export type KnowledgeIndexResult = {
  status: 'indexed' | 'skipped' | 'failed';
  chunkCount: number;
  model: string;
  dimensions: number;
  error?: string;
};

type IndexKnowledgeInput = {
  admin: SupabaseClient;
  apiKey: string;
  knowledgeBaseId: string;
  sourceType?: KnowledgeSourceType;
  sourceId?: string;
  sourceName?: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, string | number | boolean | string[] | null | undefined>;
};

type SearchKnowledgeInput = {
  admin: SupabaseClient;
  apiKey: string;
  query: string;
  matchCount?: number;
  matchThreshold?: number;
  sourceType?: KnowledgeSourceType;
};

export function resolveOpenAiEmbeddingKey(dbKey = ''): string {
  return dbKey || process.env.OPENAI_API_KEY || '';
}

export function chunkKnowledgeText(text: string, maxChunkLength = 1600, overlapLength = 180): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return [];
  if (normalized.length <= maxChunkLength) return [normalized];

  const paragraphs = normalized.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChunkLength) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);
    if (paragraph.length <= maxChunkLength) {
      current = paragraph;
      continue;
    }

    for (let start = 0; start < paragraph.length; start += maxChunkLength - overlapLength) {
      chunks.push(paragraph.slice(start, start + maxChunkLength).trim());
    }
    current = '';
  }

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

export async function createKnowledgeEmbedding(input: string, apiKey: string): Promise<number[]> {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for knowledge embeddings');

  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: KNOWLEDGE_EMBEDDING_MODEL,
    input,
    dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    encoding_format: 'float',
  });

  const embedding = response.data[0]?.embedding;
  if (!embedding || embedding.length !== KNOWLEDGE_EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${KNOWLEDGE_EMBEDDING_DIMENSIONS}-dimension embedding`);
  }

  return embedding;
}

export async function indexKnowledgeEntry(input: IndexKnowledgeInput): Promise<KnowledgeIndexResult> {
  const chunks = chunkKnowledgeText(input.content);
  if (!chunks.length) {
    return {
      status: 'skipped',
      chunkCount: 0,
      model: KNOWLEDGE_EMBEDDING_MODEL,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      error: 'No content to index',
    };
  }

  if (!input.apiKey) {
    return {
      status: 'skipped',
      chunkCount: 0,
      model: KNOWLEDGE_EMBEDDING_MODEL,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      error: 'OPENAI_API_KEY is not configured',
    };
  }

  const sourceType = input.sourceType ?? 'text';
  const sourceId = input.sourceId ?? input.knowledgeBaseId;
  const sourceName = input.sourceName ?? input.title;

  try {
    await input.admin
      .from('knowledge_vectors')
      .delete()
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);

    const rows = [];
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const embedding = await createKnowledgeEmbedding(chunk, input.apiKey);
      const metadata: KnowledgeVectorMetadata = {
        ...input.metadata,
        sourceType,
        sourceId,
        sourceName,
        category: input.category,
        title: input.title,
        tags: input.tags ?? [],
        chunkIndex,
        chunkCount: chunks.length,
        ingestionStatus: 'indexed',
      };

      rows.push({
        knowledge_base_id: input.knowledgeBaseId,
        source_type: sourceType,
        source_id: sourceId,
        source_name: sourceName,
        title: input.title,
        content: chunk,
        chunk_index: chunkIndex,
        chunk_count: chunks.length,
        embedding_model: KNOWLEDGE_EMBEDDING_MODEL,
        embedding_dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
        embedding,
        metadata,
        is_active: true,
      });
    }

    const { error } = await input.admin.from('knowledge_vectors').insert(rows);
    if (error) throw error;

    return {
      status: 'indexed',
      chunkCount: rows.length,
      model: KNOWLEDGE_EMBEDDING_MODEL,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
    };
  } catch (error) {
    return {
      status: 'failed',
      chunkCount: 0,
      model: KNOWLEDGE_EMBEDDING_MODEL,
      dimensions: KNOWLEDGE_EMBEDDING_DIMENSIONS,
      error: error instanceof Error ? error.message : 'Vector indexing failed',
    };
  }
}

export async function searchKnowledgeVectors(input: SearchKnowledgeInput): Promise<KnowledgeVectorMatch[]> {
  const embedding = await createKnowledgeEmbedding(input.query, input.apiKey);
  const { data, error } = await input.admin.rpc('match_knowledge_vectors', {
    query_embedding: embedding,
    match_count: input.matchCount ?? DEFAULT_MATCH_COUNT,
    match_threshold: input.matchThreshold ?? DEFAULT_MATCH_THRESHOLD,
    filter_source_type: input.sourceType ?? null,
  });

  if (error) throw error;
  return (data ?? []) as KnowledgeVectorMatch[];
}
