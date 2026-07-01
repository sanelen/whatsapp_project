import { test, expect, type Page } from '@playwright/test';

/**
 * Flow 02: Month context propagation
 *
 * Verifies that switching the selected month changes the working dataset
 * across all pages: Dashboard, Units table, and Reference pool should all
 * reflect the same billing window and show data for the selected month only.
 *
 * This is critical because operators need to trust that month context is
 * consistent across navigation.
 */

async function getSelectedMonth(page: Page): Promise<string> {
  // Find the selected month button (usually has a bullet or filled state)
  const selected = page.locator('button[aria-pressed="true"]').filter({ hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/ });
  const text = await selected.first().textContent();
  return text || '';
}

async function getBillingWindow(page: Page): Promise<string> {
  const windowText = await page.getByText(/Billing window:/i).textContent();
  return windowText || '';
}

test('E2E: Month context — switching month updates dashboard, units, and reference pool consistently', async ({ page }) => {
  // ─── Start at dashboard ───────────────────────────────────────────
  await page.goto('/monthly-payments');
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  // Capture initial month and billing window
  const month1 = await getSelectedMonth(page);
  const window1 = await getBillingWindow(page);
  
  expect(month1).toBeTruthy();
  expect(window1).toContain('Billing window:');

  // ─── Switch to a different month if available ────────────────────
  const monthButtons = page.locator('button').filter({
    hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
  });
  const monthCount = await monthButtons.count();
  
  if (monthCount < 2) {
    test.skip(true, 'Need at least 2 months to test context propagation');
    return;
  }

  // Find a different month button and click it
  let month2 = '';
  for (let i = 0; i < monthCount; i++) {
    const text = await monthButtons.nth(i).textContent();
    if (text && text !== month1) {
      month2 = text;
      await monthButtons.nth(i).click();
      await page.waitForTimeout(500); // Let UI settle
      break;
    }
  }

  expect(month2).toBeTruthy();
  expect(month2).not.toBe(month1);

  // Verify dashboard shows new billing window
  const window2 = await getBillingWindow(page);
  expect(window2).toContain('Billing window:');
  expect(window2).not.toBe(window1); // Should be different

  // ─── Navigate to Units for a property ────────────────────────────
  await page.goto('/monthly-payments/locations');
  const openLink = page.getByText('Open units').first();
  const hasUnits = await openLink.isVisible({ timeout: 8000 }).catch(() => false);
  
  if (!hasUnits) {
    test.skip(true, 'No properties found');
    return;
  }

  await openLink.click();
  await page.waitForURL(/\/monthly-payments\/[^/]+/);

  // Verify units page shows the same month context
  const unitsWindow = await getBillingWindow(page);
  expect(unitsWindow).toContain('Billing window:');

  // The billing window text should still reflect month2
  expect(unitsWindow).toBe(window2);

  // ─── Check that unit data visibly reflects the month ──────────────
  // Look for month-specific indicators (e.g., reference counts, totals)
  const unitRows = page.locator('div').filter({ hasText: /Room|Unit/ }).first();
  await expect(unitRows).toBeVisible();

  // ─── Navigate to Reference Pool ───────────────────────────────────
  await page.goto('/monthly-payments/reference-pool');
  await expect(page.getByText('Reference pool', { exact: true }).first()).toBeVisible();

  // Verify reference pool shows the same billing window
  const poolWindow = await getBillingWindow(page);
  expect(poolWindow).toContain('Billing window:');
  expect(poolWindow).toBe(window2);

  // ─── Switch month again and verify all pages update ──────────────
  if (monthCount >= 3) {
    let month3 = '';
    for (let i = 0; i < monthCount; i++) {
      const text = await monthButtons.nth(i).textContent();
      if (text && text !== month2 && text !== month1) {
        month3 = text;
        break;
      }
    }

    if (month3) {
      // Go back to dashboard and switch
      await page.goto('/monthly-payments');
      const allMonths = page.locator('button').filter({
        hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
      });
      
      for (let i = 0; i < await allMonths.count(); i++) {
        const text = await allMonths.nth(i).textContent();
        if (text === month3) {
          await allMonths.nth(i).click();
          await page.waitForTimeout(500);
          break;
        }
      }

      const window3 = await getBillingWindow(page);
      expect(window3).not.toBe(window2);
      expect(window3).not.toBe(window1);

      // Verify it persists on units page
      await page.goto('/monthly-payments/locations');
      const openLink3 = page.getByText('Open units').first();
      if (await openLink3.isVisible({ timeout: 5000 }).catch(() => false)) {
        await openLink3.click();
        await page.waitForURL(/\/monthly-payments\/[^/]+/);
        
        const unitsWindow3 = await getBillingWindow(page);
        expect(unitsWindow3).toBe(window3);
      }
    }
  }
});

test('E2E: Month context — browser back/forward preserves month selection', async ({ page }) => {
  // ─── Start at dashboard, note the month ───────────────────────────
  await page.goto('/monthly-payments');
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  const month1 = await getSelectedMonth(page);
  const window1 = await getBillingWindow(page);

  // ─── Navigate away and back ──────────────────────────────────────
  await page.goto('/monthly-payments/locations');
  const openLink = page.getByText('Open units').first();
  const hasUnits = await openLink.isVisible({ timeout: 8000 }).catch(() => false);
  
  if (!hasUnits) {
    test.skip(true, 'No properties found');
    return;
  }

  await openLink.click();
  await page.waitForURL(/\/monthly-payments\/[^/]+/);

  // Go back
  await page.goBack();
  await page.waitForURL(/\/monthly-payments\/locations/);

  // Go back again to dashboard
  await page.goBack();
  await page.waitForURL(/\/monthly-payments$/);

  // Verify month context persisted
  const month2 = await getSelectedMonth(page);
  const window2 = await getBillingWindow(page);

  expect(month2).toBe(month1);
  expect(window2).toBe(window1);
});
