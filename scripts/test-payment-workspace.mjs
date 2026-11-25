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
    const polls = new Map();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.url() === `${origin}/api/monthly-payments/import/google-cloud` && request.method() === 'GET') {
        await route.fulfill({ json: { success: true, status: { configured: true } } });
        return;
      }
      if (request.url() === `${origin}/api/monthly-payments/import` && request.method() === 'POST') {
        imports.push(request.postDataJSON());
        await route.fulfill({ status: 202, json: { success: true, queued: true, workflowRunId: `fixture-${imports.length}` } });
        return;
      }
      if (request.url().startsWith(`${origin}/api/monthly-payments/import?runId=`)) {
        const id = new URL(request.url()).searchParams.get('runId');
        if (id === 'missing') { await route.fulfill({ status: 404, json: { error: 'Import not found' } }); return; }
        const count = (polls.get(id) ?? 0) + 1;
        polls.set(id, count);
        await route.fulfill({ json: count === 1
          ? { success: true, queued: true, progress: { stage: 'gmail', completedBatches: 1 } }
          : { success: true, queued: false, status: 'completed', data: [], autoMatch: { matched: 2, failed: 0 } } });
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
    assert.ok(importBox && queueBox && importBox.y < queueBox.y, 'Imports must precede the rent totals');
    assert.ok(importBox.y < viewport.height, 'Import sources must be visible at the top');
    await page.getByLabel('Import billing period').selectOption('2026-07');
    for (const [label, source] of [['Gmail', 'gmail'], ['Drive', 'drive'], ['Bank', 'bank'], ['Both', 'both']]) {
      const before = imports.length;
      await sourceGroup.getByRole('button', { name: label, exact: true }).click();
      if (source !== 'bank') await page.getByLabel('Import billing period').selectOption('2026-07');
      assert.equal(imports.length, before, 'Selecting a source must not run an import');
      const command = page.getByRole('button', { name: 'Import', exact: true });
      assert.equal(await command.isEnabled(), true);
      await command.click();
      if (source === 'gmail') {
        await page.getByRole('status').filter({ hasText: '1 batches saved' }).waitFor();
        assert.equal(await command.isDisabled(), true);
        await page.reload();
      }
      await page.waitForFunction(() => document.documentElement.dataset.refreshed === 'true');
      await page.evaluate(() => delete document.documentElement.dataset.refreshed);
      assert.deepEqual(imports.at(-1), { billingPeriod: '2026-07', pullAll: source === 'bank', source });
    }
    await page.getByLabel('Pull everything').check();
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.refreshed === 'true');
    assert.deepEqual(imports.at(-1), { billingPeriod: '2026-07', pullAll: true, source: 'both' });
    await page.getByText('2 automatically matched; sign-off remains manual.', { exact: false }).waitFor();
    await page.screenshot({ path: `${output}/dashboard-imports-${viewport.width}.png`, fullPage: true });
    await page.evaluate(() => localStorage.setItem('hamba-bank-import-job-v1', 'missing'));
    await page.reload();
    await page.getByText('This import job is no longer available.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Import', exact: true }).isEnabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.goto(`${origin}/monthly-payments/follow-up?period=2026-11`);
    await page.getByRole('heading', { name: 'Rent Follow-up', exact: true }).waitFor();
    await page.getByLabel('Building', { exact: true }).selectOption('test-property');
    const totals = page.getByRole('region', { name: 'Monthly rent breakdown' });
    assert.match(await totals.innerText(), /4[\s\u00a0]400/);
    await page.getByRole('status').filter({ hasText: '1 of 2 rooms shown' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Room 2', exact: true }).count(), 0);
    assert.match(await page.getByRole('button', { name: /^Still owed R/ }).innerText(), /1[\s\u00a0]200/);
    await page.getByRole('button', { name: 'Waiting for confirmation', exact: true }).click();
    const pendingRoom = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Room 2', exact: true }) });
    await pendingRoom.getByText(/awaiting confirmation.*fully received/).waitFor();
    assert.equal(await pendingRoom.getByText('Overdue', { exact: true }).count(), 0);
    assert.match(await pendingRoom.innerText(), /R 0[,.]00/);
    await page.screenshot({ path: `${output}/collections-pending-${viewport.width}.png`, fullPage: true });
    await page.getByRole('button', { name: /^Overdue R/ }).click();
    await page.getByRole('status').filter({ hasText: '1 of 2 rooms shown' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Room 2', exact: true }).count(), 0);
    await page.screenshot({ path: `${output}/collections-overdue-${viewport.width}.png`, fullPage: true });
    const unitLink = page.getByRole('link', { name: 'Review unit', exact: true });
    assert.equal(await unitLink.getAttribute('href'), '/monthly-payments/test-property?period=2026-11&unitId=room-1');
    await unitLink.click();
    await page.getByText(/Confirmed rent R.*Outstanding R.*Due.*2026-11-08/).waitFor();
    await page.getByRole('link', { name: 'Rent Follow-up', exact: true }).click();
    assert.equal(await page.getByLabel('Billing month', { exact: true }).inputValue(), '2026-11');
    assert.equal(await page.getByLabel('Building', { exact: true }).inputValue(), 'test-property');
    await page.getByRole('button', { name: 'Draft management WhatsApp', exact: true }).click();
    await page.getByText('Edit message', { exact: true }).click();
    const draft = await page.getByLabel('Summary', { exact: true }).inputValue();
    assert.match(draft, /Room 1:.*due 2026-11-08/);
    assert.match(draft, /Awaiting sign-off:.*2[\s\u00a0]200/);
    assert.doesNotMatch(draft, /Room 2:/);
    assert.match(draft, /building=test-property/);
    assert.equal(await page.getByRole('link', { name: 'Open WhatsApp draft' }).count(), 0);
    await page.getByLabel('Management WhatsApp number', { exact: true }).fill('+27 82 000 0000');
    const draftLink = await page.getByRole('link', { name: 'Open WhatsApp draft' }).getAttribute('href');
    assert.equal(new URL(draftLink).searchParams.get('text'), draft);
    assert.equal(new URL(draftLink).pathname, '/27820000000');
    // Inspect the target only. Never navigate to WhatsApp or send a message.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${output}/collections-draft-${viewport.width}.png`, fullPage: true });
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
    results.push({ viewport, passed: ['account filter and carryover', 'unassigned search', 'original-period carryover', 'unit filters and history navigation', 'top-of-dashboard import controls and request contract', 'Drive source and pending archive states', 'Rent Follow-up totals and overdue drilldown', 'scoped unit return and compact WhatsApp draft'], browserErrors: errors });
    await page.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, results, screenshots: output }, null, 2));
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
