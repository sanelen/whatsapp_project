import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, title, content, tags } = body;

    if (!category || !title || !content) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Missing required fields: category, title, content' },
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
        { success: false, error: `KB entry "${title}" already exists in ${category}. Delete the existing entry first if you want to replace it.` },
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
        { success: false, error: `Failed to save KB: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<KnowledgeBase>>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status: 201 }
    );
  } catch (err) {
    console.error('KB upload exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    );
  }
}
