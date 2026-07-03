import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Flow 2: Room Manager — full CRUD round-trip
 *
 * Opens the room manager, edits a room (label, rent, reference, names,
 * occupancy, match rules), saves, then verifies the saved values appear
 * in the refreshed UI AND re-opens the editor to confirm the DB persisted.
 *
 * Also covers: summary cards, navigation, breadcrumbs, auto-open via unitId,
 * locations admin page, and reference pool page.
 */

// ─── Helpers ────────────────────────────────────────────────────────

async function goToLocations(page: Page) {
  await page.goto('/monthly-payments/locations');
  await expect(page.getByText(/Locations/i).first()).toBeVisible();
}

async function goToFirstPropertyRoomManager(page: Page) {
  await goToLocations(page);
  const manageLink = page.getByText('Manage rooms').first();
  const hasRooms = await manageLink.isVisible({ timeout: 8000 }).catch(() => false);
  if (!hasRooms) {
    test.skip(true, 'No properties with rooms found — skipping room manager tests');
    return;
  }
  await manageLink.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+/);
  await expect(page.getByText(/room manager/i)).toBeVisible();
}

/** Generate a unique-ish suffix so edits don't collide across runs */
function stamp() {
  return `E2E-${Date.now().toString(36).slice(-5)}`;
}

// ─── Test: Room Manager structure & summary cards ───────────────────

