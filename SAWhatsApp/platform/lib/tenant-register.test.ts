// AUT-9 unit tests — tenant register helpers.
// No database: a chainable mock admin client records the query that each
// helper builds, and returns a canned { data, error } so we can assert
// table names, filters, payloads, and null/error handling.
//
// Run with:  npm test   (from SAWhatsApp/platform)

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __setTestSupabaseAdmin,
  getOrganizationBySlug,
  getPropertiesByOrg,
  getProperty,
  getPropertyChatbotSettings,
  updateTenantProfile,
} from './supabase';

type Op = [string, ...unknown[]];
interface Ctx {
  table: string;
  ops: Op[];
  payload?: unknown;
  upsertOpts?: unknown;
}
interface MockResult {
  data: unknown;
  error: { code?: string; message: string } | null;
}

/**
 * Build a fake Supabase admin client. `responder` receives the recorded
 * query context and returns the { data, error } the chain should resolve to.
 * The builder is both await-able (for chains ending in .order()) and exposes
 * .single()/.maybeSingle() (for chains ending in those).
 */
function createMockAdmin(responder: (ctx: Ctx) => MockResult) {
  const log: Ctx[] = [];

  function makeBuilder(ctx: Ctx) {
    const resolve = () => Promise.resolve(responder(ctx));
    const builder: Record<string, unknown> = {
      select(arg: unknown) { ctx.ops.push(['select', arg]); return builder; },
      eq(col: string, val: unknown) { ctx.ops.push(['eq', col, val]); return builder; },
      order(col: string, opts: unknown) { ctx.ops.push(['order', col, opts]); return builder; },
      limit(n: number) { ctx.ops.push(['limit', n]); return builder; },
      upsert(payload: unknown, opts: unknown) {
        ctx.payload = payload;
        ctx.upsertOpts = opts;
        ctx.ops.push(['upsert']);
        return builder;
      },
      maybeSingle() { return resolve(); },
      single() { return resolve(); },
      then(onF: (v: MockResult) => unknown, onR?: (e: unknown) => unknown) {
        return resolve().then(onF, onR);
      },
    };
    return builder;
  }

  const admin = {
    from(table: string) {
      const ctx: Ctx = { table, ops: [] };
      log.push(ctx);
      return makeBuilder(ctx);
    },
    _log: log,
  };
  return admin;
}

function hasOp(ctx: Ctx, name: string, ...args: unknown[]) {
  return ctx.ops.some(
    (op) => op[0] === name && args.every((a, i) => JSON.stringify(op[i + 1]) === JSON.stringify(a)),
  );
}

test.afterEach(() => __setTestSupabaseAdmin(null));

// ── getOrganizationBySlug ──────────────────────────────────────
test('getOrganizationBySlug queries organizations filtered by slug', async () => {
  const org = { id: 'o1', name: 'Hamba Trading', slug: 'hamba-trading' };
  const mock = createMockAdmin(() => ({ data: org, error: null }));
  __setTestSupabaseAdmin(mock as never);

  const result = await getOrganizationBySlug('hamba-trading');

  assert.deepEqual(result, org);
  const ctx = mock._log[0];
  assert.equal(ctx.table, 'organizations');
  assert.ok(hasOp(ctx, 'eq', 'slug', 'hamba-trading'), 'should filter by slug');
});

test('getOrganizationBySlug returns null when not found', async () => {
  __setTestSupabaseAdmin(createMockAdmin(() => ({ data: null, error: null })) as never);
  assert.equal(await getOrganizationBySlug('missing'), null);
});

test('getOrganizationBySlug throws on db error', async () => {
  __setTestSupabaseAdmin(
    createMockAdmin(() => ({ data: null, error: { message: 'boom' } })) as never,
  );
  await assert.rejects(() => getOrganizationBySlug('x'), /Failed to fetch organization: boom/);
});

