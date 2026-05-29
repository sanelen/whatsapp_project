// AUT-9 integration tests — run against the LIVE Supabase project.
//
// Run with:  npm run test:integration   (from SAWhatsApp/platform)
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// and NEXT_PUBLIC_SUPABASE_ANON_KEY (loaded via node --env-file).
//
// These verify AUT-9's acceptance criteria against the real database:
//   * the tenant-register tables/columns exist (migration applied)
//   * service-role can round-trip a tenant profile
//   * RLS blocks anonymous writes
// If the migration has NOT been applied, the schema tests fail with a clear
// message naming the missing table/column — that is the intended signal.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import {
  getCustomerByPhone,
  updateTenantProfile,
} from './supabase';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';

const missingEnv = !url || !serviceKey;
const skip = missingEnv ? 'Supabase env not set (need .env.local) — skipping integration tests' : false;

const admin = missingEnv ? null : createClient(url, serviceKey);

/** True if `table.column` is selectable (i.e. exists). */
async function columnExists(table: string, column: string): Promise<{ ok: boolean; code?: string; message?: string }> {
  const { error } = await admin!.from(table).select(column).limit(1);
  if (!error) return { ok: true };
  return { ok: false, code: error.code, message: error.message };
}

// ── Connectivity ───────────────────────────────────────────────
test('connects to live Supabase (customers reachable)', { skip }, async () => {
  const { error } = await admin!.from('customers').select('id').limit(1);
  assert.equal(error, null, `customers should be reachable: ${error?.message}`);
});

// ── AUT-9 schema presence (acceptance criteria) ────────────────
test('organizations.slug column exists', { skip }, async () => {
  const r = await columnExists('organizations', 'slug');
  assert.ok(r.ok, `organizations.slug missing → migration 202605280002 not applied (${r.code}: ${r.message})`);
});

test('properties table exists', { skip }, async () => {
  const r = await columnExists('properties', 'organization_id');
  assert.ok(r.ok, `properties table/column missing → migration not applied (${r.code}: ${r.message})`);
});

test('property_chatbot_settings table exists', { skip }, async () => {
  const r = await columnExists('property_chatbot_settings', 'property_id');
  assert.ok(r.ok, `property_chatbot_settings missing → migration not applied (${r.code}: ${r.message})`);
});

test('customers has AUT-9 tenant columns', { skip }, async () => {
  for (const col of ['property_id', 'unit_number', 'lease_status', 'emergency_contact', 'notes']) {
    const r = await columnExists('customers', col);
    assert.ok(r.ok, `customers.${col} missing → migration not applied (${r.code}: ${r.message})`);
  }
});

test('conversations.property_id column exists', { skip }, async () => {
  const r = await columnExists('conversations', 'property_id');
  assert.ok(r.ok, `conversations.property_id missing → migration not applied (${r.code}: ${r.message})`);
});

// ── Service-role tenant round-trip ─────────────────────────────
test('updateTenantProfile round-trips a tenant via service role', { skip }, async () => {
  const phone = `+99999${Date.now().toString().slice(-7)}`;
  try {
    const saved = await updateTenantProfile(phone, {
      unit_number: '4B',
      lease_status: 'active',
      notes: 'AUT-9 integration test row',
    });
    assert.equal(saved.phone_number, phone);
    assert.equal(saved.unit_number, '4B');
    assert.equal(saved.lease_status, 'active');

    const fetched = await getCustomerByPhone(phone);
    assert.ok(fetched, 'customer should be readable after upsert');
    assert.equal(fetched.unit_number, '4B');
  } finally {
    // cleanup
    await admin!.from('customers').delete().eq('phone_number', phone);
  }
});

// ── RLS: anonymous writes blocked ──────────────────────────────
test('anon client cannot write to organizations (RLS)', { skip: skip || !anonKey }, async () => {
  const anon = createClient(url, anonKey);
  const { error } = await anon
    .from('organizations')
    .insert({ name: 'rls-probe', slug: `rls-probe-${Date.now()}` })
    .select();
  assert.ok(error, 'anonymous insert into organizations should be rejected by RLS');
});
