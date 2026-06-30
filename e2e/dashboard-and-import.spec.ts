import { test, expect } from '@playwright/test';

/**
 * E2E Flow 1: Entry → Dashboard → Bank Import controls
 *
 * Single long flow that navigates the full path and exercises every
 * interactive element along the way. Screenshots are captured automatically
 * after every action by the HTML reporter.
 */

test('E2E: Entry page → Dashboard with rolling totals, month selector, import controls, and location cards', async ({ page }) => {
  // ─── Entry page ───────────────────────────────────────────────────
  await page.goto('/');
  await expect(page.getByText('Where do you want to go?')).toBeVisible();

  // Verify both app cards with their eyebrow labels
  await expect(page.getByText('Existing assistant')).toBeVisible();
  await expect(page.getByText('New view')).toBeVisible();

  // Status cards
  await expect(page.getByText('Live now')).toBeVisible();
  await expect(page.getByText('Chatbox workspace')).toBeVisible();
  await expect(page.getByText('Next build')).toBeVisible();
  await expect(page.getByText('Dashboard home')).toBeVisible();

  // Navigate to Chatbox and verify it loads
  await page.locator('a[href="/property-assistance"]').click();
  await page.waitForURL('**/property-assistance**');

  // Back to entry, then to Dashboard
  await page.goto('/');
  await page.locator('a[href="/monthly-payments"]').click();
  await page.waitForURL('**/monthly-payments**');
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  // ─── Sidebar navigation ──────────────────────────────────────────
  const sidebar = page.locator('aside');
  await expect(sidebar.getByText('Workspace')).toBeVisible();
  await expect(sidebar.getByText('Monthly Payments')).toBeVisible();

  // All four nav cards
  await expect(sidebar.getByText('Dashboard')).toBeVisible();
  await expect(sidebar.getByText('Locations')).toBeVisible();
  await expect(sidebar.getByText('Match & sign off')).toBeVisible();
  await expect(sidebar.getByText('Reference pool')).toBeVisible();

  // Quick links
  await expect(sidebar.getByText('Home')).toBeVisible();
  await expect(sidebar.getByText('Chatbox')).toBeVisible();

  // ─── Rolling total section ────────────────────────────────────────
  await expect(page.getByText(/Rolling total/i)).toBeVisible();
  await expect(page.getByText(/collected vs expected/i)).toBeVisible();

  // Currency values on page
  const amounts = page.getByText(/^R\s[\d,]+/);
  expect(await amounts.count()).toBeGreaterThan(0);

  // Expected amount text
  await expect(page.getByText(/expected$/i)).toBeVisible();

  // Occupancy stats
  await expect(page.getByText(/occupied \d+/i)).toBeVisible();
  await expect(page.getByText(/blocked \d+/i)).toBeVisible();
  await expect(page.getByText(/\d+ overdue/i)).toBeVisible();

  // ─── Month selector ──────────────────────────────────────────────
  await expect(page.getByText(/Recent months/i)).toBeVisible();

  // Month stepper ‹ / ›
  const prevStepper = page.getByRole('button').filter({ hasText: '‹' });
  const nextStepper = page.getByRole('button').filter({ hasText: '›' });
  await expect(prevStepper).toBeVisible();
  await expect(nextStepper).toBeVisible();

  // Click month cards to change selection
  const monthButtons = page.locator('button').filter({
    hasText: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/,
  });
  const monthCount = await monthButtons.count();
  expect(monthCount).toBeGreaterThanOrEqual(1);

  if (monthCount >= 2) {
    await monthButtons.first().click();
    await expect(page.getByText('●')).toBeVisible();

    await monthButtons.nth(1).click();
    await expect(page.getByText('●')).toBeVisible();
  }

  // Use stepper
  await prevStepper.click();

  // ─── Refresh button ───────────────────────────────────────────────
  const refreshBtn = page.getByRole('button', { name: /Refresh/i });
  await expect(refreshBtn).toBeVisible();
  await expect(refreshBtn).toBeEnabled();
  await refreshBtn.click();
  await expect(page.getByText('Where are we this month?')).toBeVisible();
  await expect(refreshBtn).toBeEnabled();

  // ─── Bank import controls ────────────────────────────────────────
  // Source selector
  const sourceGroup = page.locator('[role="group"][aria-label="Import source"]');
  await expect(sourceGroup).toBeVisible();

  const gmailBtn = sourceGroup.getByText('Gmail');
  const driveBtn = sourceGroup.getByText('Drive');
  const bothBtn = sourceGroup.getByText('Both');
  await expect(gmailBtn).toBeVisible();
  await expect(driveBtn).toBeVisible();
  await expect(bothBtn).toBeVisible();

  // Default: Both selected
  await expect(bothBtn).toHaveAttribute('aria-pressed', 'true');

  // Toggle through all three
  await gmailBtn.click();
  await expect(gmailBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(bothBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(driveBtn).toHaveAttribute('aria-pressed', 'false');

  await driveBtn.click();
  await expect(driveBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(gmailBtn).toHaveAttribute('aria-pressed', 'false');

  await bothBtn.click();
  await expect(bothBtn).toHaveAttribute('aria-pressed', 'true');

  // Period selector
  const periodSelect = page.locator('select');
  await expect(periodSelect).toBeVisible();
  await expect(periodSelect).toBeEnabled();

  const options = periodSelect.locator('option');
  expect(await options.count()).toBeGreaterThanOrEqual(1);

  // Pull everything toggle
  const pullCheckbox = page.getByRole('checkbox');
  await expect(pullCheckbox).toBeVisible();
  await expect(periodSelect).toBeEnabled();

  await pullCheckbox.check();
  await expect(pullCheckbox).toBeChecked();
  await expect(periodSelect).toBeDisabled();

  await pullCheckbox.uncheck();
  await expect(pullCheckbox).not.toBeChecked();
  await expect(periodSelect).toBeEnabled();

  // Import button
  const importBtn = page.getByRole('button', { name: /Import/i });
  await expect(importBtn).toBeVisible();
  await expect(importBtn).toBeEnabled();

  // Billing window label (9th-to-8th)
  await expect(page.getByText(/window:.*\d+\s\w+\s-\s\d+\s\w+/i)).toBeVisible();

  // Google Cloud integration status
  const readyBadge = page.getByText('Google Cloud ready');
  const notConfigured = page.getByText('Google Cloud not configured');
  const isReady = await readyBadge.isVisible({ timeout: 8000 }).catch(() => false);
  const isNotConfigured = await notConfigured.isVisible({ timeout: 3000 }).catch(() => false);
  expect(isReady || isNotConfigured).toBeTruthy();

  if (isNotConfigured) {
    const setupBtn = page.getByRole('button', { name: /Google Cloud setup/i });
    await expect(setupBtn).toBeVisible();
    await expect(setupBtn).toBeEnabled();
  }

  // ─── Location cards ───────────────────────────────────────────────
  await expect(page.getByText('By location')).toBeVisible();

  const card = page.locator('article').first();
  const hasCards = await card.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasCards) {
    // Paid/due badges
    await expect(card.getByText(/\d+ paid/i)).toBeVisible();
    await expect(card.getByText(/\d+ due/i)).toBeVisible();

    // Both links present
    await expect(card.getByText('Open units')).toBeVisible();
    await expect(card.getByText('Manage rooms')).toBeVisible();

    // Navigate via Manage rooms → verify room manager loads
    await card.getByText('Manage rooms').click();
    await page.waitForURL(/\/monthly-payments\/locations\/[^/]+/);
    await expect(page.getByText(/room manager/i)).toBeVisible();

    // Back to dashboard → Open units → verify units table loads
    await page.goto('/monthly-payments');
    await page.locator('article').first().getByText('Open units').click();
    await page.waitForURL(/\/monthly-payments\/[^/]+/);
    await expect(page.getByText(/core view/i)).toBeVisible();
  }

  // ─── Reference pool banner ────────────────────────────────────────
  await page.goto('/monthly-payments');
  const poolBanner = page.getByText(/Reference pool.*unmatched deposits/i);
  await expect(poolBanner.first()).toBeVisible();
  await expect(page.getByText('live')).toBeVisible();

  const openTableBtn = page.getByText('Open unit table');
  await expect(openTableBtn).toBeVisible();
  await openTableBtn.click();
  await page.waitForURL(/\/monthly-payments\/.+/);

  // ─── Sidebar navigation round-trip ────────────────────────────────
  await page.goto('/monthly-payments');
  await sidebar.locator('a[href="/monthly-payments/locations"]').click();
  await page.waitForURL('**/monthly-payments/locations**');

  await sidebar.locator('a[href*="reference-pool"]').click();
  await page.waitForURL('**/reference-pool**');
  await expect(page.getByText(/Reference pool/i).first()).toBeVisible();

  await sidebar.locator('a[href="/monthly-payments"]').click();
  await page.waitForURL(/\/monthly-payments$/);
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  // Quick link: Home
  await sidebar.getByText('Home').click();
  await page.waitForURL(/\/$/);
  await expect(page.getByText('Where do you want to go?')).toBeVisible();
});
