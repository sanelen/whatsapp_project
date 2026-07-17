import assert from 'node:assert/strict';
import test from 'node:test';
import { safeRedirectPath } from './redirect-path';

test('keeps an internal destination and query string', () => {
  assert.equal(
    safeRedirectPath('/monthly-payments?period=2026-07'),
    '/monthly-payments?period=2026-07'
  );
});

test('rejects absolute and protocol-relative destinations', () => {
  assert.equal(safeRedirectPath('https://example.com'), '/');
  assert.equal(safeRedirectPath('//example.com'), '/');
  assert.equal(safeRedirectPath('/\\example.com'), '/');
});

test('uses the requested fallback when no destination exists', () => {
  assert.equal(safeRedirectPath(null, '/property-assistance'), '/property-assistance');
});
