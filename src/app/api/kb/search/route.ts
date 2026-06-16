import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeSearchResult } from '@/lib/types';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  DEFAULT_MATCH_COUNT,
  DEFAULT_MATCH_THRESHOLD,
  resolveOpenAiEmbeddingKey,
  retrieveKnowledge,
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
      organizationId,
      propertyId,
    } = body as {
      query?: string;
      matchCount?: number;
      matchThreshold?: number;
      sourceType?: KnowledgeSourceType;
      organizationId?: string;
      propertyId?: string;
    };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Query parameter required', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();

    const { retrieval, results } = await retrieveKnowledge({
      admin,
      apiKey: resolveOpenAiEmbeddingKey(),
      query,
      matchCount,
      matchThreshold,
      sourceType,
      organizationId,
      propertyId,
    });

    return NextResponse.json<ApiResponse<KnowledgeSearchResult[]> & { retrieval: 'vector' | 'text' }>(
      {
        success: true,
        retrieval,
        data: results,
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
