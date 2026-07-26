import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { getApiUser } from '@/lib/auth/dal';
import { isLocalAuthBypassEnabled } from '@/lib/auth/local-testing';
import {
  buildApprovedDescriptiveKnowledge,
  buildPropertyImportPreview,
  buildPropertyMediaStoragePath,
  importFields,
  isHttpUrl,
  PROPERTY_MEDIA_BUCKET,
  PROPERTY_MEDIA_MAX_BYTES,
  type PropertyImportField,
  type PropertyImportMapping,
  type PropertyMediaKind,
} from '@/lib/property-content';
import { parsePropertyContentFile } from '@/lib/property-content-file';
import { createLocalPropertyContentSnapshot } from '@/lib/property-content-local-fixture';
import {
  isPropertyContentSchemaMissing,
  loadPropertyContentSnapshot,
} from '@/lib/property-content-repository';
import { indexKnowledgeEntry, resolveOpenAiEmbeddingKey } from '@/lib/kb/vector';
import { getSupabaseAdmin } from '@/lib/supabase';

type JsonAction =
  | { action: 'updateProperty'; propertyId: string; property: Record<string, unknown> }
  | { action: 'upsertRoom'; propertyId: string; room: Record<string, unknown> }
  | { action: 'upsertExternalMedia'; propertyId: string; media: Record<string, unknown> }
  | { action: 'setMediaApproval'; propertyId: string; mediaId: string; approved: boolean };

