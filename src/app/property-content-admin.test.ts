import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('property content API is authenticated and keeps storage operations server-side', () => {
  const source = readFileSync('src/app/api/property-content/route.ts', 'utf8');
  assert.match(source, /requireApiAuth/);
  assert.match(source, /getApiUser/);
  assert.match(source, /PROPERTY_MEDIA_BUCKET/);
  assert.match(source, /createSignedUrl|loadPropertyContentSnapshot/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SERVICE|service_role.*process\.env/i);
});

test('local browser fixture is explicitly read-only while preserving import preview', () => {
  const source = readFileSync('src/app/api/property-content/route.ts', 'utf8');
  assert.match(source, /isReadOnlyLocalFixtureMode/);
  assert.match(source, /fixture: 'read-only-local'/);
  assert.match(source, /action === 'previewImport'/);
  assert.match(source, /Local fixture mode is read-only/);
});

test('property content workspace exposes facts, media, and review-before-apply import', () => {
  const workspace = readFileSync('src/components/workspace/workspace-route.tsx', 'utf8');
  const content = readFileSync('src/components/workspace/property-content-manager.tsx', 'utf8');
  assert.match(workspace, /'Property Content'/);
  assert.match(workspace, /<PropertyContentManager/);
  assert.match(content, /Facts & rooms/);
  assert.match(content, /Google Photos/);
  assert.match(content, /Preview mapping/);
  assert.match(content, /Nothing has been saved yet/);
  assert.match(content, /disabled=\{busy \|\| !importPreview\.preview\.canApply\}/);
});

test('property content schema preserves structured authority and durable handoff evidence', () => {
  const migration = readFileSync('supabase/migrations/20260725214000_add_authoritative_property_content.sql', 'utf8');
  assert.match(migration, /public_page_url/);
  assert.match(migration, /descriptive_content_approved/);
  assert.match(migration, /property_content_imports/);
  assert.match(migration, /storage_bucket text not null default 'uploads'/);
  assert.match(migration, /handoff_requested_at/);
  assert.match(migration, /revoke all on table public\.property_content_imports from anon, authenticated/);
});
