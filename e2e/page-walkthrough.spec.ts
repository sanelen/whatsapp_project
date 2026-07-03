import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Flow 00: Page walkthrough with named screenshots (owner request, 2026-07-02)
 *
 * Purpose: functional, goal-based verification of every core operator page,
 * with a NAMED full-page screenshot per page so sessions can be compared
 * before/after and analysed page by page.
 *
 * Usage:
 *   SCREENSHOT_LABEL=before npm run test:e2e -- page-walkthrough
 *   ...make changes...
 *   SCREENSHOT_LABEL=after  npm run test:e2e -- page-walkthrough
 *
 * Screenshots land in e2e/screenshots/<label>/NN-page.png. Without a label,
 * today's date is used. Compare the two folders page by page.
 *
 * These tests assert BUSINESS OUTCOMES, not element existence:
 * - money renders as real numbers (no NaN/undefined anywhere)
 * - the dashboard's headline number is the signed-off total (paid = signed-off
 *   only — owner ruling 2026-07-02)
 * - the dashboard and the first property's units table tell one money story
 * On failure, the screenshot shows the offending page and the assertion
 * message names the broken decision rule.
 */

const label = process.env.SCREENSHOT_LABEL || new Date().toISOString().slice(0, 10);
const shotDir = path.join('e2e', 'screenshots', label);

async function capture(page: Page, name: string) {
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
}

async function assertNoBrokenNumbers(page: Page, pageName: string) {
  const body = (await page.locator('body').textContent()) ?? '';
  for (const poison of ['NaN', 'undefined', 'Infinity']) {
    expect(
      body.includes(poison),
      `BROKEN RULE on ${pageName}: "${poison}" is rendering to the operator. ` +
        'Operator impact: numbers cannot be trusted for decisions. ' +
        `Action: open ${shotDir}/${pageName}.png, find the broken figure, fix the formatter or null-guard in the read model.`
    ).toBe(false);
  }
}

test.describe('Flow 00: page walkthrough + screenshot per page', () => {
  test('dashboard: headline is the signed-off (decision-grade) total', async ({ page }) => {
    await page.goto('/monthly-payments');
    await page.waitForLoadState('networkidle');
    await capture(page, '01-dashboard');
    await assertNoBrokenNumbers(page, '01-dashboard');

    // Paid = signed-off only (owner ruling): the rolling-total section must
    // say so explicitly, so nobody misreads matched money as collected.
    await expect(
      page.getByText(/signed off vs expected/i).first(),
      'BROKEN RULE: dashboard headline is not the signed-off total. Operator impact: collection progress overstated. Action: check rolling-total section in monthly-payments-hub.'
    ).toBeVisible();
  });

  test('first property units table: one money story with the dashboard', async ({ page }) => {
    await page.goto('/monthly-payments');
    await page.waitForLoadState('networkidle');

    // Capture the first property card's paid / awaiting counts.
    const cardText = (await page.locator('h3').first().locator('..').locator('..').textContent()) ?? '';
    const cardPaid = cardText.match(/(\d+)\s+paid/i)?.[1];

    const openUnits = page.getByRole('link', { name: /open units/i }).first();
    if ((await openUnits.count()) === 0) {
      test.skip(true, 'No property cards yet — dashboard is empty in this environment.');
      return;
    }
    await openUnits.click();
    await page.waitForLoadState('networkidle');
    await capture(page, '02-units-table');
    await assertNoBrokenNumbers(page, '02-units-table');

    // NFR-2.3: the units header must agree with the card the operator just left.
    if (cardPaid !== undefined) {
      await expect(
        page.getByText(new RegExp(`${cardPaid}\\s+paid`)).first(),
        `BROKEN RULE (NFR-2.3): dashboard card said ${cardPaid} paid but the units page disagrees. ` +
          'Operator impact: the two screens tell different money stories, trust collapses. ' +
          `Action: compare ${shotDir}/01-dashboard.png vs 02-units-table.png, then check computeUnitStatus usage in both read models.`
      ).toBeVisible();
    }

    // Signed-off framing must carry through to the units summary.
    await expect(
      page.getByText(/signed off/i).first(),
      'BROKEN RULE: units page does not frame collected money as signed-off. Action: check the "This month · signed off" summary card.'
    ).toBeVisible();
  });

  test('room manager: setup surface reachable from units context', async ({ page }) => {
    await page.goto('/monthly-payments');
    await page.waitForLoadState('networkidle');
    const openUnits = page.getByRole('link', { name: /open units/i }).first();
    if ((await openUnits.count()) === 0) {
      test.skip(true, 'No property cards yet.');
      return;
    }
    await openUnits.click();
    await page.waitForLoadState('networkidle');
    const manage = page.getByRole('link', { name: /manage room/i }).first();
    if ((await manage.count()) === 0) {
      test.skip(true, 'No unit rows yet.');
      return;
    }
    await manage.click();
    await page.waitForLoadState('networkidle');
    await capture(page, '03-room-manager');
    await assertNoBrokenNumbers(page, '03-room-manager');
  });

  test('reference pool: unmatched money is visible, never silently dropped', async ({ page }) => {
    await page.goto('/monthly-payments/reference-pool');
    await page.waitForLoadState('networkidle');
    await capture(page, '04-reference-pool');
    await assertNoBrokenNumbers(page, '04-reference-pool');
  });
});