test('E2E: Room manager — structure, summary cards, navigation, breadcrumbs', async ({ page }) => {
  await goToFirstPropertyRoomManager(page);

  // Breadcrumb chain
  await expect(page.locator('nav').getByText('Locations')).toBeVisible();
  await expect(page.locator('nav').getByText('Rooms')).toBeVisible();

  // Summary cards
  const summaryLabels = ['Rooms', 'Occupied', 'Vacant', 'Blocked'];
  for (const label of summaryLabels) {
    const card = page.locator('p').filter({ hasText: label }).first();
    await expect(card).toBeVisible();
    // Each card has a number value
    const number = card.locator('..').locator('p').nth(1);
    await expect(number).toBeVisible();
  }

  // Navigation buttons
  await expect(page.getByText('Locations').first()).toBeVisible();
  await expect(page.getByText('Open units')).toBeVisible();

  // Room cards present
  const roomCards = page.locator('article');
  expect(await roomCards.count()).toBeGreaterThan(0);

  // First room row structure
  const firstCard = roomCards.first();
  await expect(firstCard.locator('h2').first()).toBeVisible(); // room label
  await expect(page.getByPlaceholder('Search room, name, surname, or reference...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'All' })).toBeVisible();

  // Compact row fields
  await expect(firstCard.getByText(/occupied|on market|blocked/i).first()).toBeVisible();
  await expect(firstCard.getByText(/^R\s/).first()).toBeVisible();

  // Expanding a row opens the inline editor from the redesign.
  await firstCard.locator('button').first().click();
  await expect(page.getByLabel('Room label')).toBeVisible();
  await expect(page.getByText('Match rules')).toBeVisible();
  await expect(page.getByText('Save room')).toBeVisible();

  // ─── Breadcrumb navigation ────────────────────────────────────────
  // Click org name → goes to dashboard
  const orgLink = page.locator('nav a[href="/monthly-payments"]').first();
  await orgLink.click();
  await page.waitForURL(/\/monthly-payments$/);
  await expect(page.getByText('Where are we this month?')).toBeVisible();

  // Back to room manager → click Locations breadcrumb
  await goToFirstPropertyRoomManager(page);
  const locLink = page.locator('nav a[href="/monthly-payments/locations"]').first();
  await locLink.click();
  await page.waitForURL(/\/monthly-payments\/locations$/);

  // ─── Open units button → units table ──────────────────────────────
  await goToFirstPropertyRoomManager(page);
  await page.getByText('Open units').click();
  await page.waitForURL(/\/monthly-payments\/[^/]+\?period=/);

  // ─── Locations back button ────────────────────────────────────────
  await goToFirstPropertyRoomManager(page);
  await page.locator('a').filter({ hasText: 'Locations' }).first().click();
  await page.waitForURL(/\/monthly-payments\/locations/);
});

// ─── Test: Full room edit → save → verify DB round-trip ─────────────

test('E2E: Room edit → save → verify values persisted in UI and API', async ({ page }) => {
  await goToFirstPropertyRoomManager(page);

  // Capture current URL to extract propertyId
  const url = page.url();
  const propertyIdMatch = url.match(/\/locations\/([^?/]+)/);
  expect(propertyIdMatch).toBeTruthy();

  // Click "Edit room" on the first card
  const firstCard = page.locator('article').first();
  const roomLabel = await firstCard.locator('h2').first().textContent();
  await firstCard.locator('button').first().click();

  // Editor opens
  await expect(page.getByText('Save room')).toBeVisible();
  await expect(page.getByText('Save room')).toBeVisible();
  await expect(page.getByText('Close')).toBeVisible();

  // ─── Read current values and modify them ──────────────────────────
  const labelInput = page.locator('label').filter({ hasText: 'Room label' }).locator('input');
  const rentInput = page.locator('label').filter({ hasText: 'Rent' }).first().locator('input');
  const refInput = page.locator('label').filter({ hasText: 'Primary reference' }).locator('input');
  const contactInput = page.locator('label').filter({ hasText: 'Name' }).locator('input');
  const occupancySelect = page.locator('label').filter({ hasText: 'Occupancy' }).locator('select');

  // Store original values for restoration later
  const origLabel = await labelInput.inputValue();
  const origRent = await rentInput.inputValue();
  const origRef = await refInput.inputValue();
  const origContact = await contactInput.inputValue();
  const origOccupancy = await occupancySelect.inputValue();

  // Set new values
  const suffix = stamp();
  const newLabel = `Room ${suffix}`;
  const newRent = '7777';
  const newRef = `REF-${suffix}`;
  const newContact = `tenant-${suffix}@test.com`;

  await labelInput.fill(newLabel);
  await rentInput.fill(newRent);
  await refInput.fill(newRef);
  await contactInput.fill(newContact);

  // Toggle occupancy
  const newOccupancy = origOccupancy === 'occupied' ? 'vacant' : 'occupied';
  await occupancySelect.selectOption(newOccupancy);
  await expect(occupancySelect).toHaveValue(newOccupancy);

  // ─── Advanced fields (if not locked) ──────────────────────────────
  const depositInput = page.locator('label').filter({ hasText: 'Deposit' }).locator('input');
  const advancedLocked = await depositInput.isDisabled();

  let origDeposit = '';
  let origParking = '';
  if (!advancedLocked) {
    origDeposit = await depositInput.inputValue();
    const parkingInput = page.locator('label').filter({ hasText: 'Parking' }).locator('input');
    origParking = await parkingInput.inputValue();

    await depositInput.fill('5555');
    await parkingInput.fill(`P-${suffix}`);
  }

  // ─── Match rules CRUD ─────────────────────────────────────────────
  // Add a new rule
  await page.getByText('Add rule').click();

  // Find all compact rule type selects — the last one is the new rule.
  const ruleSelects = page.locator('select').filter({ has: page.locator('option[value="reference_contains"]') });
  const ruleCount = await ruleSelects.count();
  expect(ruleCount).toBeGreaterThanOrEqual(2); // at least existing + new

  // Set the new rule to "reference_contains" with a test value
  const lastRuleIndex = ruleCount - 1;
  await ruleSelects.nth(lastRuleIndex).selectOption('reference_contains');

  // Fill in the value for the reference_contains rule
  const ruleValueInputs = page.locator('input[placeholder="Match value"]');
  await ruleValueInputs.last().fill(`contains-${suffix}`);

  // ─── Save ─────────────────────────────────────────────────────────
  await page.getByText('Save room').click();

  // Editor should close after successful save
  await expect(page.getByText('Save room')).toBeHidden({ timeout: 15_000 });

  // ─── Verify: UI reflects saved values after page refresh ──────────
  await page.waitForTimeout(1000); // let router.refresh() settle
  await page.reload();
  await expect(page.getByText(/room manager/i)).toBeVisible();

  // The room card should now show the new label
  await expect(page.getByText(newLabel)).toBeVisible();

  // The room card should show new rent
  await expect(page.getByText('R 7,777')).toBeVisible();

  // The primary reference should show new value
  await expect(page.getByText(newRef)).toBeVisible();

  // The name should show
  await expect(page.getByText(newContact)).toBeVisible();

  // Occupancy status badge should reflect new state
  const expectedBadge = newOccupancy === 'vacant' ? 'on market' : 'occupied';
  const roomArticle = page.locator('article').filter({ hasText: newLabel });
  await expect(roomArticle.getByText(expectedBadge)).toBeVisible();

  // Rule should remain visible through the compact editor.
  await expect(page.getByText(`contains-${suffix}`)).toBeVisible();

  // ─── Verify: Re-open editor confirms DB persisted values ──────────
  await roomArticle.locator('button').first().click();
  await expect(page.getByText('Save room')).toBeVisible();

  // All fields should match what we saved
  await expect(labelInput).toHaveValue(newLabel);
  await expect(rentInput).toHaveValue(newRent);
  await expect(refInput).toHaveValue(newRef);
  await expect(contactInput).toHaveValue(newContact);
  await expect(occupancySelect).toHaveValue(newOccupancy);

  if (!advancedLocked) {
    await expect(depositInput).toHaveValue('5555');
    const parkingInput = page.locator('label').filter({ hasText: 'Parking' }).locator('input');
    await expect(parkingInput).toHaveValue(`P-${suffix}`);
  }

  // ─── Restore original values ──────────────────────────────────────
  await labelInput.fill(origLabel || roomLabel || 'Room');
  await rentInput.fill(origRent || '0');
  await refInput.fill(origRef);
  await contactInput.fill(origContact);
  await occupancySelect.selectOption(origOccupancy || 'occupied');

  if (!advancedLocked) {
    await depositInput.fill(origDeposit || '0');
    const parkingInput = page.locator('label').filter({ hasText: 'Parking' }).locator('input');
    await parkingInput.fill(origParking);
  }

  // Remove the test rule we added (click the last remove button)
  const removeButtons = page.getByRole('button', { name: 'Remove rule' });
  const removeCount = await removeButtons.count();
  if (removeCount > 1) {
    await removeButtons.last().click();
  }

  await page.getByText('Save room').click();
  await expect(page.getByText('Save room')).toBeHidden({ timeout: 15_000 });
});

// ─── Test: Cancel discards changes ──────────────────────────────────

test('E2E: Room edit cancel discards changes', async ({ page }) => {
  await goToFirstPropertyRoomManager(page);

  const firstCard = page.locator('article').first();
  const originalLabel = await firstCard.locator('h2').first().textContent();

  await firstCard.locator('button').first().click();
  await expect(page.getByText('Save room')).toBeVisible();

  const labelInput = page.locator('label').filter({ hasText: 'Room label' }).locator('input');
  await labelInput.fill('SHOULD_NOT_PERSIST');

  await page.getByText('Close').click();
  await expect(page.getByText('Save room')).toBeHidden();

  // Original label should still be there, not the edited one
  await expect(page.getByText('SHOULD_NOT_PERSIST')).toBeHidden();
  if (originalLabel) {
    await expect(page.getByText(originalLabel)).toBeVisible();
  }
});

// ─── Test: Auto-open editor via unitId URL param ────────────────────

test('E2E: Auto-open room editor via unitId URL parameter', async ({ page }) => {
  // First navigate normally to get a real propertyId
  await goToFirstPropertyRoomManager(page);

  const url = page.url();
  const propertyId = url.match(/\/locations\/([^?/]+)/)?.[1];
  expect(propertyId).toBeTruthy();

  // Close any open editor
  const cancelBtn = page.getByText('Close');
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
  }

  // Navigate to units table to find a "edit source" link that has unitId
  await page.goto(`/monthly-payments/${propertyId}`);
  const editSourceLink = page.getByText('edit source').first();
  const hasEditSource = await editSourceLink.isVisible({ timeout: 5000 }).catch(() => false);

  if (hasEditSource) {
    await editSourceLink.click();
    await page.waitForURL(/\/monthly-payments\/locations\/[^/]+\?.*unitId=/);
    await expect(page.getByText('Save room')).toBeVisible({ timeout: 10_000 });
  }
});

// ─── Test: Locations admin page ─────────────────────────────────────

test('E2E: Locations admin — property cards, navigation to room manager and units', async ({ page }) => {
  await goToLocations(page);

  // Page heading
  await expect(page.getByText(/Locations/i).first()).toBeVisible();

  // Property cards
  const cards = page.locator('article');
  const cardCount = await cards.count();

  if (cardCount === 0) {
    test.skip(true, 'No location cards found');
    return;
  }

  const firstCard = cards.first();

  // Each card has room count, occupancy info
  await expect(firstCard.getByText(/room/i).first()).toBeVisible();

  // Navigation links
  const manageRooms = firstCard.getByText('Manage rooms');
  const openUnits = firstCard.getByText('Open units');
  await expect(manageRooms).toBeVisible();
  await expect(openUnits).toBeVisible();

  // Manage rooms → room manager
  await manageRooms.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+/);
  await expect(page.getByText(/room manager/i)).toBeVisible();

  // Back to locations → Open units → units table
  await goToLocations(page);
  await cards.first().getByText('Open units').click();
  await page.waitForURL(/\/monthly-payments\/[^/]+/);
});

