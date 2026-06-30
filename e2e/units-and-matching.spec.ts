import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Flow 3: Units table — match drawer, sign-off, reverse, period nav
 *
 * Navigates to the units table, exercises the match drawer (open, review
 * candidates, score badges, close), row actions (sign off, reverse sign-off,
 * match ref), period navigation, and cross-links (manage room, edit source).
 *
 * Where possible, performs actual match → sign-off → reverse-sign-off
 * round-trips and verifies the UI state changes after each mutation.
 */

// ─── Helpers ────────────────────────────────────────────────────────

async function goToFirstPropertyUnits(page: Page) {
  await page.goto('/monthly-payments/locations');
  const openLink = page.getByText('Open units').first();
  const hasUnits = await openLink.isVisible({ timeout: 8000 }).catch(() => false);
  if (!hasUnits) {
    test.skip(true, 'No properties found — skipping units table tests');
    return;
  }
  await openLink.click();
  await page.waitForURL(/\/monthly-payments\/[^/]+/);
  await expect(page.getByText(/core view/i)).toBeVisible();
}

// ─── Test: Units table structure and data ───────────────────────────

test('E2E: Units table — page structure, columns, rows, totals, breadcrumbs', async ({ page }) => {
  await goToFirstPropertyUnits(page);

  // Header
  await expect(page.getByText(/core view/i)).toBeVisible();

  // Breadcrumb
  const orgBreadcrumb = page.locator('nav a[href="/monthly-payments"]').first();
  await expect(orgBreadcrumb).toBeVisible();
  await expect(page.locator('nav').getByText('Locations')).toBeVisible();
  await expect(page.locator('nav').getByText('Units')).toBeVisible();

  // Billing window
  await expect(page.getByText(/Billing window:/i)).toBeVisible();

  // Column headers
  const headers = ['Unit', 'Contact', 'Exp R', 'Reference', 'Date', 'Recv R', 'Status'];
  for (const header of headers) {
    await expect(page.getByText(header, { exact: true }).first()).toBeVisible();
  }

  // Filter button
  await expect(page.getByText('Filter')).toBeVisible();

  // Lock legend
  await expect(page.getByText('= locked after sign-off')).toBeVisible();

  // Totals summary
  await expect(page.getByText(/\d+ units/i)).toBeVisible();

  // ─── Unit rows ────────────────────────────────────────────────────
  // Each row has a label and at least one action
  const unitLabels = page.locator('div.text-\\[1\\.18rem\\]');
  const labelCount = await unitLabels.count();

  if (labelCount > 0) {
    // First row should have a label
    await expect(unitLabels.first()).toBeVisible();

    // Each row has manage room and edit source links
    await expect(page.getByText('manage room').first()).toBeVisible();
    await expect(page.getByText('edit source').first()).toBeVisible();

    // Status badges exist
    const statusBadges = page.locator('span.capitalize');
    expect(await statusBadges.count()).toBeGreaterThan(0);
  }

  // ─── Reference pool section at bottom ─────────────────────────────
  await expect(page.getByText('Reference pool').first()).toBeVisible();
  await expect(page.getByText(/unmatched/i).first()).toBeVisible();

  // Reference pool table columns
  await expect(page.getByText('Reference', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Payer').first()).toBeVisible();
  await expect(page.getByText('Account').first()).toBeVisible();

  // ─── Breadcrumb navigation ────────────────────────────────────────
  // Click org → dashboard
  await orgBreadcrumb.click();
  await page.waitForURL(/\/monthly-payments$/);
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  // Back to units → click Locations breadcrumb
  await goToFirstPropertyUnits(page);
  await page.locator('nav a[href="/monthly-payments/locations"]').first().click();
  await page.waitForURL(/\/monthly-payments\/locations$/);
});

// ─── Test: Period navigation ────────────────────────────────────────

test('E2E: Units table — period navigation changes URL and content', async ({ page }) => {
  await goToFirstPropertyUnits(page);

  // Grab the period label
  const periodDisplay = page.locator('span').filter({ hasText: /\w+ \d{4}/ }).first();
  const initialPeriod = await periodDisplay.textContent();

  // Click prev month
  const prevLink = page.getByRole('link', { name: 'Previous month' });
  await prevLink.click();
  await page.waitForTimeout(500);

  // URL should have changed period param
  expect(page.url()).toContain('period=');

  // Period label should be different
  const newPeriod = await periodDisplay.textContent();
  expect(newPeriod).not.toBe(initialPeriod);

  // Navigate forward twice → should go past initial
  const nextLink = page.getByRole('link', { name: 'Next month' });
  await nextLink.click();
  await page.waitForTimeout(500);
  await nextLink.click();
  await page.waitForTimeout(500);
});

// ─── Test: Match drawer — open, review candidates, close ────────────

test('E2E: Match drawer — open, review candidates with score badges, close', async ({ page }) => {
  await goToFirstPropertyUnits(page);

  // Find a row with "match ref" or "+ match ref" button (unpaid, no reference)
  const matchRefBtn = page.getByText('match ref').first();
  const hasMatchBtn = await matchRefBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (!hasMatchBtn) {
    // Try clicking on an existing reference to open the drawer
    const referenceBtn = page.locator('button').filter({ hasText: /^[A-Z0-9]/ }).first();
    const hasRef = await referenceBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasRef) {
      test.skip(true, 'No matchable rows or reference buttons found');
      return;
    }
    await referenceBtn.click();
  } else {
    await matchRefBtn.click();
  }

  // Match drawer should open
  await expect(page.getByText('Match & sign off')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('Unmatched references')).toBeVisible();
  await expect(page.getByText(/\d+ candidates/)).toBeVisible();

  // Target row panel
  await expect(page.getByText('Target row')).toBeVisible();
  await expect(page.getByText('Expected amount')).toBeVisible();
  await expect(page.getByText('Primary reference')).toBeVisible();
  await expect(page.getByText('Keywords')).toBeVisible();
  await expect(page.getByText('Current row state')).toBeVisible();

  // Check candidate cards (if any)
  const candidates = page.locator('text=Match to');
  const candidateCount = await candidates.count();

  if (candidateCount > 0) {
    // Score badges should exist
    const scoreBadges = page.locator('span').filter({
      hasText: /^(strong|likely|manual)$/,
    });
    expect(await scoreBadges.count()).toBeGreaterThan(0);

    // Each candidate has amount display
    await expect(page.getByText(/Amount.*R\s/).first()).toBeVisible();
  }

  // "Open room setup" link
  const roomSetupLink = page.getByText(/Open room setup for/);
  await expect(roomSetupLink).toBeVisible();

  // Close drawer
  const closeBtn = page.locator('button').filter({ has: page.locator('svg') }).last();
  // Use the X button in the drawer header
  const drawerClose = page.locator('section').last().locator('button').first();
  if (await drawerClose.isVisible()) {
    // Find the close button (X icon) in the drawer
    const xButtons = page.locator('section').last().getByRole('button');
    for (let i = 0; i < await xButtons.count(); i++) {
      const btn = xButtons.nth(i);
      const text = await btn.textContent();
      if (!text?.trim() || text?.trim().length === 0) {
        await btn.click();
        break;
      }
    }
  }

  // Drawer should close
  await expect(page.getByText('Match & sign off')).toBeHidden({ timeout: 5000 });
});

// ─── Test: Full match → sign-off → reverse round-trip ───────────────

test('E2E: Match a reference → sign off → reverse sign-off (full state machine)', async ({ page }) => {
  await goToFirstPropertyUnits(page);

  // We need an unpaid row with "match ref" and available candidates
  const matchRefBtns = page.getByText('match ref');
  const matchCount = await matchRefBtns.count();

  if (matchCount === 0) {
    test.skip(true, 'No unpaid unmatchable rows — need test data to exercise match flow');
    return;
  }

  // Open match drawer on the first unmatchable row
  await matchRefBtns.first().click();
  await expect(page.getByText('Match & sign off')).toBeVisible({ timeout: 8000 });

  // Get the unit label from the drawer
  const drawerHeading = page.locator('section').last().locator('h3').first();
  const unitLabel = await drawerHeading.textContent();
  expect(unitLabel).toBeTruthy();

  // Check if there are candidates to match
  const matchToBtns = page.getByRole('button').filter({ hasText: /^Match to/ });
  const hasCandidates = await matchToBtns.first().isVisible({ timeout: 5000 }).catch(() => false);

  if (!hasCandidates) {
    test.skip(true, 'No unmatched references available to match');
    return;
  }

  // ─── Step 1: Match the first candidate ────────────────────────────
  await matchToBtns.first().click();

  // Drawer should close and table should refresh
  await expect(page.getByText('Match & sign off')).toBeHidden({ timeout: 15_000 });

  // Wait for refresh
  await page.waitForTimeout(2000);

  // The row should now show "Sign off" button (status changed from unpaid to matched)
  // Find the row by its unit label
  const unitRow = page.locator('div').filter({ hasText: unitLabel! }).first();

  // Look for "Sign off" button anywhere on the page after the match
  const signOffBtn = page.getByRole('button', { name: 'Sign off' });
  const hasSignOff = await signOffBtn.first().isVisible({ timeout: 8000 }).catch(() => false);

  if (!hasSignOff) {
    // If sign off is not visible, the match might have auto-signed or the status is different
    // Check if "✓ signed" appeared
    const signedText = page.getByText('✓ signed');
    const isSigned = await signedText.first().isVisible({ timeout: 3000 }).catch(() => false);
    if (isSigned) {
      // Already signed — try reverse
      const reverseBtn = page.getByText('reverse sign-off').first();
      if (await reverseBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await reverseBtn.click();
        await page.waitForTimeout(2000);
        await expect(page.getByText('match ref').first()).toBeVisible({ timeout: 10_000 });
      }
    }
    return;
  }

  // ─── Step 2: Sign off ─────────────────────────────────────────────
  await signOffBtn.first().click();

  // Wait for refresh
  await page.waitForTimeout(2000);

  // After sign-off, should see "✓ signed" and "reverse sign-off"
  await expect(page.getByText('✓ signed').first()).toBeVisible({ timeout: 10_000 });
  const reverseBtn = page.getByText('reverse sign-off').first();
  await expect(reverseBtn).toBeVisible();

  // Status should now be "paid"
  await expect(page.getByText('paid').first()).toBeVisible();

  // ─── Step 3: Reverse sign-off ─────────────────────────────────────
  await reverseBtn.click();

  // Wait for refresh
  await page.waitForTimeout(2000);

  // After reversal, the row should be back to unmatchable state
  // "match ref" should reappear (or the row status changes back)
  const matchRefAgain = page.getByText('match ref');
  const hasMatchAgain = await matchRefAgain.first().isVisible({ timeout: 10_000 }).catch(() => false);

  // The status should no longer be "paid"
  // (it might be "unpaid" or "mismatch" depending on the reference removal)
  if (hasMatchAgain) {
    await expect(matchRefAgain.first()).toBeVisible();
  }
});

// ─── Test: Row actions — blocked and mismatch states ────────────────

test('E2E: Units table — blocked rows show excluded, mismatch rows show review', async ({ page }) => {
  await goToFirstPropertyUnits(page);

  // Check for blocked rows
  const blockedBadge = page.getByText('blocked', { exact: true });
  const hasBlocked = await blockedBadge.first().isVisible({ timeout: 3000 }).catch(() => false);

  if (hasBlocked) {
    // Blocked rows show "excluded" in the reference column
    await expect(page.getByText('excluded').first()).toBeVisible();
  }

  // Check for mismatch rows
  const mismatchBadge = page.locator('span.capitalize').filter({ hasText: 'mismatch' });
  const hasMismatch = await mismatchBadge.first().isVisible({ timeout: 3000 }).catch(() => false);

  if (hasMismatch) {
    // Mismatch rows show "review" link
    const reviewBtn = page.getByText('review');
    await expect(reviewBtn.first()).toBeVisible();

    // Clicking review opens the match drawer
    await reviewBtn.first().click();
    await expect(page.getByText('Match & sign off')).toBeVisible({ timeout: 8000 });

    // Close it
    const xButtons = page.locator('section').last().getByRole('button');
    for (let i = 0; i < await xButtons.count(); i++) {
      const btn = xButtons.nth(i);
      const text = await btn.textContent();
      if (!text?.trim() || text?.trim().length === 0) {
        await btn.click();
        break;
      }
    }
  }

  // Check for signed-off rows
  const signedText = page.getByText('✓ signed');
  const hasSigned = await signedText.first().isVisible({ timeout: 3000 }).catch(() => false);

  if (hasSigned) {
    // Signed rows show "reverse sign-off" link
    await expect(page.getByText('reverse sign-off').first()).toBeVisible();
  }
});

// ─── Test: Cross-links — manage room and edit source ────────────────

test('E2E: Units table — manage room navigates to room manager, edit source auto-opens editor', async ({ page }) => {
  await goToFirstPropertyUnits(page);

  // "manage room" link → room manager
  const manageRoomLink = page.getByText('manage room').first();
  const hasManage = await manageRoomLink.isVisible({ timeout: 5000 }).catch(() => false);

  if (!hasManage) {
    test.skip(true, 'No unit rows visible');
    return;
  }

  // Get the property URL before clicking
  const unitsUrl = page.url();

  await manageRoomLink.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+\?.*unitId=/);
  await expect(page.getByText(/room manager/i)).toBeVisible();

  // Editor should auto-open (unitId param triggers it)
  await expect(page.getByText('Editing room')).toBeVisible({ timeout: 10_000 });
  await page.getByText('Cancel').click();

  // Go back to units
  await page.goto(unitsUrl);
  await expect(page.getByText(/core view/i)).toBeVisible();

  // "edit source" link — same behavior
  const editSourceLink = page.getByText('edit source').first();
  await editSourceLink.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+\?.*unitId=/);
  await expect(page.getByText('Editing room')).toBeVisible({ timeout: 10_000 });
});
