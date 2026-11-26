import test from 'node:test';
import assert from 'node:assert/strict';
import { computeUnitStatus } from './monthly-payment-status';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://match-persistence.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-test-key';

test('automatic matching persists pending only, skips ambiguity and replay, and loses safely to a concurrent match', async t => {
  const { autoMatchUnmatchedReferences, matchReferenceToUnit } = await import('./monthly-payments-ops');
  const references = [
    { id: 'unique', organization_id: 'org', property_id: 'property', unit_id: null as string | null, unit_payment_period_id: null as string | null, reference: 'ROOMONE', amount: 1900, received_at: '2026-11-25', signed_off: false, bank_import_entry_id: null },
    { id: 'ambiguous', organization_id: 'org', property_id: 'property', unit_id: null as string | null, unit_payment_period_id: null as string | null, reference: 'ROOMONE ROOMTWO', amount: 1900, received_at: '2026-11-25', signed_off: false, bank_import_entry_id: null },
  ];
  const unit = { id: 'unit', property_id: 'property', rent_amount: 1900, deposit_amount: 0, occupancy_status: 'occupied', is_blocked: false };
  const period = { id: 'period', unit_id: 'unit', expected_amount: 1900, status: 'unpaid', is_blocked: false, period_start: '2026-12-01', due_date: '2026-12-08' };
  const events: Array<{ event_type: string }> = [];
  let writes = 0;
  let concurrent = false;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'match-persistence.invalid', 'No live network in persistence verification');
    const method = init?.method ?? 'GET';
    const table = url.pathname.split('/').at(-1);
    if (table === 'bank_import_unit_match_hints') return Response.json(['ROOMONE', 'ROOMTWO'].map((value, i) => ({ id: `hint${i}`, unit_id: i ? 'other-unit' : 'unit', property_id: 'property', matcher_type: 'reference_contains', matcher_value: value, amount_value: null, priority: 10, is_active: true })));
    if (table === 'payment_references') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (method === 'PATCH') {
        assert.equal(url.searchParams.get('unit_id'), 'is.null');
        assert.equal(url.searchParams.get('signed_off'), 'eq.false');
        const row = references.find(r => r.id === id)!;
        if (concurrent) { row.unit_id = 'operator-unit'; row.signed_off = true; }
        if (row.unit_id || row.signed_off) return Response.json(null);
        const patch = JSON.parse(String(init?.body));
        assert.equal(patch.signed_off, false); assert.equal(patch.signed_off_at, null);
        Object.assign(row, patch); writes++; return Response.json({ id });
      }
      if (id) return Response.json(references.find(r => r.id === id));
      if (url.searchParams.get('unit_id') === 'is.null') return Response.json(references.filter(r => !r.unit_id && !r.signed_off));
      return Response.json(references.filter(r => r.unit_payment_period_id === 'period'));
    }
    if (table === 'property_units') return Response.json(url.searchParams.has('id') ? unit : [unit]);
    if (table === 'unit_payment_periods') {
      if (method === 'PATCH') { Object.assign(period, JSON.parse(String(init?.body))); return new Response(null, { status: 204 }); }
      return Response.json(url.searchParams.has('unit_id') || url.searchParams.has('id') ? (url.searchParams.get('unit_id')?.startsWith('in.') ? [period] : period) : [period]);
    }
    if (table === 'payment_match_events') { events.push(JSON.parse(String(init?.body))); return new Response(null, { status: 204 }); }
    if (['deposit_contributions', 'unit_credits', 'unit_credit_allocations', 'unit_occupancies', 'deposit_ledger_entries'].includes(table ?? '')) return Response.json([]);
    throw new Error(`Unexpected table ${table}`);
  });
  const first = await autoMatchUnmatchedReferences({ actor: 'auto-match (isolated)' });
  assert.deepEqual(first, { scanned: 2, matched: 1, ambiguous: 1, unmatched: 0, failed: 0 });
  assert.equal(references[0].signed_off, false); assert.equal(references[1].unit_id, null);
  assert.equal(period.status, 'unpaid', 'Legacy persisted status does not claim signed-off rent');
  assert.equal(computeUnitStatus({ occupancyStatus: 'occupied', isBlocked: false, expectedAmount: 1900, matchedReferences: references.filter(r => r.unit_id === 'unit'), dueDate: '2026-12-08', now: new Date('2026-12-01T05:30:00Z') }).status, 'pending');
  assert.equal(writes, 1);
  const replay = await autoMatchUnmatchedReferences({ actor: 'auto-match (isolated)' });
  assert.equal(replay.matched, 0); assert.equal(writes, 1);
  references[0].unit_id = null; references[0].unit_payment_period_id = null;
  concurrent = true;
  const raced = await matchReferenceToUnit({ propertyId: 'property', unitId: 'unit', paymentReferenceId: 'unique', actor: 'auto-match (isolated)', matchMethod: 'auto_reference' });
  assert.equal(raced.matched, false); assert.equal(writes, 1);
  assert.equal(references[0].unit_id, 'operator-unit'); assert.equal(references[0].signed_off, true);
  assert.equal(events.filter(event => event.event_type === 'matched').length, 1);
  assert.equal(events.filter(event => event.event_type === 'signed_off').length, 0);
});

test('scoped statement matching selects only imported entry IDs and an empty scope does no work', async t => {
  const { autoMatchUnmatchedReferences } = await import('./monthly-payments-ops');
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'match-persistence.invalid');
    assert.equal(url.pathname.split('/').at(-1), 'payment_references');
    assert.equal(url.searchParams.get('bank_import_entry_id'), 'in.(scoped-entry)');
    assert.equal(url.searchParams.get('unit_id'), 'is.null');
    assert.equal(url.searchParams.get('signed_off'), 'eq.false');
    calls++;
    return Response.json([]);
  });
  await autoMatchUnmatchedReferences({ actor: 'scoped test', bankImportEntryIds: [] });
  assert.equal(calls, 0);
  await autoMatchUnmatchedReferences({ actor: 'scoped test', bankImportEntryIds: ['scoped-entry'] });
  assert.equal(calls, 1);
});
