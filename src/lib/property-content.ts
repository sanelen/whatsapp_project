import type { KnowledgeSearchResult } from '@/lib/types';

export const PROPERTY_MEDIA_BUCKET = 'uploads';
export const PROPERTY_MEDIA_MAX_BYTES = 50_000_000;

export type PropertyMediaKind = 'photo' | 'floorplan' | 'video' | 'document';
export type PropertyMediaSource = 'storage' | 'external';

export type AuthoritativeProperty = {
  id: string;
  organizationId: string;
  name: string;
  area: string;
  description: string;
  address: string;
  mapsUrl: string;
  publicPageUrl: string;
  photosUrl: string;
  pamphletUrl: string;
  contactPrimary: string;
  contactSecondary: string;
  viewingInstructions: string;
  parking: string;
  features: string[];
  descriptiveContentApproved: boolean;
};

export type AuthoritativeRoom = {
  id: string;
  propertyId: string;
  label: string;
  description: string;
  unitType: string;
  contactPrimary: string;
  contactSecondary: string;
  rentAmount: number;
  depositAmount: number;
  depositTerms: string;
  occupancy: 'occupied' | 'vacant';
  isAvailable: boolean;
  availableFrom: string;
  parking: string;
  ensuite: boolean;
  maxOccupants: number;
  features: string[];
  viewingInstructions: string;
  descriptiveContentApproved: boolean;
};

export type AuthoritativeMedia = {
  id: string;
  propertyId: string;
  unitId: string;
  kind: PropertyMediaKind;
  sourceKind: PropertyMediaSource;
  storageBucket: string;
  storagePath: string;
  externalUrl: string;
  caption: string;
  altText: string;
  displayOrder: number;
  mimeType: string;
  byteSize: number | null;
  isApproved: boolean;
  deliveryUrl?: string;
};

export type PropertyContentSnapshot = {
  property: AuthoritativeProperty;
  rooms: AuthoritativeRoom[];
  media: AuthoritativeMedia[];
  imports: Array<{
    id: string;
    sourceFileName: string;
    sourceFormat: string;
    status: string;
    createdAt: string;
    appliedAt: string;
    validationErrorCount: number;
  }>;
  storage: {
    bucket: typeof PROPERTY_MEDIA_BUCKET;
    isPrivate: true;
    maxBytes: typeof PROPERTY_MEDIA_MAX_BYTES;
  };
};

export const importFields = [
  'ignore',
  'scope',
  'propertyName',
  'area',
  'address',
  'mapsUrl',
  'roomLabel',
  'description',
  'unitType',
  'rentAmount',
  'depositAmount',
  'depositTerms',
  'occupancy',
  'isAvailable',
  'availableFrom',
  'parking',
  'ensuite',
  'maxOccupants',
  'features',
  'contactPrimary',
  'contactSecondary',
  'viewingInstructions',
  'publicPageUrl',
  'photosUrl',
  'pamphletUrl',
  'mediaUrl',
  'mediaKind',
  'mediaCaption',
  'mediaAltText',
  'mediaDisplayOrder',
  'mediaApproved',
] as const;

export type PropertyImportField = (typeof importFields)[number];
export type PropertyImportMapping = Record<string, PropertyImportField>;

export type PropertyImportMappingSuggestion = {
  sourceHeader: string;
  targetField: PropertyImportField;
  confidence: number;
  reason: string;
};

export type PropertyImportPreviewRow = {
  rowNumber: number;
  values: Record<string, string | number | boolean | null>;
  errors: string[];
  warnings: string[];
};

export type PropertyImportPreview = {
  headers: string[];
  suggestions: PropertyImportMappingSuggestion[];
  mapping: PropertyImportMapping;
  rows: PropertyImportPreviewRow[];
  errors: string[];
  canApply: boolean;
};

