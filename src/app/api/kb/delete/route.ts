import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse } from '@/lib/types';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { DEFAULT_UPLOADS_BUCKET } from '@/lib/kb/sources';

export async function DELETE(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = await request.json();
    const { id, sourceId, sourceType, propertyId } = body as {
      id?: string;
      sourceId?: string;
      sourceType?: string;
      propertyId?: string;
    };

    if (!id && !sourceId) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'KB id or sourceId required', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    let lookup = admin.from('knowledge_base').select('id,metadata');

    if (id) {
      lookup = lookup.eq('id', id);
    } else {
      lookup = lookup.eq('source_id', sourceId || '');
      if (sourceType) lookup = lookup.eq('source_type', sourceType);
      if (propertyId) lookup = lookup.contains('metadata', { propertyId });
    }

    const { data: entries, error: lookupError } = await lookup;
    if (lookupError) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Delete lookup failed: ${lookupError.message}`, timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }

    const entryIds = (entries || []).map((entry) => entry.id);
    const storagePaths = (entries || [])
      .map((entry) => entry.metadata)
      .map((metadata) => {
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
        const storagePath = (metadata as Record<string, unknown>).storagePath;
        return typeof storagePath === 'string' && storagePath.trim() ? storagePath : null;
      })
      .filter((value): value is string => Boolean(value));

    if (entryIds.length === 0) {
      return NextResponse.json<ApiResponse>(
        { success: true, timestamp: new Date().toISOString() },
        { status: 200 }
      );
    }

    if (storagePaths.length > 0) {
      const { error: storageError } = await admin.storage.from(DEFAULT_UPLOADS_BUCKET).remove(storagePaths);
      if (storageError) {
        return NextResponse.json<ApiResponse>(
          { success: false, error: `Storage delete failed: ${storageError.message}`, timestamp: new Date().toISOString() },
          { status: 500 }
        );
      }
    }

    const { error } = await admin
      .from('knowledge_base')
      .delete()
      .in('id', entryIds);

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
