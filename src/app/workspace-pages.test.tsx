import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// These assert the route → view contract from source. We can't import the page
// components directly: they render <WorkspaceRoute>, which pulls in the HeroUI
// client library (`@heroui/react`), and that ESM-only package does not resolve
// under the bare `node --test` runner. Source assertions keep the contract
// without booting the whole component tree.

test('public root page exposes tenant help and legal information without staff tools', () => {
  const source = readFileSync('src/app/page.tsx', 'utf8');
  assert.match(source, /https:\/\/wa\.me\/27812674647/);
  assert.match(source, /href="\/staff"/);
  assert.match(source, /href: '\/privacy'/);
  assert.match(source, /href: '\/terms'/);
  assert.match(source, /href: '\/data-deletion'/);
  assert.doesNotMatch(source, /property-assistance|monthly-payments|admin\/leases/);
});

test('protected staff hub exposes the three tools and logout after server-side authorization', () => {
  const source = readFileSync('src/app/staff/page.tsx', 'utf8');
  assert.match(source, /await requireUser\(\)/);
  assert.match(source, /href: '\/property-assistance'/);
  assert.match(source, /href: '\/monthly-payments'/);
  assert.match(source, /href: '\/admin\/leases'/);
  assert.match(source, /action="\/auth\/signout"/);
});

test('Google authentication safely returns staff to their selected destination', () => {
  const loginSource = readFileSync('src/app/login/login-form.tsx', 'utf8');
  const callbackSource = readFileSync('src/app/auth/callback/route.ts', 'utf8');
  const proxySource = readFileSync('src/proxy.ts', 'utf8');

  assert.match(loginSource, /new URL\('\/auth\/callback'/);
  assert.doesNotMatch(loginSource, /signInWithPassword|signUp\(/);
  assert.doesNotMatch(loginSource, /searchParams\.get\('redirect'\)/);
  assert.match(loginSource, /safeRedirectPath\(searchParams\.get\('next'\), '\/staff'\)/);
  assert.match(callbackSource, /NextResponse\.redirect\(new URL\(nextPath, origin\)\)/);
  assert.match(callbackSource, /isAuthUserAllowed/);
  assert.match(proxySource, /isAuthUserAllowed/);
  assert.match(callbackSource, /safeRedirectPath\(searchParams\.get\('next'\), '\/staff'\)/);
  assert.match(proxySource, /safeRedirectPath/);
  assert.match(proxySource, /isAllowed && pathname === '\/login'[\s\S]*new URL\('\/staff'/);
  assert.doesNotMatch(proxySource, /loginUrl\.searchParams\.set\('redirect'/);
});

test('property assistance page renders the organizations view', () => {
  const source = readFileSync('src/app/property-assistance/page.tsx', 'utf8');
  assert.match(source, /<WorkspaceRoute view="organizations"/);
});

test('monthly payments page renders the monthly payments hub', () => {
  const source = readFileSync('src/app/monthly-payments/page.tsx', 'utf8');
  assert.match(source, /<MonthlyPaymentsHub/);
  assert.match(source, /readMonthlyPaymentsDashboard/);
  assert.match(source, /await requireUser\(\)/);
});

test('monthly payments property page renders the per-unit units table', () => {
  const source = readFileSync('src/app/monthly-payments/[propertyId]/page.tsx', 'utf8');
  assert.match(source, /<UnitsTable table={table} initialUnitId={unitId} \/>/);
  assert.match(source, /readPropertyUnitsTable/);
  assert.match(source, /await requireUser\(\)/);
});

test('monthly payments reference pool page renders the reference pool view', () => {
  const source = readFileSync('src/app/monthly-payments/reference-pool/page.tsx', 'utf8');
  assert.match(source, /<ReferencePoolViewPanel view={view} \/>/);
  assert.match(source, /readReferencePoolView/);
  assert.match(source, /await requireUser\(\)/);
});

test('monthly payments import audit page renders the source validation view', () => {
  const source = readFileSync('src/app/monthly-payments/import-audit/page.tsx', 'utf8');
  assert.match(source, /<ImportAuditViewPanel view={view} \/>/);
  assert.match(source, /readImportAuditView/);
  assert.match(source, /await requireUser\(\)/);
});

test('monthly payments import configuration page renders the metadata view', () => {
  const source = readFileSync('src/app/monthly-payments/import-configuration/page.tsx', 'utf8');
  assert.match(source, /<ImportConfigurationPanel view={view} \/>/);
  assert.match(source, /readImportConfiguration/);
  assert.match(source, /await requireUser\(\)/);
});

test('monthly payments locations page renders the locations admin view', () => {
  const source = readFileSync('src/app/monthly-payments/locations/page.tsx', 'utf8');
  assert.match(source, /<LocationsAdmin view={view} \/>/);
  assert.match(source, /readMonthlyPaymentsLocations/);
  assert.match(source, /await requireUser\(\)/);
});

test('monthly payments room manager page renders the room manager view', () => {
  const source = readFileSync('src/app/monthly-payments/locations/[propertyId]/page.tsx', 'utf8');
  assert.match(source, /<RoomManagerPanel view={view} initialUnitId={unitId} \/>/);
  assert.match(source, /readRoomManagerView/);
  assert.match(source, /await requireUser\(\)/);
});

test('organization page renders the organization view with its id', () => {
  const source = readFileSync('src/app/organizations/[organizationId]/page.tsx', 'utf8');
  assert.match(source, /<WorkspaceRoute view="organization" organizationId={organizationId}/);
});

test('property page renders the property chatbot workspace', () => {
  const source = readFileSync('src/app/properties/[propertyId]/page.tsx', 'utf8');
  assert.match(source, /<WorkspaceRoute view="property" propertyId={propertyId}/);
});

test('legacy chatbot URL renders the same property chatbot workspace', () => {
  const source = readFileSync('src/app/properties/[propertyId]/chatbot/page.tsx', 'utf8');
  assert.match(source, /<WorkspaceRoute view="chatbot" propertyId={propertyId}/);
});

test('property chatbot keeps mobile navigation, a full-width composer, and accessible settings', () => {
  const source = readFileSync('src/components/workspace/workspace-route.tsx', 'utf8');
  const styles = readFileSync('src/app/globals.css', 'utf8');

  assert.match(source, /hamba-assistant-mobile-tabs/);
  assert.match(source, /aria-label="Ask the property assistant"/);
  assert.match(source, /aria-label="Open assistant settings"/);
  assert.match(source, /aria-label="Collapse settings panel"/);
  assert.match(source, /fixed inset-0 z-50 w-full/);
  assert.doesNotMatch(styles, /\.hamba-assistant > aside:first-child \{\s*width: 52px !important/);
  assert.doesNotMatch(styles, /section:first-child,\s*\.hamba-assistant > section > div:last-child > aside:last-child \{\s*width: 36px !important/);
});

test('auth test page exposes a logout form without importing server-only code', () => {
  const source = readFileSync('src/app/auth-test/page.tsx', 'utf8');

  assert.match(source, /requireUser/);
  assert.match(source, /action="\/auth\/signout"/);
});
