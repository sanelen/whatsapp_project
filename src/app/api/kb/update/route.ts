import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase } from '@/lib/types';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, content, title, category } = body;

    if (!id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'KB ID required', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const updateFields: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };

    // Allow partial updates — only include fields that are provided
    if (typeof content === 'string') updateFields.content = content;
    if (typeof title === 'string' && title.trim()) updateFields.title = title.trim();
    if (typeof category === 'string' && category.trim()) updateFields.category = category.trim();

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('knowledge_base')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('KB update error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Update failed: ${error.message}`, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<KnowledgeBase>>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error('KB update exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
