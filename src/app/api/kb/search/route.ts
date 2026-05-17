import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Query parameter required' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
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
        { success: false, error: `Search failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<KnowledgeBase[]>>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error('KB search exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    );
  }
}
