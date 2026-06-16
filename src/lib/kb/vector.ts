import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KnowledgeBase, KnowledgeSearchResult } from '@/lib/types';
import { normalizeChunkSettings, type ChunkStrategy } from './sources';

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
  organizationId?: string;
  propertyId?: string;
};

export function resolveOpenAiEmbeddingKey(dbKey = ''): string {
  return dbKey || process.env.OPENAI_API_KEY || '';
}

function normalizeChunkText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkByCharacterWindow(text: string, maxChunkLength: number, overlapLength: number): string[] {
  const normalized = normalizeChunkText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChunkLength) return [normalized];

  const safeOverlap = Math.min(Math.max(overlapLength, 0), Math.max(maxChunkLength - 1, 0));
  const step = Math.max(maxChunkLength - safeOverlap, 1);
  const chunks: string[] = [];

  for (let start = 0; start < normalized.length; start += step) {
    const chunk = normalized.slice(start, start + maxChunkLength).trim();
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

function chunkBySentence(text: string, maxChunkLength: number, overlapLength: number): string[] {
  const normalized = normalizeChunkText(text);
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?\n]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  if (!sentences.length) return chunkByCharacterWindow(normalized, maxChunkLength, overlapLength);

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChunkLength) {
      current = candidate;
      continue;
    }

    if (current) chunks.push(current);

    if (sentence.length <= maxChunkLength) {
      current = sentence;
      continue;
    }

    chunks.push(...chunkByCharacterWindow(sentence, maxChunkLength, overlapLength));
    current = '';
  }

  if (current) chunks.push(current);
  return chunks;
}

function chunkByDelimitedSections(text: string, maxChunkLength: number, overlapLength: number, pattern: RegExp): string[] {
  const normalized = normalizeChunkText(text);
  if (!normalized) return [];

  const sections = normalized
    .split(pattern)
    .map((section) => section.trim())
    .filter(Boolean);

  if (!sections.length) return chunkByCharacterWindow(normalized, maxChunkLength, overlapLength);

  return sections.flatMap((section) =>
    section.length <= maxChunkLength ? [section] : chunkByCharacterWindow(section, maxChunkLength, overlapLength)
  );
}

export function chunkKnowledgeText(
  text: string,
  maxChunkLength = 1600,
  overlapLength = 180,
  strategy: ChunkStrategy = 'recursive_character'
): string[] {
  const normalized = normalizeChunkText(text);

  if (!normalized) return [];
  if (normalized.length <= maxChunkLength) return [normalized];

  if (strategy === 'character') {
    return chunkByCharacterWindow(normalized, maxChunkLength, overlapLength);
  }

  if (strategy === 'sentence') {
    return chunkBySentence(normalized, maxChunkLength, overlapLength);
  }

  if (strategy === 'markdown') {
    return chunkByDelimitedSections(normalized, maxChunkLength, overlapLength, /\n(?=#{1,6}\s)/g);
  }

  if (strategy === 'latex') {
    return chunkByDelimitedSections(normalized, maxChunkLength, overlapLength, /\n(?=\\(?:section|subsection|chapter)\{)/g);
  }

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
  const { chunkStrategy, chunkSize, chunkOverlap } = normalizeChunkSettings({
    chunkStrategy: input.metadata?.chunkStrategy,
    chunkSize: input.metadata?.chunkSize,
    chunkOverlap: input.metadata?.chunkOverlap,
  });
  const chunks = chunkKnowledgeText(input.content, chunkSize, chunkOverlap, chunkStrategy);
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
    filter_organization_id: input.organizationId ?? null,
    filter_property_id: input.propertyId ?? null,
  });

  if (error) throw error;
  return (data ?? []) as KnowledgeVectorMatch[];
}

export type KnowledgeRetrieval = {
  retrieval: 'vector' | 'text';
  results: KnowledgeSearchResult[];
};

/**
 * Retrieve knowledge for a query: tries property-scoped vector search first and
 * falls back to scoped text matching. Used directly by both the search API and
 * the chat route so neither pays an internal HTTP round-trip.
 */
export async function retrieveKnowledge(input: SearchKnowledgeInput): Promise<KnowledgeRetrieval> {
  try {
    const vectorMatches = await searchKnowledgeVectors(input);
    if (vectorMatches.length > 0) {
      return {
        retrieval: 'vector',
        results: vectorMatches.map((match) => ({
          id: match.id,
          category: match.metadata?.category || match.source_type,
          title: match.title,
          content: match.content,
          source_type: match.source_type,
          source_id: match.source_id,
          source_name: match.source_name,
          chunk_index: match.chunk_index,
          chunk_count: match.metadata?.chunkCount,
          metadata: match.metadata,
          similarity: match.similarity,
        })),
      };
    }
  } catch (error) {
    console.error('KB vector search fallback:', error);
  }

  const searchTerm = `%${input.query.toLowerCase()}%`;
  let fallbackQuery = input.admin
    .from('knowledge_base')
    .select('*')
    .eq('is_active', true)
    .neq('metadata->>parserStatus', 'unsupported')
    .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
    .limit(input.matchCount ?? DEFAULT_MATCH_COUNT)
    .order('created_at', { ascending: false });

  if (input.propertyId) {
    fallbackQuery = fallbackQuery.contains('metadata', { propertyId: input.propertyId });
  }

  const { data, error } = await fallbackQuery;
  if (error) throw error;

  return {
    retrieval: 'text',
    results: ((data || []) as KnowledgeBase[]).map((entry) => ({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      content: entry.content,
      source_type: 'legacy',
      source_id: entry.source_id || entry.id,
      source_name: entry.title,
      metadata: { fallback: true, tags: entry.tags || [] },
    })),
  };
}
