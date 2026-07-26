import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildApprovedDescriptiveKnowledge,
  buildAuthoritativePropertyContext,
  buildPropertyImportPreview,
  buildPropertyMediaStoragePath,
  isApprovedDescriptiveKnowledge,
  suggestPropertyImportMapping,
  type AuthoritativeMedia,
  type AuthoritativeProperty,
  type AuthoritativeRoom,
} from '@/lib/property-content';

const property: AuthoritativeProperty = {
  id: 'property-1',
  organizationId: 'organization-1',
  name: 'Quarry Heights',
  area: 'Newlands East',
  description: 'Sunny rooms close to local transport.',
  address: 'Private structured address',
  mapsUrl: 'https://maps.example/quarry',
  publicPageUrl: 'https://example.com/quarry',
  photosUrl: 'https://photos.example/quarry',
  pamphletUrl: 'https://example.com/quarry.pdf',
  contactPrimary: '0810000000',
  contactSecondary: '',
  viewingInstructions: 'Staff must arrange access.',
  parking: 'Limited',
  features: ['Wi-Fi'],
  descriptiveContentApproved: true,
};

const room: AuthoritativeRoom = {
  id: 'room-1',
  propertyId: property.id,
  label: 'Room 04',
  description: 'Bright private room with an en-suite.',
  unitType: 'room',
  contactPrimary: '',
  contactSecondary: '',
  rentAmount: 3800,
  depositAmount: 3800,
  depositTerms: 'Staff-confirmed',
  occupancy: 'vacant',
  isAvailable: true,
  availableFrom: '2026-08-01',
  parking: 'None',
  ensuite: true,
  maxOccupants: 1,
  features: ['Wi-Fi'],
  viewingInstructions: 'Staff must confirm.',
  descriptiveContentApproved: true,
};

const media: AuthoritativeMedia = {
  id: 'media-1',
  propertyId: property.id,
  unitId: '',
  kind: 'photo',
  sourceKind: 'external',
  storageBucket: 'uploads',
  storagePath: '',
  externalUrl: 'https://photos.example/quarry/1',
  caption: 'Front entrance',
  altText: 'Secure blue entrance gate',
  displayOrder: 1,
  mimeType: 'image/jpeg',
  byteSize: null,
  isApproved: true,
};

test('mapping assistant proposes known structured fields with review confidence', () => {
  const suggestions = suggestPropertyImportMapping(['Room Number', 'Monthly Rent', 'Google Photos', 'Mystery']);
  assert.deepEqual(suggestions.map((item) => item.targetField), ['roomLabel', 'rentAmount', 'photosUrl', 'ignore']);
  assert.equal(suggestions[0].confidence, 0.78);
  assert.equal(suggestions[3].confidence, 0);
});

test('structured import preview validates mappings before save', () => {
  const preview = buildPropertyImportPreview([
    { Unit: 'Room 04', Rent: 'R 3,800', Available: 'yes', Occupancy: 'vacant', Features: 'Wi-Fi; Ensuite' },
  ]);
  assert.equal(preview.canApply, true);
  assert.equal(preview.rows[0].values.roomLabel, 'Room 04');
  assert.equal(preview.rows[0].values.rentAmount, 3800);
  assert.equal(preview.rows[0].values.isAvailable, true);
  assert.equal(preview.rows[0].values.features, 'Wi-Fi, Ensuite');
});

test('structured import preview blocks invalid decision-critical data', () => {
  const preview = buildPropertyImportPreview([
    { Room: 'Room 04', Rent: '-100', Available: 'maybe', Occupancy: 'unknown' },
  ]);
  assert.equal(preview.canApply, false);
  assert.match(preview.rows[0].errors.join(' '), /Occupancy/);
  assert.match(preview.rows[0].errors.join(' '), /Rent/);
  assert.match(preview.rows[0].errors.join(' '), /Availability/);
});

test('property media paths are private-bucket paths associated to property and optional room', () => {
  const value = buildPropertyMediaStoragePath({
    organizationId: 'org-1',
    propertyId: 'property-1',
    unitId: 'room-4',
    mediaId: 'media-1',
    fileName: '../Front Gate 01.jpg',
  });
  assert.equal(value, 'org-1/property-1/media/rooms/room-4/media-1/Front-Gate-01.jpg');
  assert.doesNotMatch(value, /\.\./);
});

test('vector content contains only separately approved descriptive copy', () => {
  const content = buildApprovedDescriptiveKnowledge({ property, rooms: [room], media: [media] });
  assert.match(content, /Sunny rooms/);
  assert.match(content, /Bright private room/);
  assert.match(content, /Front entrance/);
  assert.doesNotMatch(content, /3800|vacant|2026-08-01|0810000000|Private structured address/);
});

test('structured facts remain authoritative and separate from descriptive vectors', () => {
  const context = buildAuthoritativePropertyContext({ property, rooms: [room], media: [media] });
  assert.match(context, /structured records override/i);
  assert.match(context, /staff confirmation/i);
  assert.match(context, /"rentAmount": 3800/);
  assert.match(context, /"depositAmount": 3800/);
  assert.match(context, /"isAvailable": true/);
  assert.match(context, /https:\/\/photos\.example\/quarry\/1/);
});

test('retrieval boundary accepts only approved descriptive metadata', () => {
  const base = {
    id: 'vector-1',
    category: 'property-description',
    title: 'Approved',
    content: 'Safe description',
    metadata: {
      contentClass: 'approved_descriptive',
      approvalStatus: 'approved',
      propertyId: 'property-1',
    },
  };
  assert.equal(isApprovedDescriptiveKnowledge(base), true);
  assert.equal(isApprovedDescriptiveKnowledge({ ...base, metadata: { ...base.metadata, approvalStatus: 'draft' } }), false);
  assert.equal(isApprovedDescriptiveKnowledge({ ...base, metadata: { propertyId: 'property-1' } }), false);
});
