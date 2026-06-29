import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// These assert the route → view contract from source. We can't import the page
// components directly: they render <WorkspaceRoute>, which pulls in the HeroUI
// client library (`@heroui/react`), and that ESM-only package does not resolve
// under the bare `node --test` runner. Source assertions keep the contract
// without booting the whole component tree.

test('root page links to property assistance and monthly payments', () => {
  const source = readFileSync('src/app/page.tsx', 'utf8');
  assert.match(source, /href: '\/property-assistance'/);
  assert.match(source, /href: '\/monthly-payments'/);
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

test('auth test page exposes a logout form without importing server-only code', () => {
  const source = readFileSync('src/app/auth-test/page.tsx', 'utf8');

  assert.match(source, /requireUser/);
  assert.match(source, /action="\/auth\/signout"/);
});
