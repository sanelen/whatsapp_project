import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { ApiResponse, KnowledgeBase, KnowledgeIndexingStatus } from '@/lib/types';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { indexKnowledgeEntry, resolveOpenAiEmbeddingKey, type KnowledgeSourceType } from '@/lib/kb/vector';
import {
  buildKnowledgeStoragePath,
  createKnowledgeSourceId,
  DEFAULT_UPLOADS_BUCKET,
  normalizeChunkSettings,
  parseKnowledgeFile,
} from '@/lib/kb/sources';

type SourceMetadata = Record<string, string | number | boolean | string[] | null | undefined>;

type UploadPayload = {
  category: string;
  title: string;
  sourceType: KnowledgeSourceType;
  sourceId: string;
  sourceName: string;
  content: string;
  tags: string[];
  metadata: SourceMetadata;
  overwrite: boolean;
};

async function ensureUploadsBucket() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw new Error(`Failed to inspect storage buckets: ${error.message}`);

  if (data?.some((bucket) => bucket.name === DEFAULT_UPLOADS_BUCKET)) return;

  const { error: createError } = await admin.storage.createBucket(DEFAULT_UPLOADS_BUCKET, {
    public: false,
    fileSizeLimit: '50MB',
  });

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw new Error(`Failed to create uploads bucket: ${createError.message}`);
  }
}

async function deleteExistingSource(sourceType: KnowledgeSourceType, sourceId: string) {
  const admin = getSupabaseAdmin();
  const { data: existing, error } = await admin
    .from('knowledge_base')
    .select('id,metadata')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId);

  if (error) {
    throw new Error(`Failed to find existing source: ${error.message}`);
  }

  const storagePaths = (existing || [])
    .map((entry) => entry.metadata)
    .map((metadata) => {
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
      const candidate = (metadata as Record<string, unknown>).storagePath;
      return typeof candidate === 'string' && candidate.trim() ? candidate : null;
    })
    .filter((value): value is string => Boolean(value));

  if (storagePaths.length > 0) {
    await admin.storage.from(DEFAULT_UPLOADS_BUCKET).remove(storagePaths);
  }

  const existingIds = (existing || []).map((entry) => entry.id);
  if (existingIds.length === 0) return;

  const { error: deleteError } = await admin.from('knowledge_base').delete().in('id', existingIds);
  if (deleteError) {
    throw new Error(`Failed to overwrite existing source: ${deleteError.message}`);
  }
}

function buildJsonPayload(body: unknown): UploadPayload {
  const input = body as {
    category?: string;
    title?: string;
    content?: string;
    tags?: string[];
    sourceType?: KnowledgeSourceType;
    sourceId?: string;
    sourceName?: string;
    metadata?: SourceMetadata;
    overwrite?: boolean;
  };

  if (!input.category || !input.title || !input.content) {
    throw new Error('Missing required fields: category, title, content');
  }

  const sourceType = input.sourceType ?? 'text';
  const sourceId = typeof input.sourceId === 'string' && input.sourceId.trim() ? input.sourceId.trim() : createKnowledgeSourceId();

  return {
    category: input.category,
    title: input.title,
    sourceType,
    sourceId,
    sourceName: typeof input.sourceName === 'string' && input.sourceName.trim() ? input.sourceName.trim() : input.title,
    content: input.content,
    tags: Array.isArray(input.tags) ? input.tags : [],
    metadata: input.metadata || {},
    overwrite: Boolean(input.overwrite),
  };
}