// ─── Test: Reference pool page ──────────────────────────────────────

test('E2E: Reference pool — heading, period nav, summary sidebar, open links', async ({ page }) => {
  // Navigate via sidebar
  await page.goto('/monthly-payments');
  const sidebar = page.locator('aside');
  await sidebar.locator('a[href*="reference-pool"]').click();
  await page.waitForURL('**/reference-pool**');

  await expect(page.getByText(/Reference pool/i).first()).toBeVisible();

  // Breadcrumb
  const orgBreadcrumb = page.locator('nav a[href="/monthly-payments"]').first();
  await expect(orgBreadcrumb).toBeVisible();

  // Period navigation (prev/next links)
  const prevLink = page.getByText('‹').first();
  const nextLink = page.getByText('›').first();
  await expect(prevLink).toBeVisible();
  await expect(nextLink).toBeVisible();

  // Click prev to change period
  const urlBefore = page.url();
  await prevLink.click();
  await page.waitForTimeout(500);
  expect(page.url()).not.toBe(urlBefore);

  // Summary sidebar with location buckets
  const summarySection = page.getByText(/unmatched|matched|deposits/i).first();
  await expect(summarySection).toBeVisible();

  // "open" links in sidebar
  const openLinks = page.getByText('open');
  const hasOpenLinks = await openLinks.first().isVisible({ timeout: 3000 }).catch(() => false);
  if (hasOpenLinks) {
    await openLinks.first().click();
    await page.waitForURL(/\/monthly-payments\/[^/]+/);
  }
});