const fieldAliases: Record<Exclude<PropertyImportField, 'ignore'>, string[]> = {
  scope: ['scope', 'record type', 'record_type', 'type'],
  propertyName: ['property', 'property name', 'property_name', 'building'],
  area: ['area', 'location', 'suburb'],
  address: ['address', 'street address', 'physical address'],
  mapsUrl: ['maps url', 'maps_url', 'google maps', 'map link'],
  roomLabel: ['room', 'room label', 'room_label', 'unit', 'unit label', 'unit_label'],
  description: ['description', 'marketing description', 'marketing copy', 'summary'],
  unitType: ['unit type', 'unit_type', 'room type', 'room_type'],
  rentAmount: ['rent', 'monthly rent', 'rent amount', 'rent_amount', 'price'],
  depositAmount: ['deposit', 'deposit amount', 'deposit_amount'],
  depositTerms: ['deposit terms', 'deposit_terms'],
  occupancy: ['occupancy', 'occupancy status', 'occupancy_status'],
  isAvailable: ['available', 'is available', 'is_available', 'vacancy'],
  availableFrom: ['available from', 'available_from', 'move in date'],
  parking: ['parking'],
  ensuite: ['ensuite', 'en suite'],
  maxOccupants: ['max occupants', 'max_occupants', 'occupants'],
  features: ['features', 'amenities'],
  contactPrimary: ['primary contact', 'contact primary', 'contact_primary', 'phone'],
  contactSecondary: ['secondary contact', 'contact secondary', 'contact_secondary'],
  viewingInstructions: ['viewing instructions', 'viewing_instructions', 'viewing'],
  publicPageUrl: ['public page', 'public page url', 'public_page_url', 'property url'],
  photosUrl: ['photos', 'photos url', 'photos_url', 'google photos'],
  pamphletUrl: ['pamphlet', 'pamphlet url', 'pamphlet_url', 'brochure'],
  mediaUrl: ['media url', 'media_url', 'image url', 'video url'],
  mediaKind: ['media kind', 'media_kind', 'media type'],
  mediaCaption: ['media caption', 'media_caption', 'caption'],
  mediaAltText: ['media alt text', 'media_alt_text', 'alt text'],
  mediaDisplayOrder: ['media order', 'media_display_order', 'display order'],
  mediaApproved: ['media approved', 'media_approved', 'approved'],
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = cleanText(value).toLowerCase();
  if (['true', 'yes', 'y', '1', 'available', 'approved'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'unavailable', 'not approved'].includes(normalized)) return false;
  return normalized ? null : false;
}