async function buildMultipartPayload(request: NextRequest): Promise<UploadPayload> {
  const formData = await request.formData();
  const fileValue = formData.get('file');
  if (!(fileValue instanceof File)) {
    throw new Error('Multipart upload requires a file field');
  }

  const organizationId = String(formData.get('organizationId') || '').trim();
  const propertyId = String(formData.get('propertyId') || '').trim();
  if (!organizationId || !propertyId) {
    throw new Error('Multipart upload requires organizationId and propertyId');
  }

  const organizationName = String(formData.get('organizationName') || '').trim();
  const propertyName = String(formData.get('propertyName') || '').trim();
  const sourceType = ((String(formData.get('sourceType') || 'file').trim() || 'file') as KnowledgeSourceType);
  const sourceId = String(formData.get('sourceId') || '').trim() || createKnowledgeSourceId();
  const sourceName = String(formData.get('sourceName') || '').trim() || fileValue.name;
  const overwrite = String(formData.get('overwrite') || '').toLowerCase() === 'true';

  const { chunkStrategy, chunkSize, chunkOverlap } = normalizeChunkSettings({
    chunkStrategy: formData.get('chunkStrategy'),
    chunkSize: formData.get('chunkSize'),
    chunkOverlap: formData.get('chunkOverlap'),
  });

  const buffer = Buffer.from(await fileValue.arrayBuffer());
  const parsed = await parseKnowledgeFile({
    buffer,
    fileName: fileValue.name,
    mimeType: fileValue.type || 'application/octet-stream',
  });

  await ensureUploadsBucket();
  const storagePath = buildKnowledgeStoragePath({
    organizationId,
    propertyId,
    sourceId,
    fileName: fileValue.name,
  });

  const admin = getSupabaseAdmin();
  const { error: uploadError } = await admin.storage
    .from(DEFAULT_UPLOADS_BUCKET)
    .upload(storagePath, fileValue, { upsert: true, contentType: fileValue.type || 'application/octet-stream' });

  if (uploadError) {
    throw new Error(`Failed to upload file to storage: ${uploadError.message}`);
  }

  const metadata: SourceMetadata = {
    origin: 'workspace-file-tab',
    organizationId,
    organizationName,
    propertyId,
    propertyName,
    fileName: fileValue.name,
    fileType: fileValue.type || 'application/octet-stream',
    fileSize: fileValue.size,
    storageBucket: DEFAULT_UPLOADS_BUCKET,
    storagePath,
    parserStatus: parsed.parserStatus,
    parserType: parsed.parserType,
    chunkStrategy,
    chunkSize,
    chunkOverlap,
  };

  return {
    category: 'file',
    title: fileValue.name,
    sourceType,
    sourceId,
    sourceName,
    content: parsed.content,
    tags: ['workspace', 'file'],
    metadata,
    overwrite,
  };
}

async function persistKnowledgeSource(input: UploadPayload) {
  const admin = getSupabaseAdmin();

  if (input.overwrite && input.sourceId) {
    await deleteExistingSource(input.sourceType, input.sourceId);
  }

  if (!input.overwrite) {
    const { data: existing, error: checkError } = await admin
      .from('knowledge_base')
      .select('id')
      .eq('source_type', input.sourceType)
      .eq('source_id', input.sourceId)
      .eq('is_active', true);

    if (checkError) {
      throw new Error(`KB duplicate check failed: ${checkError.message}`);
    }

    if (existing && existing.length > 0) {
      throw new Error(`KB entry "${input.sourceName}" already exists. Delete the existing source first or overwrite it.`);
    }
  }

  const { data, error } = await admin
    .from('knowledge_base')
    .insert([
      {
        category: input.category,
        title: input.title,
        content: input.content,
        tags: input.tags,
        source_type: input.sourceType,
        source_id: input.sourceId,
        source_name: input.sourceName,
        metadata: input.metadata,
        is_active: true,
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save KB: ${error.message}`);
  }

  const parserStatus = input.metadata.parserStatus;
  const shouldIndex = parserStatus !== 'unsupported' && input.content.trim().length > 0;
  const indexing: KnowledgeIndexingStatus = shouldIndex
    ? await indexKnowledgeEntry({
        admin,
        apiKey: resolveOpenAiEmbeddingKey(),
        knowledgeBaseId: data.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceName: input.sourceName,
        category: input.category,
        title: input.title,
        content: input.content,
        tags: input.tags,
        metadata: input.metadata,
      })
    : {
        status: 'skipped',
        chunkCount: 0,
        model: 'text-embedding-3-small',
        dimensions: 768,
        error: parserStatus === 'unsupported' ? 'Stored in Supabase Storage but not indexed for retrieval.' : 'No extracted text available for indexing.',
      };

  if (indexing.status === 'indexed') {
    const { error: metadataUpdateError } = await admin
      .from('knowledge_base')
      .update({
        metadata: {
          ...input.metadata,
          vectorCount: indexing.chunkCount,
          indexingStatus: indexing.status,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id);

    if (metadataUpdateError) {
      throw new Error(`Failed to update KB metadata after indexing: ${metadataUpdateError.message}`);
    }
  }

  return { data, indexing };
}

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;

  try {
    const contentType = request.headers.get('content-type') || '';
    const payload = contentType.includes('multipart/form-data')
      ? await buildMultipartPayload(request)
      : buildJsonPayload(await request.json());

    const { data, indexing } = await persistKnowledgeSource(payload);

    return NextResponse.json<ApiResponse<KnowledgeBase> & { indexing: KnowledgeIndexingStatus }>(
      { success: true, data, indexing, timestamp: new Date().toISOString() },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    const status = message.startsWith('Missing') || message.includes('requires') ? 400 : message.includes('already exists') ? 409 : 500;
    return NextResponse.json<ApiResponse>(
      { success: false, error: message, timestamp: new Date().toISOString() },
      { status }
    );
  }
}
