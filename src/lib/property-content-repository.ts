import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PROPERTY_MEDIA_BUCKET,
  PROPERTY_MEDIA_MAX_BYTES,
  type AuthoritativeMedia,
  type AuthoritativeProperty,
  type AuthoritativeRoom,
  type PropertyContentSnapshot,
  type PropertyMediaKind,
  type PropertyMediaSource,
} from '@/lib/property-content';

type DatabaseError = { code?: string; message?: string } | null;

export function isPropertyContentSchemaMissing(error: DatabaseError) {
  return error?.code === '42703' || error?.code === '42P01' || error?.code === 'PGRST204' || error?.code === 'PGRST205';
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapProperty(row: Record<string, unknown>): AuthoritativeProperty {
  return {
    id: text(row.id),
    organizationId: text(row.organization_id),
    name: text(row.name),
    area: text(row.location),
    description: text(row.description),
    address: text(row.address),
    mapsUrl: text(row.maps_url),
    publicPageUrl: text(row.public_page_url),
    photosUrl: text(row.photos_url),
    pamphletUrl: text(row.pamphlet_url),
    contactPrimary: text(row.contact_primary),
    contactSecondary: text(row.contact_secondary),
    viewingInstructions: text(row.viewing_instructions),
    parking: text(row.parking),
    features: stringArray(row.features),
    descriptiveContentApproved: row.descriptive_content_approved === true,
  };
}

function mapRoom(row: Record<string, unknown>): AuthoritativeRoom {
  return {
    id: text(row.id),
    propertyId: text(row.property_id),
    label: text(row.label),
    description: text(row.description),
    unitType: text(row.unit_type) || 'room',
    contactPrimary: text(row.contact_primary),
    contactSecondary: text(row.contact_secondary),
    rentAmount: number(row.rent_amount),
    depositAmount: number(row.deposit_amount),
    depositTerms: text(row.deposit_terms),
    occupancy: row.occupancy_status === 'vacant' ? 'vacant' : 'occupied',
    isAvailable: row.is_available === true,
    availableFrom: text(row.available_from),
    parking: text(row.parking),
    ensuite: row.ensuite === true,
    maxOccupants: number(row.max_occupants),
    features: stringArray(row.features),
    viewingInstructions: text(row.viewing_instructions),
    descriptiveContentApproved: row.descriptive_content_approved === true,
  };
}

function mapMedia(row: Record<string, unknown>): AuthoritativeMedia {
  const kind = ['photo', 'floorplan', 'video', 'document'].includes(text(row.kind))
    ? text(row.kind) as PropertyMediaKind
    : 'photo';
  const sourceKind = row.source_kind === 'external' ? 'external' : 'storage';
  return {
    id: text(row.id),
    propertyId: text(row.property_id),
    unitId: text(row.unit_id),
    kind,
    sourceKind: sourceKind as PropertyMediaSource,
    storageBucket: text(row.storage_bucket) || PROPERTY_MEDIA_BUCKET,
    storagePath: text(row.storage_path),
    externalUrl: text(row.external_url),
    caption: text(row.caption),
    altText: text(row.alt_text),
    displayOrder: number(row.display_order),
    mimeType: text(row.mime_type),
    byteSize: row.byte_size == null ? null : number(row.byte_size),
    isApproved: row.is_approved === true,
  };
}

async function signedMedia(admin: SupabaseClient, media: AuthoritativeMedia[]) {
  return Promise.all(media.map(async (item) => {
    if (item.sourceKind !== 'storage' || !item.storagePath) return item;
    const { data } = await admin.storage
      .from(item.storageBucket || PROPERTY_MEDIA_BUCKET)
      .createSignedUrl(item.storagePath, 60 * 15);
    return { ...item, deliveryUrl: data?.signedUrl || '' };
  }));
}

export async function loadPropertyContentSnapshot(
  admin: SupabaseClient,
  propertyId: string
): Promise<PropertyContentSnapshot> {
  const richProperty = await admin
    .from('properties')
    .select('id,organization_id,name,location,description,address,maps_url,public_page_url,photos_url,pamphlet_url,contact_primary,contact_secondary,viewing_instructions,parking,features,descriptive_content_approved')
    .eq('id', propertyId)
    .maybeSingle();
  const propertyResult = richProperty.error && isPropertyContentSchemaMissing(richProperty.error)
    ? await admin.from('properties').select('id,organization_id,name,location').eq('id', propertyId).maybeSingle()
    : richProperty;
  if (propertyResult.error) throw new Error(`Failed to load property content: ${propertyResult.error.message}`);
  if (!propertyResult.data) throw new Error('Property not found.');

  const richRooms = await admin
    .from('property_units')
    .select('id,property_id,label,description,unit_type,contact_primary,contact_secondary,rent_amount,deposit_amount,deposit_terms,occupancy_status,is_available,available_from,parking,ensuite,max_occupants,features,viewing_instructions,descriptive_content_approved')
    .eq('property_id', propertyId)
    .order('display_order', { ascending: true });
  const roomResult = richRooms.error && isPropertyContentSchemaMissing(richRooms.error)
    ? await admin
      .from('property_units')
      .select('id,property_id,label,contact_primary,contact_secondary,rent_amount,deposit_amount,occupancy_status,is_available,parking,ensuite,max_occupants,features')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true })
    : richRooms;
  if (roomResult.error && !isPropertyContentSchemaMissing(roomResult.error)) {
    throw new Error(`Failed to load property rooms: ${roomResult.error.message}`);
  }

  const richMedia = await admin
    .from('property_media')
    .select('id,property_id,unit_id,kind,source_kind,storage_bucket,storage_path,external_url,caption,alt_text,display_order,mime_type,byte_size,is_approved')
    .eq('property_id', propertyId)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  const mediaResult = richMedia.error && isPropertyContentSchemaMissing(richMedia.error)
    ? await admin
      .from('property_media')
      .select('id,property_id,unit_id,kind,storage_path,caption')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true })
    : richMedia;
  if (mediaResult.error && !isPropertyContentSchemaMissing(mediaResult.error)) {
    throw new Error(`Failed to load property media: ${mediaResult.error.message}`);
  }

  const importsResult = await admin
    .from('property_content_imports')
    .select('id,source_file_name,source_format,status,created_at,applied_at,validation_errors')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (importsResult.error && !isPropertyContentSchemaMissing(importsResult.error)) {
    throw new Error(`Failed to load property imports: ${importsResult.error.message}`);
  }

  const media = await signedMedia(admin, ((mediaResult.data ?? []) as Record<string, unknown>[]).map(mapMedia));
  return {
    property: mapProperty(propertyResult.data as Record<string, unknown>),
    rooms: ((roomResult.data ?? []) as Record<string, unknown>[]).map(mapRoom),
    media,
    imports: ((importsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: text(row.id),
      sourceFileName: text(row.source_file_name),
      sourceFormat: text(row.source_format),
      status: text(row.status),
      createdAt: text(row.created_at),
      appliedAt: text(row.applied_at),
      validationErrorCount: Array.isArray(row.validation_errors) ? row.validation_errors.length : 0,
    })),
    storage: {
      bucket: PROPERTY_MEDIA_BUCKET,
      isPrivate: true,
      maxBytes: PROPERTY_MEDIA_MAX_BYTES,
    },
  };
}
