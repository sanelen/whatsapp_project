import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from '@playwright/test';

// Real client components, isolated fixtures and navigation; no application server or database.
const output = resolve('.runtime/payment-workspace-check');
await mkdir(output, { recursive: true });
const bundle = await build({
  entryPoints: ['release-tests/payments/fixture.tsx'], bundle: true, write: false,
  format: 'esm', platform: 'browser', jsx: 'automatic',
  alias: { 'next/link': resolve('release-tests/payments/next-shim.tsx'), 'next/navigation': resolve('release-tests/payments/next-shim.tsx') },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const cssPath = resolve('src/app/globals.css');
const css = await postcss([tailwind()]).process(await readFile(cssPath, 'utf8'), { from: cssPath });
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated payment workspace test</title><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const server = createServer((request, response) => {
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  const path = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Content-Type', path === '/fixture.js' ? 'text/javascript' : path === '/style.css' ? 'text/css' : 'text/html');
  response.end(path === '/fixture.js' ? bundle.outputFiles[0].text : path === '/style.css' ? css.css : html);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    const imports = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.url() === `${origin}/api/monthly-payments/import/google-cloud` && request.method() === 'GET') {
        await route.fulfill({ json: { success: true, status: { configured: true } } });
        return;
      }
      if (request.url() === `${origin}/api/monthly-payments/import` && request.method() === 'POST') {
        imports.push(request.postDataJSON());
        await route.fulfill({ json: { success: true, data: [] } });
        return;
      }
      if (!request.url().startsWith(`${origin}/`) || request.method() !== 'GET') {
        errors.push(`Unexpected request: ${request.method()}`);
        await route.abort();
      } else await route.continue();
    });
    await page.goto(`${origin}/reconcile`);
    await page.getByRole('heading', { name: 'Payments needing a unit' }).waitFor();
    await page.getByLabel('Bank account', { exact: true }).selectOption('0000');
    await page.getByRole('status').filter({ hasText: '2 of 3 payments' }).waitFor();
    await page.getByText('Still waiting from earlier months', { exact: true }).waitFor();
    assert.equal(await page.getByText('OTHER ROOM', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/account-filter-${viewport.width}.png`, fullPage: true });
    await page.getByLabel('Bank account', { exact: true }).selectOption('all');
    await page.getByLabel('Search unmatched payments').fill('room 2');
    await page.getByRole('status').filter({ hasText: '2 of 3 payments' }).waitFor();
    await page.getByLabel('Payment property').selectOption('unassigned');
    await page.getByRole('status').filter({ hasText: '1 of 3 payments' }).waitFor();
    const review = page.locator('a[href="/monthly-payments/import-audit?period=2026-08"]').filter({ visible: true });
    assert.ok(await review.count() > 0, 'Unassigned payment must have an import review path');
    await page.screenshot({ path: `${output}/unassigned-${viewport.width}.png`, fullPage: true });
    await page.getByLabel('Payment property').selectOption('test-property');
    await page.getByRole('status').filter({ hasText: '1 of 3 payments' }).waitFor();
    assert.ok(await page.locator('a[href="/monthly-payments/test-property?period=2026-03"]').count() > 0, 'Older payment must link to its original period');
    await page.screenshot({ path: `${output}/previous-${viewport.width}.png`, fullPage: true });
    await page.goto(`${origin}/units`);
    await page.getByText('Signed-off rent', { exact: true }).waitFor();
    await page.getByText('Rent awaiting sign-off', { exact: true }).waitFor();
    await page.getByText('ROOM 1 MARCH', { exact: true }).waitFor();
    await page.getByLabel('Reconciliation status').selectOption('attention');
    await page.getByRole('status').filter({ hasText: '1 of 2 units' }).waitFor();
    await page.getByLabel('Search rooms and references').fill('no match');
    await page.getByText('No units match these filters.', { exact: true }).waitFor();
    await page.getByLabel('Search rooms and references').fill('');
    await page.getByLabel('Reconciliation status').selectOption('all');
    assert.match(await page.getByLabel('Previous month').getAttribute('href'), /period=2026-07&unitId=room-1/);
    await page.getByLabel('Billing month').fill('2026-02');
    assert.equal(await page.locator('html').getAttribute('data-navigation'), '/monthly-payments/test-property?period=2026-02&unitId=room-1');
    await page.screenshot({ path: `${output}/units-${viewport.width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Page must not overflow horizontally');
    await page.goto(`${origin}/dashboard`);
    const sourceGroup = page.getByRole('group', { name: 'Import source' });
    await sourceGroup.waitFor();
    const importBox = await sourceGroup.boundingBox();
    const queueBox = await page.getByText('Work queue', { exact: true }).boundingBox();
    assert.ok(importBox && queueBox && importBox.y < queueBox.y, 'Imports must precede the work queue');
    assert.ok(importBox.y < viewport.height, 'Import sources must be visible at the top');
    await page.getByLabel('Import billing period').selectOption('2026-07');
    for (const [label, source] of [['Gmail', 'gmail'], ['Drive', 'drive'], ['Bank', 'bank'], ['Both', 'both']]) {
      const before = imports.length;
      await sourceGroup.getByRole('button', { name: label, exact: true }).click();
      assert.equal(imports.length, before, 'Selecting a source must not run an import');
      const command = page.getByRole('button', { name: 'Import', exact: true });
      assert.equal(await command.isEnabled(), true);
      await command.click();
      await page.waitForFunction(() => document.documentElement.dataset.refreshed === 'true');
      await page.evaluate(() => delete document.documentElement.dataset.refreshed);
      assert.deepEqual(imports.at(-1), { billingPeriod: '2026-07', pullAll: source === 'bank', source, maxMessages: 50 });
    }
    await page.getByLabel('Pull everything').check();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.refreshed === 'true');
    assert.deepEqual(imports.at(-1), { billingPeriod: '2026-07', pullAll: true, source: 'both', maxMessages: 100 });
    await page.screenshot({ path: `${output}/dashboard-imports-${viewport.width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(`${origin}/audit`);
    await page.getByRole('heading', { name: 'Source-to-database validation' }).waitFor();
    for (const details of await page.locator('details').all()) {
      if (await details.getAttribute('open') === null) await details.locator('summary').click();
    }
    assert.equal(await page.getByRole('link', { name: 'View source file in Drive' }).getAttribute('href'), 'https://drive.google.com/file/d/test-file/view');
    await page.getByText('Not yet saved to Drive', { exact: true }).waitFor();
    assert.equal(await page.locator('a[href*="mail.google.com"]').count(), 0);
    await page.screenshot({ path: `${output}/drive-source-${viewport.width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    results.push({ viewport, passed: ['account filter and carryover', 'unassigned search', 'original-period carryover', 'unit filters and history navigation', 'top-of-dashboard import controls and request contract', 'Drive source and pending archive states'], browserErrors: errors });
    await page.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, results, screenshots: output }, null, 2));
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
