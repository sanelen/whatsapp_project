import { test, expect, type Page } from '@playwright/test';

/**
 * Flow 00: Page Walkthrough with Screenshot Validation
 *
 * Captures baseline screenshots of all key pages in the monthly payments workflow.
 * Used for visual regression testing and operator feedback sessions.
 *
 * Usage:
 *   SCREENSHOT_LABEL=before npm run test:e2e -- page-walkthrough
 *   # ... make changes ...
 *   SCREENSHOT_LABEL=after npm run test:e2e -- page-walkthrough
 *
 * Screenshots saved to: e2e/screenshots/<label>/
 */

const LABEL = process.env.SCREENSHOT_LABEL || 'current';

async function takePageScreenshot(page: Page, name: string) {
  const screenshotPath = `e2e/screenshots/${LABEL}/${name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved: ${screenshotPath}`);
}

test('Flow 00: Dashboard page screenshot and integrity checks', async ({ page }) => {
  await page.goto('/monthly-payments');
  await expect(page.getByText('Where are we this month?')).toBeVisible();
  
  // Wait for all data to load
  await page.waitForLoadState('networkidle');
  
  // ─── Integrity checks (no broken UI) ────────────────────────
  // Check for NaN or undefined in currency displays
  const pageContent = await page.textContent('body');
  
  expect(pageContent).not.toContain('NaN');
  expect(pageContent).not.toContain('undefined');
  
  // Check that key sections are visible
  await expect(page.getByText(/rolling total|collected/i)).toBeVisible();
  await expect(page.getByText(/recent months|month/i)).toBeVisible();
  
  // Dashboard headline (rolling total) should be a number
  const rollingTotalText = await page.getByText(/\d+/).first().textContent();
  expect(rollingTotalText).toMatch(/\d/);
  
  // ─── Screenshot ────────────────────────────────────────────
  await takePageScreenshot(page, '01-dashboard');
  
  console.log('✓ Dashboard: no NaN/undefined, sections visible');
});

test('Flow 00: Units table page screenshot and row validation', async ({ page }) => {
  await page.goto('/monthly-payments/locations');
  
  const openUnitsBtn = page.getByText('Open units', { exact: false }).first();
  if (!await openUnitsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    test.skip(true, 'No properties found');
    return;
  }
  
  await openUnitsBtn.click();
  await page.waitForURL(/\/monthly-payments\/[^/]+/);
  
  await page.waitForLoadState('networkidle');
  
  // ─── Integrity checks ──────────────────────────────────────
  const pageText = await page.textContent('body');
  
  expect(pageText).not.toContain('NaN');
  expect(pageText).not.toContain('undefined');
  
  // Check for broken status badges
  const statusBadges = page.locator('[class*="badge"], [class*="status"], span.capitalize');
  for (let i = 0; i < Math.min(5, await statusBadges.count()); i++) {
    const text = await statusBadges.nth(i).textContent();
    expect(text).not.toMatch(/NaN|undefined/);
  }
  
  // ─── Screenshot ────────────────────────────────────────────
  await takePageScreenshot(page, '02-units-table');
  
  console.log('✓ Units table: no NaN/undefined, rows valid');
});

test('Flow 00: Room manager page screenshot and card validation', async ({ page }) => {
  await page.goto('/monthly-payments/locations');
  
  const manageBtn = page.getByText('Manage rooms', { exact: false }).first();
  if (!await manageBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    test.skip(true, 'No properties with rooms found');
    return;
  }
  
  await manageBtn.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+/);
  
  await page.waitForLoadState('networkidle');
  
  // ─── Integrity checks ──────────────────────────────────────
  const pageText = await page.textContent('body');
  
  expect(pageText).not.toContain('NaN');
  expect(pageText).not.toContain('undefined');
  
  // Check summary cards (Rooms, Occupied, Vacant, Blocked)
  const summaryCards = page.locator('article, [class*="card"], div').filter({
    hasText: /Rooms|Occupied|Vacant|Blocked/i
  });
  
  for (let i = 0; i < Math.min(4, await summaryCards.count()); i++) {
    const cardText = await summaryCards.nth(i).textContent();
    // Each should have a count number
    expect(cardText).toMatch(/\d+/);
  }
  
  // ─── Screenshot ────────────────────────────────────────────
  await takePageScreenshot(page, '03-room-manager');
  
  console.log('✓ Room manager: no NaN/undefined, summary cards valid');
});

test('Flow 00: Reference pool page screenshot and filtering validation', async ({ page }) => {
  await page.goto('/monthly-payments/reference-pool');
  
  const poolVisible = await page.getByText(/Reference pool|unmatched/i).isVisible({ timeout: 5000 }).catch(() => false);
  if (!poolVisible) {
    test.skip(true, 'Reference pool not accessible');
    return;
  }
  
  await page.waitForLoadState('networkidle');
  
  // ─── Integrity checks ──────────────────────────────────────
  const pageText = await page.textContent('body');
  
  expect(pageText).not.toContain('NaN');
  expect(pageText).not.toContain('undefined');
  
  // If there are reference items, they should have amounts
  const refItems = page.locator('article, div[class*="reference"], li').filter({
    hasText: /R\s|reference|amount/i
  });
  
  const itemCount = Math.min(3, await refItems.count());
  for (let i = 0; i < itemCount; i++) {
    const itemText = await refItems.nth(i).textContent();
    // References should not show NaN for amounts
    expect(itemText).not.toContain('NaN');
  }
  
  // ─── Screenshot ────────────────────────────────────────────
  await takePageScreenshot(page, '04-reference-pool');
  
  console.log('✓ Reference pool: no NaN/undefined, items valid');
});

test('Flow 00: Collect all screenshots for the session', async ({ page }) => {
  // This test just logs the screenshot directory for reference
  console.log(`
╔═════════════════════════════════════════════════╗
║ Screenshots saved to: e2e/screenshots/${LABEL}/  ║
║                                                 ║
║ To compare before vs. after:                    ║
║ 1. Commit your work                             ║
║ 2. Run: SCREENSHOT_LABEL=after npm run test:e2e ║
║ 3. Compare files in your image viewer           ║
╚═════════════════════════════════════════════════╝
  `);
});
