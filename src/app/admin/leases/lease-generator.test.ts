import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildPaymentReference,
  createLeaseDraft,
  propertyConfigs,
  validateLeaseDraft,
} from '@/lib/lease-generator';

test('lease tools use the existing Hamba authentication guard', () => {
  const layout = readFileSync('src/app/admin/leases/layout.tsx', 'utf8');
  const route = readFileSync('src/app/api/admin/bank-accounts/route.ts', 'utf8');
  assert.match(layout, /requireUser/);
  assert.match(route, /requireApiAuth/);
  assert.doesNotMatch(layout + route, /ADMIN_PORTAL_PASSWORD|hasAdminSession/);
});

test('verified property facts remain location-specific', () => {
  assert.equal(propertyConfigs['quarry-heights'].parkingLocked, true);
  assert.equal(propertyConfigs['quarry-heights'].wifi, 'included');
  assert.equal(propertyConfigs.westridge.parkingDefault, 'pending');
  assert.equal(propertyConfigs['33-essex'].wifi, 'included');
});

test('payment references follow the verified source formats', () => {
  const quarry = { ...createLeaseDraft('quarry-heights'), unit: '6', tenantName: 'Ayanda', tenantSurname: 'Dlamini' };
  const westridge = { ...createLeaseDraft('westridge'), unit: '6', tenantName: 'Ayanda', tenantSurname: 'Dlamini' };
  const essex = { ...createLeaseDraft('33-essex'), unit: '6', tenantName: 'Ayanda', tenantSurname: 'Dlamini' };
  assert.equal(buildPaymentReference(quarry), 'QH06 DLAMINI');
  assert.equal(buildPaymentReference(westridge), 'WR06 AYANDA DLAMINI');
  assert.equal(buildPaymentReference(essex), 'EssexRoom06');
});

test('signature-ready leases require both tenant first name and surname', () => {
  const draft = {
    ...createLeaseDraft('quarry-heights'),
    unit: '6',
    tenantName: 'Ayanda',
    commencementDate: '2026-08-01',
  };
  assert.match(validateLeaseDraft(draft).join(' '), /tenant surname/i);
  assert.doesNotMatch(validateLeaseDraft({ ...draft, tenantSurname: 'Dlamini' }).join(' '), /tenant surname/i);
});

test('all generated leases exclude shared kitchens and charge for lost keys and tenant-caused damage', () => {
  const page = readFileSync('src/app/admin/leases/page.tsx', 'utf8');
  assert.match(page, /No shared kitchen is provided/);
  assert.match(page, /Lost or damaged keys and access devices will be replaced at the tenant/);
  assert.match(page, /fully liable for the reasonable, documented repair/);
  assert.doesNotMatch(page, /entrances, kitchens,/);
});
