import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase, KnowledgeIndexingStatus } from '@/lib/types';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  indexKnowledgeEntry,
  resolveOpenAiEmbeddingKey,
  type KnowledgeSourceType,
} from '@/lib/kb/vector';

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await request.json();
    const {
      category,
      title,
      content,
      tags,
      sourceType = 'text',
      sourceId,
      sourceName,
      metadata,
      overwrite = false,
    } = body as {
      category?: string;
      title?: string;
      content?: string;
      tags?: string[];
      sourceType?: KnowledgeSourceType;
      sourceId?: string;
      sourceName?: string;
      metadata?: Record<string, string | number | boolean | string[] | null | undefined>;
      overwrite?: boolean;
    };

    if (!category || !title || !content) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Missing required fields: category, title, content', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const normalizedSourceId = typeof sourceId === 'string' && sourceId.trim() ? sourceId.trim() : '';
    const normalizedSourceName = typeof sourceName === 'string' && sourceName.trim() ? sourceName.trim() : title;

    if (overwrite && normalizedSourceId) {
      const { data: existingBySource, error: sourceLookupError } = await admin
        .from('knowledge_base')
        .select('id')
        .eq('source_type', sourceType)
        .eq('source_id', normalizedSourceId);

      if (sourceLookupError) {
        console.error('KB source lookup error:', sourceLookupError);
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Failed to find existing source: ${sourceLookupError.message}`, timestamp: new Date().toISOString() },
          { status: 500 }
        );
      }

      const existingIds = (existingBySource || []).map((entry) => entry.id);
      if (existingIds.length > 0) {
        const { error: vectorDeleteError } = await admin.from('knowledge_vectors').delete().in('knowledge_base_id', existingIds);
        if (vectorDeleteError) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: `Failed to clear existing vectors: ${vectorDeleteError.message}`, timestamp: new Date().toISOString() },
            { status: 500 }
          );
        }
        const { error: deleteError } = await admin.from('knowledge_base').delete().in('id', existingIds);
        if (deleteError) {
          return NextResponse.json<ApiResponse>(
            { success: false, error: `Failed to overwrite existing source: ${deleteError.message}`, timestamp: new Date().toISOString() },
            { status: 500 }
          );
        }
      }
    }
    
    // Check for duplicates
    const { data: existing, error: checkError } = overwrite
      ? { data: [], error: null }
      : await admin
          .from('knowledge_base')
          .select('id')
          .eq('category', category)
          .eq('title', title)
          .eq('is_active', true);

    if (checkError) {
      console.error('KB duplicate check error:', checkError);
    }

    if (existing && existing.length > 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `KB entry "${title}" already exists in ${category}. Delete the existing entry first if you want to replace it.`, timestamp: new Date().toISOString() },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from('knowledge_base')
      .insert([
        {
          category,
          title,
          content,
          tags: tags || [],
          source_type: sourceType,
          source_id: normalizedSourceId || null,
          source_name: normalizedSourceName,
          metadata: metadata || {},
          is_active: true,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('KB upload error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to save KB: ${error.message}`, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    const indexing = await indexKnowledgeEntry({
      admin,
      apiKey: resolveOpenAiEmbeddingKey(),
      knowledgeBaseId: data.id,
      sourceType,
      sourceId: normalizedSourceId || data.id,
      sourceName: normalizedSourceName,
      category,
      title,
      content,
      tags: tags || [],
      metadata,
    });

    return NextResponse.json<ApiResponse<KnowledgeBase> & { indexing: KnowledgeIndexingStatus }>(
      { success: true, data, indexing, timestamp: new Date().toISOString() },
      { status: 201 }
    );
  } catch (err) {
    console.error('KB upload exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
