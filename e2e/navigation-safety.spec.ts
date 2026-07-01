import { test, expect, type Page } from '@playwright/test';

/**
 * Flow 12: Navigation safety
 *
 * Verifies that every page in the monthly payments workspace has:
 * - A clear path to navigate forward
 * - A clear path to navigate back
 * - A breadcrumb trail showing hierarchy
 * - No orphaned or trapped screens
 *
 * This is a cheap but important regression suite that prevents
 * operators from getting stuck or lost.
 */

interface NavigationNode {
  name: string;
  url: string;
  breadcrumbs: string[];
}

async function getCurrentPageInfo(page: Page): Promise<NavigationNode> {
  const url = page.url();
  
  // Extract readable page name
  let name = 'Unknown';
  if (url.includes('/monthly-payments/reference-pool')) name = 'Reference Pool';
  else if (url.includes('/monthly-payments/locations/')) name = 'Room Manager';
  else if (url.includes('/monthly-payments/locations')) name = 'Locations';
  else if (url.includes('/monthly-payments/[propertyId]')) name = 'Units';
  else if (url.includes('/monthly-payments')) name = 'Dashboard';
  else name = url.split('/').pop() || 'Home';

  // Extract breadcrumbs
  const breadcrumbs: string[] = [];
  const navElements = page.locator('nav a, nav span, [role="navigation"] a, [role="navigation"] span');
  const navCount = await navElements.count();
  
  for (let i = 0; i < navCount; i++) {
    const text = await navElements.nth(i).textContent();
    if (text) breadcrumbs.push(text.trim());
  }

  return { name, url, breadcrumbs };
}

test('E2E: Navigation safety — Dashboard has forward and back paths', async ({ page }) => {
  // ─── Start at dashboard ───────────────────────────────────────────
  await page.goto('/monthly-payments');
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  const dashboardInfo = await getCurrentPageInfo(page);
  console.log(`Page: ${dashboardInfo.name}`);
  console.log(`Breadcrumbs: ${dashboardInfo.breadcrumbs.join(' > ')}`);

  // ─── Dashboard should have navigation to Locations and Reference Pool
  const navToLocations = page.getByText('Locations').first();

  expect(await navToLocations.isVisible()).toBe(true);
  
  // Should have Home breadcrumb
  expect(dashboardInfo.breadcrumbs.join(' ')).toContain(/monthly|dashboard|home/i);

  // ─── Can navigate away from dashboard ────────────────────────────
  if (await navToLocations.isVisible()) {
    await navToLocations.click();
    await page.waitForURL(/locations/);
    await expect(page.url()).toContain('/locations');
  }

  // ─── Can navigate back to dashboard ──────────────────────────────
  const backToHome = page.locator('a[href="/monthly-payments"]').first();
  if (await backToHome.isVisible()) {
    await backToHome.click();
    await page.waitForURL(/monthly-payments$/);
  }

  await expect(page.getByText('Where are we this month?')).toBeVisible();
});

test('E2E: Navigation safety — Locations page has hierarchy and forward/back', async ({ page }) => {
  // ─── Navigate to locations ───────────────────────────────────────
  await page.goto('/monthly-payments/locations');
  await expect(page.getByText(/Locations/i).first()).toBeVisible();

  const locationsInfo = await getCurrentPageInfo(page);
  console.log(`Page: ${locationsInfo.name}`);
  console.log(`Breadcrumbs: ${locationsInfo.breadcrumbs.join(' > ')}`);

  // Should show hierarchy: Dashboard > Locations
  expect(locationsInfo.breadcrumbs.length).toBeGreaterThanOrEqual(1);

  // ─── Forward navigation: should be able to go to Room Manager ─────
  const manageRoomBtn = page.getByText('Manage rooms').first();
  
  if (await manageRoomBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await manageRoomBtn.click();
    await page.waitForURL(/locations\/[^/]+/);
    
    const roomManagerInfo = await getCurrentPageInfo(page);
    console.log(`Forward: ${locationsInfo.name} → ${roomManagerInfo.name}`);
    
    expect(roomManagerInfo.url).toContain('locations');
  }

  // ─── Back navigation: breadcrumb to locations ────────────────────
  const backToLocations = page.locator('a[href="/monthly-payments/locations"]').first();
  if (await backToLocations.isVisible()) {
    await backToLocations.click();
    await page.waitForURL(/locations$/);
    expect(page.url()).toContain('/locations');
  }

  // ─── Back navigation: to dashboard ───────────────────────────────
  const backToDash = page.locator('a[href="/monthly-payments"]').first();
  if (await backToDash.isVisible()) {
    await backToDash.click();
    await page.waitForURL(/monthly-payments$/);
  }

  await expect(page.getByText('Where are we this month?')).toBeVisible();
});

