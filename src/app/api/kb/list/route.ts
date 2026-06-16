import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase } from '@/lib/types';
import { requireApiAuth } from '@/lib/auth/api-guard';

export async function GET(request: Request) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const sourceType = url.searchParams.get('sourceType');
    const admin = getSupabaseAdmin();
    let query = admin
      .from('knowledge_base')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (sourceType) {
      query = query.eq('source_type', sourceType);
    }

    if (propertyId) {
      query = query.contains('metadata', { propertyId });
    }

    const { data, error } = await query;

    if (error) {
      console.error('KB list error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Failed to fetch KB: ${error.message}`, timestamp: new Date().toISOString() },
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
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