function isReadOnlyLocalFixtureMode() {
  return isLocalAuthBypassEnabled()
    && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanArray(value: unknown) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

function cleanNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function cleanBoolean(value: unknown) {
  return value === true || value === 'true' || value === 'yes' || value === '1';
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Property content request failed.';
  const schemaMissing = /column|relation|schema migration/i.test(message);
  return NextResponse.json(
    {
      success: false,
      error: schemaMissing
        ? `${message} Apply the local authoritative-property-content migration before saving.`
        : message,
    },
    { status: schemaMissing ? 409 : 500 }
  );
}

async function requireProperty(propertyId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('properties')
    .select('id,organization_id')
    .eq('id', propertyId)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (error) throw new Error(`Failed to authorize property content: ${error.message}`);
  if (!data) throw new Error('Property not found.');
  return data;
}

async function requireRoomOwnership(propertyId: string, unitId: string) {
  if (!unitId) return;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('property_units')
    .select('id')
    .eq('id', unitId)
    .eq('property_id', propertyId)
    .maybeSingle();
  if (error) throw new Error(`Failed to authorize room media: ${error.message}`);
  if (!data) throw new Error('The selected room does not belong to this property.');
}

async function syncApprovedDescriptionIndex(propertyId: string) {
  const admin = getSupabaseAdmin();
  const snapshot = await loadPropertyContentSnapshot(admin, propertyId);
  const sourceId = `property-content:${propertyId}`;
  const content = buildApprovedDescriptiveKnowledge(snapshot);
  const { data: existing, error: existingError } = await admin
    .from('knowledge_base')
    .select('id')
    .eq('source_type', 'database')
    .eq('source_id', sourceId)
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (existingError) throw new Error(`Failed to inspect property descriptive index: ${existingError.message}`);

  if (!content) {
    await admin.from('knowledge_vectors').delete().eq('source_type', 'database').eq('source_id', sourceId);
    if (existing?.id) await admin.from('knowledge_base').delete().eq('id', existing.id);
    return;
  }

  const metadata = {
    origin: 'authoritative-property-content',
    organizationId: snapshot.property.organizationId,
    propertyId,
    propertyName: snapshot.property.name,
    contentClass: 'approved_descriptive',
    approvalStatus: 'approved',
    authority: 'descriptive-only',
  };
  const row = {
    category: 'property-description',
    title: `${snapshot.property.name} approved descriptive content`,
    content,
    tags: ['property', 'approved-description'],
    source_type: 'database',
    source_id: sourceId,
    source_name: `${snapshot.property.name} structured content`,
    metadata,
    is_active: true,
    updated_at: new Date().toISOString(),
  };
  let knowledgeBaseId = existing?.id || '';
  if (existing?.id) {
    const { error } = await admin.from('knowledge_base').update(row).eq('id', existing.id);
    if (error) throw new Error(`Failed to update approved descriptive content: ${error.message}`);
  } else {
    const { data, error } = await admin.from('knowledge_base').insert(row).select('id').single();
    if (error) throw new Error(`Failed to create approved descriptive content: ${error.message}`);
    knowledgeBaseId = data.id;
  }

  await indexKnowledgeEntry({
    admin,
    apiKey: resolveOpenAiEmbeddingKey(),
    knowledgeBaseId,
    sourceType: 'database',
    sourceId,
    sourceName: row.source_name,
    category: row.category,
    title: row.title,
    content,
    tags: row.tags,
    metadata,
  });
}

async function updateProperty(
  propertyId: string,
  input: Record<string, unknown>,
  actor: string
) {
  await requireProperty(propertyId);
  const approved = cleanBoolean(input.descriptiveContentApproved);
  const { error } = await getSupabaseAdmin()
    .from('properties')
    .update({
      name: cleanText(input.name) || 'Untitled property',
      location: cleanText(input.area) || 'Location not set',
      description: cleanText(input.description),
      address: cleanText(input.address),
      maps_url: cleanText(input.mapsUrl),
      public_page_url: cleanText(input.publicPageUrl),
      photos_url: cleanText(input.photosUrl),
      pamphlet_url: cleanText(input.pamphletUrl),
      contact_primary: cleanText(input.contactPrimary),
      contact_secondary: cleanText(input.contactSecondary),
      viewing_instructions: cleanText(input.viewingInstructions),
      parking: cleanText(input.parking),
      features: cleanArray(input.features),
      descriptive_content_approved: approved,
      descriptive_content_approved_at: approved ? new Date().toISOString() : null,
      descriptive_content_approved_by: approved ? actor : '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', propertyId);
  if (error) throw new Error(`Failed to save property facts: ${error.message}`);
  await syncApprovedDescriptionIndex(propertyId);
}

async function upsertRoom(
  propertyId: string,
  input: Record<string, unknown>,
  actor: string,
  syncIndex = true
) {
  await requireProperty(propertyId);
  const roomId = cleanText(input.id);
  const label = cleanText(input.label);
  if (!label) throw new Error('Room label is required.');
  const approved = cleanBoolean(input.descriptiveContentApproved);
  const values = {
    property_id: propertyId,
    label,
    description: cleanText(input.description),
    unit_type: cleanText(input.unitType) || 'room',
    contact_primary: cleanText(input.contactPrimary),
    contact_secondary: cleanText(input.contactSecondary),
    rent_amount: cleanNumber(input.rentAmount),
    deposit_amount: cleanNumber(input.depositAmount),
    deposit_terms: cleanText(input.depositTerms),
    occupancy_status: input.occupancy === 'vacant' ? 'vacant' : 'occupied',
    is_available: cleanBoolean(input.isAvailable),
    available_from: cleanText(input.availableFrom) || null,
    parking: cleanText(input.parking),
    ensuite: cleanBoolean(input.ensuite),
    max_occupants: Math.round(cleanNumber(input.maxOccupants, 1)),
    features: cleanArray(input.features),
    viewing_instructions: cleanText(input.viewingInstructions),
    descriptive_content_approved: approved,
    descriptive_content_approved_at: approved ? new Date().toISOString() : null,
    descriptive_content_approved_by: approved ? actor : '',
    updated_at: new Date().toISOString(),
  };
  if (roomId) {
    const { data, error } = await getSupabaseAdmin()
      .from('property_units')
      .update(values)
      .eq('id', roomId)
      .eq('property_id', propertyId)
      .select('id')
      .maybeSingle();
    if (error) throw new Error(`Failed to save room facts: ${error.message}`);
    if (!data) throw new Error('Room not found for this property.');
    if (syncIndex) await syncApprovedDescriptionIndex(propertyId);
    return roomId;
  } else {
    const { data: last } = await getSupabaseAdmin()
      .from('property_units')
      .select('display_order')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle<{ display_order: number }>();
    const { data, error } = await getSupabaseAdmin()
      .from('property_units')
      .insert({ ...values, display_order: Number(last?.display_order ?? 0) + 10 })
      .select('id')
      .single<{ id: string }>();
    if (error) throw new Error(`Failed to create room facts: ${error.message}`);
    if (syncIndex) await syncApprovedDescriptionIndex(propertyId);
    return data.id;
  }
}

async function upsertExternalMedia(
  propertyId: string,
  input: Record<string, unknown>,
  actor: string,
  syncIndex = true
) {
  await requireProperty(propertyId);
  const unitId = cleanText(input.unitId);
  await requireRoomOwnership(propertyId, unitId);
  const externalUrl = cleanText(input.externalUrl);
  if (!isHttpUrl(externalUrl)) throw new Error('External media needs a valid http(s) URL.');
  const kind = cleanText(input.kind) as PropertyMediaKind;
  if (!['photo', 'floorplan', 'video', 'document'].includes(kind)) throw new Error('Invalid media kind.');
  const approved = cleanBoolean(input.isApproved);
  const values = {
    property_id: propertyId,
    unit_id: unitId || null,
    kind,
    source_kind: 'external',
    storage_bucket: PROPERTY_MEDIA_BUCKET,
    storage_path: '',
    external_url: externalUrl,
    caption: cleanText(input.caption),
    alt_text: cleanText(input.altText),
    display_order: Math.round(cleanNumber(input.displayOrder)),
    is_approved: approved,
    approved_at: approved ? new Date().toISOString() : null,
    approved_by: approved ? actor : '',
    updated_at: new Date().toISOString(),
  };
  const mediaId = cleanText(input.id);
  const query = mediaId
    ? getSupabaseAdmin().from('property_media').update(values).eq('id', mediaId).eq('property_id', propertyId)
    : getSupabaseAdmin().from('property_media').insert(values);
  const { error } = await query;
  if (error) throw new Error(`Failed to save external media: ${error.message}`);
  if (syncIndex) await syncApprovedDescriptionIndex(propertyId);
}

async function setMediaApproval(
  propertyId: string,
  mediaId: string,
  approved: boolean,
  actor: string
) {
  const { data, error } = await getSupabaseAdmin()
    .from('property_media')
    .update({
      is_approved: approved,
      approved_at: approved ? new Date().toISOString() : null,
      approved_by: approved ? actor : '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', mediaId)
    .eq('property_id', propertyId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Failed to update media approval: ${error.message}`);
  if (!data) throw new Error('Media not found for this property.');
  await syncApprovedDescriptionIndex(propertyId);
}

function parseMapping(value: FormDataEntryValue | null): PropertyImportMapping | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = JSON.parse(value) as Record<string, unknown>;
  const allowed = new Set<string>(importFields);
  return Object.fromEntries(Object.entries(parsed).map(([header, target]) => [
    header,
    allowed.has(String(target)) ? String(target) as PropertyImportField : 'ignore',
  ]));
}

async function previewImport(formData: FormData) {
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('Choose a structured file.');
  const parsed = await parsePropertyContentFile(file);
  return {
    fileName: file.name,
    format: parsed.format,
    preview: buildPropertyImportPreview(parsed.rows, parseMapping(formData.get('mapping'))),
  };
}

async function applyNormalizedImport(
  propertyId: string,
  rows: ReturnType<typeof buildPropertyImportPreview>['rows'],
  mapping: PropertyImportMapping,
  actor: string
) {
  const mapped = new Set(Object.values(mapping));
  const initialSnapshot = await loadPropertyContentSnapshot(getSupabaseAdmin(), propertyId);
  const roomsByLabel = new Map(initialSnapshot.rooms.map((item) => [item.label.trim().toLowerCase(), item]));
  for (const row of rows) {
    const value = row.values;
    let importedUnitId = '';
    if (value.scope === 'property') {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (mapped.has('propertyName')) update.name = value.propertyName;
      if (mapped.has('area')) update.location = value.area;
      if (mapped.has('address')) update.address = value.address;
      if (mapped.has('mapsUrl')) update.maps_url = value.mapsUrl;
      if (mapped.has('description')) update.description = value.description;
      if (mapped.has('parking')) update.parking = value.parking;
      if (mapped.has('features')) update.features = cleanArray(value.features);
      if (mapped.has('contactPrimary')) update.contact_primary = value.contactPrimary;
      if (mapped.has('contactSecondary')) update.contact_secondary = value.contactSecondary;
      if (mapped.has('viewingInstructions')) update.viewing_instructions = value.viewingInstructions;
      if (mapped.has('publicPageUrl')) update.public_page_url = value.publicPageUrl;
      if (mapped.has('photosUrl')) update.photos_url = value.photosUrl;
      if (mapped.has('pamphletUrl')) update.pamphlet_url = value.pamphletUrl;
      const { error } = await getSupabaseAdmin().from('properties').update(update).eq('id', propertyId);
      if (error) throw new Error(`Import failed on property row ${row.rowNumber}: ${error.message}`);
    } else {
      const roomKey = cleanText(value.roomLabel).toLowerCase();
      const existing = roomsByLabel.get(roomKey);
      const roomInput = {
        id: existing?.id,
        label: cleanText(value.roomLabel),
        description: cleanText(mapped.has('description') ? value.description : existing?.description || ''),
        unitType: cleanText(mapped.has('unitType') ? value.unitType : existing?.unitType || 'room'),
        rentAmount: cleanNumber(mapped.has('rentAmount') ? value.rentAmount : existing?.rentAmount || 0),
        depositAmount: cleanNumber(mapped.has('depositAmount') ? value.depositAmount : existing?.depositAmount || 0),
        depositTerms: cleanText(mapped.has('depositTerms') ? value.depositTerms : existing?.depositTerms || ''),
        occupancy: (mapped.has('occupancy') ? value.occupancy : existing?.occupancy || 'occupied') === 'vacant' ? 'vacant' as const : 'occupied' as const,
        isAvailable: cleanBoolean(mapped.has('isAvailable') ? value.isAvailable : existing?.isAvailable || false),
        availableFrom: cleanText(mapped.has('availableFrom') ? value.availableFrom : existing?.availableFrom || ''),
        parking: cleanText(mapped.has('parking') ? value.parking : existing?.parking || ''),
        ensuite: cleanBoolean(mapped.has('ensuite') ? value.ensuite : existing?.ensuite || false),
        maxOccupants: cleanNumber(mapped.has('maxOccupants') ? value.maxOccupants : existing?.maxOccupants || 1, 1),
        features: cleanArray(mapped.has('features') ? value.features : existing?.features || []),
        contactPrimary: cleanText(mapped.has('contactPrimary') ? value.contactPrimary : existing?.contactPrimary || ''),
        contactSecondary: cleanText(mapped.has('contactSecondary') ? value.contactSecondary : existing?.contactSecondary || ''),
        viewingInstructions: cleanText(mapped.has('viewingInstructions') ? value.viewingInstructions : existing?.viewingInstructions || ''),
        descriptiveContentApproved: existing?.descriptiveContentApproved || false,
      };
      importedUnitId = await upsertRoom(propertyId, roomInput, actor, false);
      roomsByLabel.set(roomKey, {
        ...(existing || {
          id: importedUnitId,
          propertyId,
          label: cleanText(value.roomLabel),
          description: '',
          unitType: 'room',
          contactPrimary: '',
          contactSecondary: '',
          rentAmount: 0,
          depositAmount: 0,
          depositTerms: '',
          occupancy: 'occupied' as const,
          isAvailable: false,
          availableFrom: '',
          parking: '',
          ensuite: false,
          maxOccupants: 1,
          features: [],
          viewingInstructions: '',
          descriptiveContentApproved: false,
        }),
        ...roomInput,
        id: importedUnitId,
        propertyId,
        label: cleanText(value.roomLabel),
        features: cleanArray(roomInput.features),
        rentAmount: cleanNumber(roomInput.rentAmount),
        depositAmount: cleanNumber(roomInput.depositAmount),
        maxOccupants: cleanNumber(roomInput.maxOccupants, 1),
        isAvailable: cleanBoolean(roomInput.isAvailable),
        ensuite: cleanBoolean(roomInput.ensuite),
        occupancy: roomInput.occupancy === 'vacant' ? 'vacant' : 'occupied',
        descriptiveContentApproved: cleanBoolean(roomInput.descriptiveContentApproved),
      });
    }

    if (cleanText(value.mediaUrl)) {
      await upsertExternalMedia(propertyId, {
        unitId: importedUnitId,
        externalUrl: value.mediaUrl,
        kind: value.mediaKind,
        caption: value.mediaCaption,
        altText: value.mediaAltText,
        displayOrder: value.mediaDisplayOrder,
        isApproved: value.mediaApproved,
      }, actor, false);
    }
  }
}

async function applyImport(formData: FormData, actor: string) {
  const propertyId = cleanText(formData.get('propertyId'));
  const property = await requireProperty(propertyId);
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('Choose the same structured file used for preview.');
  const mapping = parseMapping(formData.get('mapping'));
  if (!mapping) throw new Error('Review and submit an approved mapping.');
  const parsed = await parsePropertyContentFile(file);
  const preview = buildPropertyImportPreview(parsed.rows, mapping);
  if (!preview.canApply) throw new Error(preview.errors.join(' '));

  const importId = randomUUID();
  const storagePath = [
    property.organization_id,
    propertyId,
    'imports',
    importId,
    file.name.replace(/[^a-zA-Z0-9._-]+/g, '-'),
  ].join('/');
  const admin = getSupabaseAdmin();
  const { error: uploadError } = await admin.storage
    .from(PROPERTY_MEDIA_BUCKET)
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (uploadError) throw new Error(`Failed to retain the reviewed import source: ${uploadError.message}`);

  const { error: auditError } = await admin.from('property_content_imports').insert({
    id: importId,
    property_id: propertyId,
    source_file_name: file.name,
    source_format: parsed.format,
    storage_bucket: PROPERTY_MEDIA_BUCKET,
    storage_path: storagePath,
    mapping,
    preview_rows: preview.rows,
    validation_errors: [],
    status: 'validated',
    created_by: actor,
  });
  if (auditError) {
    await admin.storage.from(PROPERTY_MEDIA_BUCKET).remove([storagePath]);
    throw new Error(`Failed to record the reviewed import: ${auditError.message}`);
  }

  try {
    await applyNormalizedImport(propertyId, preview.rows, mapping, actor);
    await admin.from('property_content_imports').update({
      status: 'applied',
      applied_by: actor,
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', importId);
  } catch (error) {
    await admin.from('property_content_imports').update({
      status: 'failed',
      validation_errors: [{ message: error instanceof Error ? error.message : 'Import apply failed.' }],
      updated_at: new Date().toISOString(),
    }).eq('id', importId);
    throw error;
  }
  await syncApprovedDescriptionIndex(propertyId);
  return { importId, appliedRows: preview.rows.length };
}

async function uploadMedia(formData: FormData, actor: string) {
  const propertyId = cleanText(formData.get('propertyId'));
  const property = await requireProperty(propertyId);
  const unitId = cleanText(formData.get('unitId'));
  await requireRoomOwnership(propertyId, unitId);
  const file = formData.get('file');
  if (!(file instanceof File)) throw new Error('Choose a media file.');
  if (file.size > PROPERTY_MEDIA_MAX_BYTES) throw new Error('Media uploads are limited to 50 MB.');
  const allowedMime = /^(image\/|video\/)|^application\/pdf$/;
  if (!allowedMime.test(file.type)) throw new Error('Use an image, video, or PDF media file.');
  const kind = cleanText(formData.get('kind')) as PropertyMediaKind;
  if (!['photo', 'floorplan', 'video', 'document'].includes(kind)) throw new Error('Invalid media kind.');

  const mediaId = randomUUID();
  const storagePath = buildPropertyMediaStoragePath({
    organizationId: property.organization_id,
    propertyId,
    unitId,
    mediaId,
    fileName: file.name,
  });
  const admin = getSupabaseAdmin();
  const { error: uploadError } = await admin.storage
    .from(PROPERTY_MEDIA_BUCKET)
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (uploadError) throw new Error(`Failed to upload property media: ${uploadError.message}`);

  const approved = cleanBoolean(formData.get('isApproved'));
  const { error } = await admin.from('property_media').insert({
    id: mediaId,
    property_id: propertyId,
    unit_id: unitId || null,
    kind,
    source_kind: 'storage',
    storage_bucket: PROPERTY_MEDIA_BUCKET,
    storage_path: storagePath,
    external_url: '',
    mime_type: file.type,
    byte_size: file.size,
    caption: cleanText(formData.get('caption')),
    alt_text: cleanText(formData.get('altText')),
    display_order: Math.round(cleanNumber(formData.get('displayOrder'))),
    is_approved: approved,
    approved_at: approved ? new Date().toISOString() : null,
    approved_by: approved ? actor : '',
  });
  if (error) {
    await admin.storage.from(PROPERTY_MEDIA_BUCKET).remove([storagePath]);
    throw new Error(`Failed to associate property media: ${error.message}`);
  }
  await syncApprovedDescriptionIndex(propertyId);
  return { mediaId, storageBucket: PROPERTY_MEDIA_BUCKET, storagePath };
}

export async function GET(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const propertyId = request.nextUrl.searchParams.get('propertyId')?.trim() || '';
  if (!propertyId) return NextResponse.json({ success: false, error: 'propertyId is required.' }, { status: 400 });
  if (isReadOnlyLocalFixtureMode()) {
    return NextResponse.json({
      success: true,
      data: createLocalPropertyContentSnapshot(propertyId),
      fixture: 'read-only-local',
    });
  }
  try {
    return NextResponse.json({
      success: true,
      data: await loadPropertyContentSnapshot(getSupabaseAdmin(), propertyId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  const user = await getApiUser();
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const actor = user.email || user.id;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const action = cleanText(formData.get('action'));
      if (action === 'previewImport') {
        return NextResponse.json({ success: true, data: await previewImport(formData) });
      }
      if (isReadOnlyLocalFixtureMode()) {
        return NextResponse.json(
          { success: false, error: 'Local fixture mode is read-only. Preview is available, but nothing can be saved.' },
          { status: 409 }
        );
      }
      if (action === 'applyImport') {
        return NextResponse.json({ success: true, data: await applyImport(formData, actor) });
      }
      if (action === 'uploadMedia') {
        return NextResponse.json({ success: true, data: await uploadMedia(formData, actor) }, { status: 201 });
      }
      return NextResponse.json({ success: false, error: 'Unsupported multipart action.' }, { status: 400 });
    }

    const body = await request.json() as JsonAction;
    if (!body.propertyId) return NextResponse.json({ success: false, error: 'propertyId is required.' }, { status: 400 });
    if (isReadOnlyLocalFixtureMode()) {
      return NextResponse.json(
        { success: false, error: 'Local fixture mode is read-only. Connect the development Supabase project to save.' },
        { status: 409 }
      );
    }
    if (body.action === 'updateProperty') await updateProperty(body.propertyId, body.property, actor);
    else if (body.action === 'upsertRoom') await upsertRoom(body.propertyId, body.room, actor);
    else if (body.action === 'upsertExternalMedia') await upsertExternalMedia(body.propertyId, body.media, actor);
    else if (body.action === 'setMediaApproval') await setMediaApproval(body.propertyId, body.mediaId, body.approved, actor);
    else return NextResponse.json({ success: false, error: 'Unsupported property-content action.' }, { status: 400 });

    return NextResponse.json({
      success: true,
      data: await loadPropertyContentSnapshot(getSupabaseAdmin(), body.propertyId),
    });
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && isPropertyContentSchemaMissing(error as { code?: string })) {
      return NextResponse.json(
        { success: false, error: 'Apply the local authoritative-property-content migration before saving.' },
        { status: 409 }
      );
    }
    return errorResponse(error);
  }
}
