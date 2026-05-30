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
    } = body as {
      category?: string;
      title?: string;
      content?: string;
      tags?: string[];
      sourceType?: KnowledgeSourceType;
      sourceId?: string;
      sourceName?: string;
      metadata?: Record<string, string | number | boolean | string[] | null | undefined>;
    };

    if (!category || !title || !content) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Missing required fields: category, title, content', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    
    // Check for duplicates
    const { data: existing, error: checkError } = await admin
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
      sourceId: typeof sourceId === 'string' && sourceId.trim() ? sourceId.trim() : data.id,
      sourceName: typeof sourceName === 'string' && sourceName.trim() ? sourceName.trim() : title,
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