function parseMoney(value: unknown): number | null {
  const normalized = cleanText(value).replace(/[R$,\s]/g, '');
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseInteger(value: unknown): number | null {
  const normalized = cleanText(value);
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function splitFeatures(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  return cleanText(value).split(/[;,|]/).map((item) => item.trim()).filter(Boolean);
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function suggestPropertyImportMapping(headers: string[]): PropertyImportMappingSuggestion[] {
  const claimed = new Set<PropertyImportField>();
  return headers.map((sourceHeader) => {
    const normalized = normalizeHeader(sourceHeader);
    let best: { field: PropertyImportField; score: number; alias: string } = {
      field: 'ignore',
      score: 0,
      alias: '',
    };

    for (const [field, aliases] of Object.entries(fieldAliases) as Array<[Exclude<PropertyImportField, 'ignore'>, string[]]>) {
      for (const alias of aliases) {
        const normalizedAlias = normalizeHeader(alias);
        const score = normalized === normalizedAlias
          ? 1
          : normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized)
            ? 0.78
            : 0;
        if (score > best.score && !claimed.has(field)) best = { field, score, alias };
      }
    }

    if (best.field !== 'ignore' && best.score >= 0.7) claimed.add(best.field);
    return {
      sourceHeader,
      targetField: best.score >= 0.7 ? best.field : 'ignore',
      confidence: best.score,
      reason: best.score >= 0.7
        ? `Matched “${sourceHeader}” to the known ${best.field} field${best.alias ? ` via “${best.alias}”` : ''}.`
        : 'No safe structured-field match was found; review or leave ignored.',
    };
  });
}

export function normalizePropertyImportRows(
  sourceRows: Array<Record<string, unknown>>,
  mapping: PropertyImportMapping
): PropertyImportPreviewRow[] {
  return sourceRows.slice(0, 250).map((source, index) => {
    const mapped: Record<string, unknown> = {};
    for (const [sourceHeader, target] of Object.entries(mapping)) {
      if (target !== 'ignore' && sourceHeader in source) mapped[target] = source[sourceHeader];
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const roomLabel = cleanText(mapped.roomLabel);
    const scopeValue = cleanText(mapped.scope).toLowerCase();
    const scope = roomLabel || scopeValue === 'room' || scopeValue === 'unit' ? 'room' : 'property';
    const occupancyValue = cleanText(mapped.occupancy).toLowerCase();
    const occupancy = occupancyValue || 'occupied';
    const rentAmount = parseMoney(mapped.rentAmount);
    const depositAmount = parseMoney(mapped.depositAmount);
    const isAvailable = parseBoolean(mapped.isAvailable);
    const ensuite = parseBoolean(mapped.ensuite);
    const mediaApproved = parseBoolean(mapped.mediaApproved);
    const maxOccupants = parseInteger(mapped.maxOccupants);
    const mediaDisplayOrder = parseInteger(mapped.mediaDisplayOrder);
    const urlFields = ['mapsUrl', 'publicPageUrl', 'photosUrl', 'pamphletUrl', 'mediaUrl'] as const;

    if (scope === 'room' && !roomLabel) errors.push('Room rows require a room or unit label.');
    if (!['occupied', 'vacant'].includes(occupancy)) errors.push('Occupancy must be occupied or vacant.');
    if (rentAmount === null) errors.push('Rent must be a non-negative number.');
    if (depositAmount === null) errors.push('Deposit must be a non-negative number.');
    if (isAvailable === null) errors.push('Availability must be yes/no or true/false.');
    if (ensuite === null) errors.push('Ensuite must be yes/no or true/false.');
    if (mediaApproved === null) errors.push('Media approval must be yes/no or true/false.');
    if (maxOccupants === null) errors.push('Maximum occupants must be a non-negative whole number.');
    if (mediaDisplayOrder === null) errors.push('Media display order must be a non-negative whole number.');
    for (const field of urlFields) {
      const value = cleanText(mapped[field]);
      if (value && !isHttpUrl(value)) errors.push(`${field} must be an http(s) URL.`);
    }

    const mediaKind = cleanText(mapped.mediaKind).toLowerCase() || 'photo';
    if (!['photo', 'floorplan', 'video', 'document'].includes(mediaKind)) {
      errors.push('Media kind must be photo, floorplan, video, or document.');
    }

    const description = cleanText(mapped.description);
    if (!description) warnings.push('No descriptive copy will be approved or vectorized for this row.');
    if (cleanText(mapped.mediaUrl) && !cleanText(mapped.mediaAltText)) {
      warnings.push('External media should have alt text before approval.');
    }

    return {
      rowNumber: index + 2,
      values: {
        scope,
        propertyName: cleanText(mapped.propertyName),
        area: cleanText(mapped.area),
        address: cleanText(mapped.address),
        mapsUrl: cleanText(mapped.mapsUrl),
        roomLabel,
        description,
        unitType: cleanText(mapped.unitType) || 'room',
        rentAmount: rentAmount ?? cleanText(mapped.rentAmount),
        depositAmount: depositAmount ?? cleanText(mapped.depositAmount),
        depositTerms: cleanText(mapped.depositTerms),
        occupancy,
        isAvailable: isAvailable ?? cleanText(mapped.isAvailable),
        availableFrom: cleanText(mapped.availableFrom),
        parking: cleanText(mapped.parking),
        ensuite: ensuite ?? cleanText(mapped.ensuite),
        maxOccupants: maxOccupants ?? cleanText(mapped.maxOccupants),
        features: splitFeatures(mapped.features).join(', '),
        contactPrimary: cleanText(mapped.contactPrimary),
        contactSecondary: cleanText(mapped.contactSecondary),
        viewingInstructions: cleanText(mapped.viewingInstructions),
        publicPageUrl: cleanText(mapped.publicPageUrl),
        photosUrl: cleanText(mapped.photosUrl),
        pamphletUrl: cleanText(mapped.pamphletUrl),
        mediaUrl: cleanText(mapped.mediaUrl),
        mediaKind,
        mediaCaption: cleanText(mapped.mediaCaption),
        mediaAltText: cleanText(mapped.mediaAltText),
        mediaDisplayOrder: mediaDisplayOrder ?? cleanText(mapped.mediaDisplayOrder),
        mediaApproved: mediaApproved ?? cleanText(mapped.mediaApproved),
      },
      errors,
      warnings,
    };
  });
}

export function buildPropertyImportPreview(
  sourceRows: Array<Record<string, unknown>>,
  providedMapping?: PropertyImportMapping
): PropertyImportPreview {
  const headers = Array.from(new Set(sourceRows.flatMap((row) => Object.keys(row))));
  const suggestions = suggestPropertyImportMapping(headers);
  const mapping = providedMapping ?? Object.fromEntries(
    suggestions.map((suggestion) => [suggestion.sourceHeader, suggestion.targetField])
  );
  const errors: string[] = [];
  if (!sourceRows.length) errors.push('The structured file has no data rows.');
  if (!Object.values(mapping).some((field) => field !== 'ignore')) {
    errors.push('Map at least one source column before applying.');
  }
  const rows = normalizePropertyImportRows(sourceRows, mapping);
  const rowErrorCount = rows.reduce((total, row) => total + row.errors.length, 0);
  if (rowErrorCount) errors.push(`${rowErrorCount} row validation error${rowErrorCount === 1 ? '' : 's'} must be resolved.`);
  return { headers, suggestions, mapping, rows, errors, canApply: errors.length === 0 };
}

export function buildPropertyMediaStoragePath(input: {
  organizationId: string;
  propertyId: string;
  unitId?: string;
  mediaId?: string;
  fileName: string;
}) {
  const safe = input.fileName
    .split(/[\\/]/)
    .pop()
    ?.replace(/[^a-zA-Z0-9._-]+/g, '-') || '';
  const association = input.unitId?.trim() ? `rooms/${input.unitId.trim()}` : 'property';
  return [
    input.organizationId.trim(),
    input.propertyId.trim(),
    'media',
    association,
    input.mediaId || globalThis.crypto.randomUUID(),
    safe || 'upload.bin',
  ].join('/');
}

export function buildApprovedDescriptiveKnowledge(input: {
  property: AuthoritativeProperty;
  rooms: AuthoritativeRoom[];
  media: AuthoritativeMedia[];
}) {
  const parts: string[] = [];
  if (input.property.descriptiveContentApproved && input.property.description.trim()) {
    parts.push(`${input.property.name}: ${input.property.description.trim()}`);
  }
  for (const room of input.rooms) {
    if (room.descriptiveContentApproved && room.description.trim()) {
      parts.push(`${input.property.name} — ${room.label}: ${room.description.trim()}`);
    }
  }
  for (const media of input.media) {
    if (!media.isApproved) continue;
    const description = [media.caption.trim(), media.altText.trim()].filter(Boolean).join('. ');
    if (description) parts.push(`${input.property.name} media: ${description}`);
  }
  return parts.join('\n\n');
}

export function isApprovedDescriptiveKnowledge(result: KnowledgeSearchResult) {
  const metadata = result.metadata && typeof result.metadata === 'object'
    ? result.metadata as Record<string, unknown>
    : {};
  return metadata.contentClass === 'approved_descriptive'
    && metadata.approvalStatus === 'approved'
    && typeof metadata.propertyId === 'string'
    && metadata.propertyId.length > 0;
}

export function buildAuthoritativePropertyContext(input: {
  property: AuthoritativeProperty;
  rooms: AuthoritativeRoom[];
  media: AuthoritativeMedia[];
}) {
  const approvedMedia = input.media
    .filter((item) => item.isApproved)
    .map((item) => ({
      roomId: item.unitId || null,
      kind: item.kind,
      caption: item.caption,
      url: item.sourceKind === 'external' ? item.externalUrl : item.deliveryUrl || '',
    }));
  return JSON.stringify({
    authority: 'These structured records override descriptive/vector content.',
    staffConfirmation: 'Availability, final price, deposits, and viewing arrangements require staff confirmation.',
    property: {
      id: input.property.id,
      name: input.property.name,
      area: input.property.area,
      address: input.property.address,
      parking: input.property.parking,
      features: input.property.features,
      publicPageUrl: input.property.publicPageUrl,
      photosUrl: input.property.photosUrl,
      pamphletUrl: input.property.pamphletUrl,
      contacts: [input.property.contactPrimary, input.property.contactSecondary].filter(Boolean),
      viewingInstructions: input.property.viewingInstructions,
    },
    rooms: input.rooms.map((room) => ({
      id: room.id,
      label: room.label,
      type: room.unitType,
      rentAmount: room.rentAmount,
      depositAmount: room.depositAmount,
      depositTerms: room.depositTerms,
      occupancy: room.occupancy,
      isAvailable: room.isAvailable,
      availableFrom: room.availableFrom || null,
      parking: room.parking,
      ensuite: room.ensuite,
      maxOccupants: room.maxOccupants,
      features: room.features,
      viewingInstructions: room.viewingInstructions,
    })),
    approvedMedia,
  }, null, 2);
}
