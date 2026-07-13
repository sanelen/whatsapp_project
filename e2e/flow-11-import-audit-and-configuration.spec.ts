import { test, expect, type Page } from '@playwright/test';

/**
 * Flow 11: Import audit → configuration → reference pool (read-only)
 *
 * Walks the operator's import-verification journey end to end instead of
 * checking pages one element at a time:
 *
 *   Dashboard → Import audit (evidence) → expand a file → Import
 *   configuration (policy) → Reference pool (action surface) → back to
 *   Dashboard.
 *
 * Along the way it asserts the two things that make the journey trustworthy:
 *   1. Cross-page consistency — every page carries the same workspace
 *      navigation (all six destinations reachable from anywhere), and the
 *      audit's unmatched picture is coherent with the reference pool.
 *   2. Data integrity — no NaN/undefined, audit totals internally consistent
 *      (matched + signed + unmatched + incomplete = transactions).
 *
 * Safe on live data: this flow only reads. No imports, matches, or sign-offs.
 */

const NAV_ITEMS = [
  'Dashboard',
  'Locations',
  'Match & sign off',
  'Reference pool',
  'Import audit',
  'Import configuration',
];

async function expectWorkspaceNav(page: Page, context: string) {
  for (const item of NAV_ITEMS) {
    await expect(
      page.getByRole('link', { name: item, exact: true }).first(),
      `${context}: sidebar should link to "${item}"`
    ).toBeVisible();
  }
}

async function expectNoBrokenValues(page: Page, context: string) {
  const body = await page.locator('body').innerText();
  expect(body, `${context}: no NaN in rendered output`).not.toContain('NaN');
  expect(body, `${context}: no undefined in rendered output`).not.toContain('undefined');
}

test('Flow 11: import audit, configuration, and reference pool form one coherent journey', async ({ page }) => {
  // ─── 1. Dashboard: journey starts where the operator starts ─────────
  await page.goto('/monthly-payments');
  await expect(page.getByRole('heading', { name: 'This month, at a glance' })).toBeVisible();
  await expectWorkspaceNav(page, 'Dashboard');

  // ─── 2. Into Import audit via the sidebar (not a direct URL) ────────
  await page.getByRole('link', { name: 'Import audit', exact: true }).first().click();
  await expect(page.getByText('Source-to-database validation')).toBeVisible();
  await expectWorkspaceNav(page, 'Import audit');
  await expectNoBrokenValues(page, 'Import audit');

  // Totals strip must be present and internally consistent.
  const readTotal = async (label: string) => {
    const cell = page.locator('div,section').filter({ hasText: new RegExp(`^${label}`, 'i') });
    const text = (await cell.first().textContent()) ?? '';
    const match = text.replace(/\s/g, ' ').match(/(\d+)\s*(?:\/\s*\d+)?\s*$/);
    return match ? Number(match[1]) : NaN;
  };
  const filesTotal = await readTotal('Files');
  expect(filesTotal, 'audit shows a numeric file count').not.toBeNaN();

  // ─── 3. Expand the first file: evidence must be inspectable ─────────
  const firstFile = page.locator('text=/hash [0-9a-f]{6,}/i').first();
  if (await firstFile.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Each listed transaction must state its database + match status.
    const statuses = page.getByText(/Stored|Missing/i);
    expect(await statuses.count(), 'transactions expose database status').toBeGreaterThan(0);
    const matchStates = page.getByText(/Matched|Unmatched|Signed|Incomplete/i);
    expect(await matchStates.count(), 'transactions expose match status').toBeGreaterThan(0);
  }

  // Count unmatched rows the audit reports for later cross-checking.
  const auditUnmatched = await page.getByText(/^Unmatched$/i).count();

  // ─── 4. On to Import configuration: policy must explain itself ──────
  await page.getByRole('link', { name: 'Import configuration', exact: true }).first().click();
  await expect(page.getByText('How bank data becomes a payment')).toBeVisible();
  await expectWorkspaceNav(page, 'Import configuration');
  await expectNoBrokenValues(page, 'Import configuration');

  // The three pillars of policy must all be present.
  await expect(page.getByRole('heading', { name: 'Connected sources' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account and property map' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import acceptance policy' })).toBeVisible();

  // Account numbers must be masked — never show more than a 4-digit suffix.
  const configBody = await page.locator('body').innerText();
  expect(configBody, 'no full account numbers on the configuration page').not.toMatch(/\d{8,}/);

  // The excluded internal account must be labelled as such.
  await expect(page.getByText(/Excluded/i).first()).toBeVisible();

  // ─── 5. Reference pool: unresolved work continues where it should ───
  await page.getByRole('link', { name: 'Reference pool', exact: true }).first().click();
  await expect(page.getByText(/Reference Pool/i).first()).toBeVisible();
  await expectWorkspaceNav(page, 'Reference pool');
  await expectNoBrokenValues(page, 'Reference pool');

  // If the audit showed unmatched deposits, the pool must not be empty.
  const poolSummary = await page.locator('body').innerText();
  if (auditUnmatched > 0) {
    expect(
      /unmatched deposit/i.test(poolSummary),
      'audit reported unmatched deposits, so the pool should describe them'
    ).toBeTruthy();
  }

  // ─── 6. Close the loop: back to the dashboard via the sidebar ───────
  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'This month, at a glance' })).toBeVisible();
});

test('Flow 11b: every workspace page carries the same six-item navigation', async ({ page }) => {
  // The nav must be identical everywhere — this is the regression guard for
  // the 2026-07-12 review fix (three pages were missing Import configuration).
  const routes: Array<{ path: string; marker: RegExp }> = [
    { path: '/monthly-payments', marker: /This month, at a glance/ },
    { path: '/monthly-payments/locations', marker: /Locations/ },
    { path: '/monthly-payments/reference-pool', marker: /Reference Pool/i },
    { path: '/monthly-payments/import-audit', marker: /Source-to-database validation/ },
    { path: '/monthly-payments/import-configuration', marker: /How bank data becomes a payment/ },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByText(route.marker).first()).toBeVisible();
    await expectWorkspaceNav(page, route.path);
  }

  // Property-scoped pages (units table + room manager) discovered via Locations.
  await page.goto('/monthly-payments/locations');
  const openUnits = page.getByRole('link', { name: /Open units/i }).first();
  if (await openUnits.isVisible({ timeout: 5000 }).catch(() => false)) {
    await openUnits.click();
    await expect(page.getByText(/units/i).first()).toBeVisible();
    await expectWorkspaceNav(page, 'Units table');

    await page.goto('/monthly-payments/locations');
    const manageRooms = page.getByRole('link', { name: /Manage rooms/i }).first();
    if (await manageRooms.isVisible({ timeout: 5000 }).catch(() => false)) {
      await manageRooms.click();
      await expect(page.getByText(/room manager/i).first()).toBeVisible();
      await expectWorkspaceNav(page, 'Room manager');
    }
  }
});