// ── getPropertiesByOrg ─────────────────────────────────────────
test('getPropertiesByOrg filters by org + active and orders by name', async () => {
  const props = [{ id: 'p1', name: '33 Essex', is_active: true }];
  const mock = createMockAdmin(() => ({ data: props, error: null }));
  __setTestSupabaseAdmin(mock as never);

  const result = await getPropertiesByOrg('o1');

  assert.deepEqual(result, props);
  const ctx = mock._log[0];
  assert.equal(ctx.table, 'properties');
  assert.ok(hasOp(ctx, 'eq', 'organization_id', 'o1'), 'filters by organization_id');
  assert.ok(hasOp(ctx, 'eq', 'is_active', true), 'filters active only');
  assert.ok(hasOp(ctx, 'order', 'name', { ascending: true }), 'orders by name asc');
});

test('getPropertiesByOrg returns [] when data is null', async () => {
  __setTestSupabaseAdmin(createMockAdmin(() => ({ data: null, error: null })) as never);
  assert.deepEqual(await getPropertiesByOrg('o1'), []);
});

// ── getProperty ────────────────────────────────────────────────
test('getProperty queries properties by id', async () => {
  const prop = { id: 'p1', name: '33 Essex' };
  const mock = createMockAdmin(() => ({ data: prop, error: null }));
  __setTestSupabaseAdmin(mock as never);

  const result = await getProperty('p1');

  assert.deepEqual(result, prop);
  assert.equal(mock._log[0].table, 'properties');
  assert.ok(hasOp(mock._log[0], 'eq', 'id', 'p1'));
});

// ── getPropertyChatbotSettings ─────────────────────────────────
test('getPropertyChatbotSettings reads property_chatbot_settings by property_id', async () => {
  const settings = { id: 's1', property_id: 'p1', auto_reply_enabled: true };
  const mock = createMockAdmin(() => ({ data: settings, error: null }));
  __setTestSupabaseAdmin(mock as never);

  const result = await getPropertyChatbotSettings('p1');

  assert.deepEqual(result, settings);
  assert.equal(mock._log[0].table, 'property_chatbot_settings');
  assert.ok(hasOp(mock._log[0], 'eq', 'property_id', 'p1'));
});

test('getPropertyChatbotSettings returns null when no override configured', async () => {
  __setTestSupabaseAdmin(createMockAdmin(() => ({ data: null, error: null })) as never);
  assert.equal(await getPropertyChatbotSettings('p1'), null);
});

// ── updateTenantProfile ────────────────────────────────────────
test('updateTenantProfile upserts customer with phone + tenant fields', async () => {
  const saved = { id: 'c1', phone_number: '+27820000000', unit_number: '4B', lease_status: 'active' };
  const mock = createMockAdmin(() => ({ data: saved, error: null }));
  __setTestSupabaseAdmin(mock as never);

  const result = await updateTenantProfile('+27820000000', {
    unit_number: '4B',
    lease_status: 'active',
    property_id: 'p1',
  });

  assert.deepEqual(result, saved);
  const ctx = mock._log[0];
  assert.equal(ctx.table, 'customers');

  const payload = ctx.payload as Record<string, unknown>;
  assert.equal(payload.phone_number, '+27820000000', 'payload carries phone_number');
  assert.equal(payload.unit_number, '4B');
  assert.equal(payload.lease_status, 'active');
  assert.equal(payload.property_id, 'p1');
  assert.ok(typeof payload.updated_at === 'string', 'sets updated_at');
  assert.deepEqual(ctx.upsertOpts, { onConflict: 'phone_number', ignoreDuplicates: false });
});

test('updateTenantProfile throws on db error', async () => {
  __setTestSupabaseAdmin(
    createMockAdmin(() => ({ data: null, error: { message: 'nope' } })) as never,
  );
  await assert.rejects(
    () => updateTenantProfile('+1', { unit_number: '1' }),
    /Failed to update tenant profile: nope/,
  );
});
