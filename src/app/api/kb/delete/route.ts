import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse } from '@/lib/types';
import { requireApiAuth } from '@/lib/auth/api-guard';

export async function DELETE(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'KB ID required', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('knowledge_base')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('KB delete error:', error);
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Delete failed: ${error.message}`, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse>(
      { success: true, timestamp: new Date().toISOString() },
      { status: 200 }
    );
  } catch (err) {
    console.error('KB delete exception:', err);
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : 'Unknown'}`, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
