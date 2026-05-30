import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase, KnowledgeSearchResult } from '@/lib/types';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  DEFAULT_MATCH_COUNT,
  DEFAULT_MATCH_THRESHOLD,
  resolveOpenAiEmbeddingKey,
  searchKnowledgeVectors,
  type KnowledgeSourceType,
} from '@/lib/kb/vector';

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await request.json();
    const {
      query,
      matchCount = DEFAULT_MATCH_COUNT,
      matchThreshold = DEFAULT_MATCH_THRESHOLD,
      sourceType,
    } = body as {
      query?: string;
      matchCount?: number;
      matchThreshold?: number;
      sourceType?: KnowledgeSourceType;
    };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Query parameter required', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    try {
      const vectorMatches = await searchKnowledgeVectors({
        admin,
        apiKey: resolveOpenAiEmbeddingKey(),
        query,
        matchCount,
        matchThreshold,
        sourceType,
      });

      if (vectorMatches.length > 0) {
        return NextResponse.json<ApiResponse<KnowledgeSearchResult[]> & { retrieval: 'vector' }>(
          {
            success: true,
            retrieval: 'vector',
            data: vectorMatches.map((match) => ({
              id: match.id,
              category: match.metadata?.category || match.source_type,
              title: match.title,
              content: match.content,
              source_type: match.source_type,
              source_name: match.source_name,
              chunk_index: match.chunk_index,
              metadata: match.metadata,
              similarity: match.similarity,
            })),
            timestamp: new Date().toISOString(),
          },
          { status: 200 }
        );
      }
    } catch (error) {
      console.error('KB vector search fallback:', error);
    }

    const searchTerm = `%${query.toLowerCase()}%`;

    const { data, error } = await admin
      .from('knowledge_base')
      .select('*')
      .eq('is_active', true)
      .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
      .limit(5)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('KB search error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Search failed: ${error.message}`, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<KnowledgeSearchResult[]> & { retrieval: 'text' }>(
      {
        success: true,
        retrieval: 'text',
        data: ((data || []) as KnowledgeBase[]).map((entry) => ({
          id: entry.id,
          category: entry.category,
          title: entry.title,
          content: entry.content,
          source_type: 'legacy',
          source_name: entry.title,
          metadata: { fallback: true, tags: entry.tags || [] },
        })),
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('KB search exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