test('E2E: Navigation safety — Units page has full breadcrumb trail', async ({ page }) => {
  // ─── Navigate to units ───────────────────────────────────────────
  await page.goto('/monthly-payments/locations');
  
  const openLink = page.getByText('Open units').first();
  const hasUnits = await openLink.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (!hasUnits) {
    test.skip(true, 'No properties found');
    return;
  }

  await openLink.click();
  await page.waitForURL(/\/monthly-payments\/[^/]+/);
  
  const unitsInfo = await getCurrentPageInfo(page);
  console.log(`Page: ${unitsInfo.name}`);
  console.log(`Breadcrumbs: ${unitsInfo.breadcrumbs.join(' > ')}`);

  // Should have: Dashboard > Locations > Units
  expect(unitsInfo.breadcrumbs.length).toBeGreaterThanOrEqual(2);

  // ─── Every breadcrumb should be clickable (back navigation) ───────
  const breadcrumbLinks = page.locator('nav a');
  const linkCount = await breadcrumbLinks.count();

  for (let i = 0; i < linkCount; i++) {
    const link = breadcrumbLinks.nth(i);
    expect(await link.isVisible()).toBe(true);
    
    const href = await link.getAttribute('href');
    if (href) {
      console.log(`Breadcrumb link: ${href}`);
    }
  }

  // ─── Click first breadcrumb (Dashboard) to verify navigation ──────
  const dashLink = page.locator('a[href="/monthly-payments"]').first();
  if (await dashLink.isVisible()) {
    await dashLink.click();
    await page.waitForURL(/monthly-payments$/);
    
    // Should be back at dashboard
    await expect(page.getByText('Where are we this month?')).toBeVisible();
  }
});

test('E2E: Navigation safety — Room Manager page has exit paths', async ({ page }) => {
  // ─── Navigate to room manager ────────────────────────────────────
  await page.goto('/monthly-payments/locations');
  
  const manageBtn = page.getByText('Manage rooms').first();
  const hasRooms = await manageBtn.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (!hasRooms) {
    test.skip(true, 'No properties with rooms found');
    return;
  }

  await manageBtn.click();
  await page.waitForURL(/locations\/[^/]+/);

  const roomManagerInfo = await getCurrentPageInfo(page);
  console.log(`Page: ${roomManagerInfo.name}`);

  // ─── Should have exit paths ──────────────────────────────────────
  // Back to locations
  const backToLocations = page.getByText('Locations').first();
  expect(await backToLocations.isVisible()).toBe(true);

  // Open units button
  const openUnitsBtn = page.getByText('Open units').first();
  expect(await openUnitsBtn.isVisible()).toBe(true);

  // ─── Navigate back via locations link ────────────────────────────
  await backToLocations.click();
  await page.waitForURL(/locations$/);
  
  expect(page.url()).toContain('/locations');

  // ─── Navigate back to dashboard ──────────────────────────────────
  const toDash = page.locator('a[href="/monthly-payments"]').first();
  if (await toDash.isVisible()) {
    await toDash.click();
    await page.waitForURL(/monthly-payments$/);
  }

  await expect(page.getByText('Where are we this month?')).toBeVisible();
});

test('E2E: Navigation safety — Reference Pool page has exit paths', async ({ page }) => {
  // ─── Navigate to reference pool ──────────────────────────────────
  await page.goto('/monthly-payments/reference-pool');
  
  const poolVisible = await page.getByText(/Reference pool/i).isVisible({ timeout: 5000 }).catch(() => false);
  
  if (!poolVisible) {
    test.skip(true, 'Reference pool not accessible');
    return;
  }

  const poolInfo = await getCurrentPageInfo(page);
  console.log(`Page: ${poolInfo.name}`);

  // Should have navigation options
  const dashLink = page.locator('a[href="/monthly-payments"]').first();
  const locationsLink = page.locator('a[href="/monthly-payments/locations"]').first();

  // At least one exit path should exist
  const hasExit = (await dashLink.isVisible().catch(() => false)) ||
                  (await locationsLink.isVisible().catch(() => false));

  expect(hasExit).toBe(true);

  // ─── Navigate back to dashboard ──────────────────────────────────
  if (await dashLink.isVisible()) {
    await dashLink.click();
    await page.waitForURL(/monthly-payments$/);
  }

  await expect(page.getByText('Where are we this month?')).toBeVisible();
});

test('E2E: Navigation safety — Full round-trip using visible navigation only', async ({ page }) => {
  // This test uses ONLY visible navigation buttons/links to verify
  // the operator never gets stuck

  const navigationPath: string[] = [];

  // ─── Start at dashboard ───────────────────────────────────────────
  await page.goto('/monthly-payments');
  navigationPath.push('Dashboard');
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  // ─── Dashboard → Locations ──────────────────────────────────────
  let nextBtn = page.getByText('Locations').nth(0);
  if (await nextBtn.isVisible()) {
    navigationPath.push('Locations');
    await nextBtn.click();
    await page.waitForURL(/locations/);
  }

  // ─── Locations → Room Manager (if available) ────────────────────
  nextBtn = page.getByText('Manage rooms').first();
  if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    navigationPath.push('Room Manager');
    await nextBtn.click();
    await page.waitForURL(/locations\/[^/]+/);
  }

  // ─── Navigate back step by step using visible elements ──────────
  while (navigationPath.length > 1) {
    // Find a back button or parent link
    let backBtn = page.getByText('Locations').first();
    
    if (!await backBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      backBtn = page.locator('a[href="/monthly-payments"]').first();
    }

    if (await backBtn.isVisible()) {
      navigationPath.pop();
      await backBtn.click();
      await page.waitForTimeout(500);
      await page.waitForURL(/monthly-payments/);
    } else {
      break;
    }
  }

  // ─── Should end up back at dashboard ─────────────────────────────
  await expect(page.getByText('Where are we this month?')).toBeVisible();
  
  console.log(`Navigation path: ${navigationPath.join(' → ')}`);
  expect(navigationPath[navigationPath.length - 1]).toBe('Dashboard');
});
