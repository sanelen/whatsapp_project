import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('knowledge_base')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('KB list error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to fetch KB: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse<KnowledgeBase[]>>(
      { success: true, data, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error('KB list exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    );
  }
}
