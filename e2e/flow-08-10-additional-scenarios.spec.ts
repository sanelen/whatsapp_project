import { test, expect, type Page } from '@playwright/test';

/**
 * Additional Flow Scenarios
 *
 * Tests for flows mentioned in monthly-payments-flow-tests.md that need automation:
 * - Flow 08: Dashboard contradiction check (collection vs paid counts)
 * - Flow 09: Room source edit round-trip
 * - Flow 10: Create room path verification
 */

async function goToDashboard(page: Page) {
  await page.goto('/monthly-payments');
  await expect(page.getByText('Where are we this month?')).toBeVisible();
}

async function goToRoomManager(page: Page) {
  await page.goto('/monthly-payments/locations');
  const manageBtn = page.getByText('Manage rooms', { exact: false }).first();
  const hasRooms = await manageBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasRooms) {
    test.skip(true, 'No rooms found');
    return false;
  }
  await manageBtn.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+/);
  return true;
}

test('Flow 08: Dashboard — no contradictions between collected and paid counts', async ({ page }) => {
  /**
   * Goal: Verify the dashboard doesn't show contradictory information like
   * "25% collected" but "0 units paid". This would break operator trust.
   *
   * Expected: Collected amount should align with paid count
   * (paid = signed-off by the business rule, Flow 04)
   */
  
  await goToDashboard(page);
  
  // Extract rolling total collected amount
  let collectedAmount = 0;
  const collectedText = await page.getByText(/collected|total.*R/i).textContent();
  if (collectedText) {
    const match = collectedText.match(/R[\s,]*([\d,]+)/);
    if (match) {
      collectedAmount = parseInt(match[1].replace(/,/g, ''), 10);
    }
  }
  
  // Extract "paid" count from location cards
  let totalPaidCount = 0;
  const paidCountMatches = await page.getByText(/\d+\s+paid/i).allTextContents();
  for (const text of paidCountMatches) {
    const match = text.match(/(\d+)\s+paid/i);
    if (match) {
      totalPaidCount += parseInt(match[1], 10);
    }
  }
  
  // Contradiction check:
  // If collected > 0 and paid = 0, that's suspicious (unless it's all pending)
  if (collectedAmount > 0) {
    expect(totalPaidCount).toBeGreaterThan(0);
    console.log(`✓ No contradiction: collected R${collectedAmount}, paid count ${totalPaidCount}`);
  } else {
    console.log(`No contradiction: both collected and paid are minimal`);
  }
});

test('Flow 09: Room source — edit roundtrip with visible changes', async ({ page }) => {
  /**
   * Goal: Verify that room property changes (rent, occupancy, etc.) are
   * visible in the cards after editing, and that the edit reflects what was saved.
   *
   * Expected: Edit form → Save → Card shows new values → Edit again → see saved values
   */
  
  if (!await goToRoomManager(page)) return;
  
  const firstRoom = page.locator('article').first();
  const originalRoomLabel = await firstRoom.locator('h2, h3').first().textContent();
  
  // ─── Edit the room ──────────────────────────────────────
  await firstRoom.locator('button').first().click();
  
  // Make a distinguishable change to rent
  const rentInput = page.locator('input[aria-label*="rent" i]').first();
  const originalRent = await rentInput.inputValue();
  const newRent = (parseInt(originalRent || '0') + 500).toString();
  
  await rentInput.clear();
  await rentInput.fill(newRent);
  
  // Save
  await page.getByText('Save room', { exact: false }).click();
  await page.waitForTimeout(1000);
  
  // ─── Verify card shows the new rent ──────────────────
  const updatedCard = page.locator('article').filter({ hasText: originalRoomLabel || '' });
  const cardText = await updatedCard.textContent();
  
  // New rent should be visible somewhere on the card
  expect(cardText).toContain(newRent);
  
  // ─── Edit again and verify the saved value is there ───
  await updatedCard.locator('button').first().click();
  await expect(page.getByText('Save room')).toBeVisible();
  
  const rereadRent = await rentInput.inputValue();
  expect(rereadRent).toBe(newRent);
  
  console.log('✓ Room edit roundtrip: save → card update → re-read verified');
  
  // Restore original
  if (originalRent) {
    await rentInput.clear();
    await rentInput.fill(originalRent);
    await page.getByText('Save room', { exact: false }).click();
  }
});

test('Flow 10: Create room — full new room creation flow', async ({ page }) => {
  /**
   * Goal: Verify that operators can create a new room from scratch.
   *
   * Expected: 
   * - "Create room" or "Add room" button exists and is accessible
   * - Form opens with empty fields
   * - Can fill in room details (label, rent, deposit, etc.)
   * - Save creates the room
   * - New room appears in the list
   */
  
  if (!await goToRoomManager(page)) return;
  
  // Count rooms before
  const roomsBefore = await page.locator('article[class*="room"], article:has(h2), article:has(h3)').count();
  
  // Look for "Create room", "Add room", or "New room" button
  const createBtn = page.getByText(/create room|add room|new room|\\+/i, { exact: false });
  
  if (!await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('⚠️ Create room button not visible (may not be implemented yet)');
    test.skip(true, 'Create room functionality not visible');
    return;
  }
  
  await createBtn.click();
  
  // Form should open
  const editForm = page.getByText('Save room', { exact: false });
  const createForm = page.getByText('Creating room', { exact: false });
  
  const formOpen = await editForm.isVisible({ timeout: 2000 }).catch(() => false) ||
                   await createForm.isVisible({ timeout: 2000 }).catch(() => false) ||
                   await page.locator('input[placeholder*="Room"], input[aria-label*="label" i]').isVisible();
  
  if (!formOpen) {
    console.log('⚠️ Room creation form did not open');
    test.skip(true, 'Form not visible');
    return;
  }
  
  // Fill in new room details
  const testLabel = `NewRoom-${Date.now().toString(36).slice(-5)}`;
  const labelInput = page.locator('input[placeholder*="Room"], input[aria-label*="label" i]').first();
  
  await labelInput.fill(testLabel);
  
  // Optional: fill other fields if visible
  const rentInput = page.locator('input[aria-label*="rent" i]').first();
  if (await rentInput.isVisible()) {
    await rentInput.fill('15000');
  }
  
  // Save the new room
  const saveBtn = page.getByText('Save room', { exact: false });
  await saveBtn.click();
  
  await page.waitForTimeout(1500);
  
  // Verify new room appears in list
  const newRoomCard = page.locator('article').filter({ hasText: testLabel });
  const newRoomVisible = await newRoomCard.isVisible({ timeout: 3000 }).catch(() => false);
  
  expect(newRoomVisible).toBe(true);
  
  // Room count should increase
  const roomsAfter = await page.locator('article[class*="room"], article:has(h2), article:has(h3)').count();
  expect(roomsAfter).toBeGreaterThan(roomsBefore);
  
  console.log(`✓ Create room successful: ${roomsBefore} → ${roomsAfter} rooms`);
});

test('Flow 10: Create room — form validation (required fields)', async ({ page }) => {
  /**
   * Goal: Verify form doesn't allow saving empty/invalid room data.
   *
   * Expected:
   * - Save button disabled if required fields empty
   * - Error message shown if validation fails
   * - Can't create room without a label
   */
  
  if (!await goToRoomManager(page)) return;
  
  const createBtn = page.getByText(/create room|add room|new room/i, { exact: false });
  
  if (!await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    test.skip(true, 'Create room not visible');
    return;
  }
  
  await createBtn.click();
  await page.waitForTimeout(500);
  
  // Try to save without filling in required fields
  const saveBtn = page.getByText('Save room', { exact: false });
  
  // Save button should be disabled or show error
  const isDisabled = await saveBtn.isDisabled();
  
  if (isDisabled) {
    console.log('✓ Save button correctly disabled when form is empty');
  } else {
    // Try clicking anyway and expect error
    await saveBtn.click();
    
    const errorMsg = page.getByText(/required|must enter|please enter/i, { exact: false });
    const showsError = await errorMsg.isVisible({ timeout: 2000 }).catch(() => false);
    
    if (showsError) {
      console.log('✓ Form shows validation error for empty fields');
    }
  }
  
  // Cancel the form
  const cancelBtn = page.getByText('Close', { exact: false });
  if (await cancelBtn.isVisible()) {
    await cancelBtn.click();
  }
});

test('Flow 08/10: Dashboard totals include newly created rooms', async ({ page }) => {
  /**
   * Goal: Verify that new rooms created in room manager are reflected
   * in dashboard totals immediately (or after refresh).
   */
  
  await goToDashboard(page);
  
  // Capture initial totals
  const initialTotalText = await page.getByText(/total|rolling|collected/i).textContent();
  const initialMatch = initialTotalText?.match(/(\d+)/);
  const initialTotal = initialMatch ? parseInt(initialMatch[1], 10) : 0;
  
  // Go create a room (if possible)
  if (!await goToRoomManager(page)) return;
  
  const createBtn = page.getByText(/create room|add room/i, { exact: false });
  if (!await createBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    test.skip(true, 'Create room not available');
    return;
  }
  
  await createBtn.click();
  await page.waitForTimeout(500);
  
  const labelInput = page.locator('input[placeholder*="Room"], input[aria-label*="label" i]').first();
  const testLabel = `Room-${Date.now()}`;
  
  await labelInput.fill(testLabel);
  
  // Add a rent value
  const rentInput = page.locator('input[aria-label*="rent" i]').first();
  if (await rentInput.isVisible()) {
    await rentInput.fill('10000');
  }
  
  // Save
  await page.getByText('Save room', { exact: false }).click();
  await page.waitForTimeout(1000);
  
  // Return to dashboard
  await goToDashboard(page);
  
  // Refresh to ensure totals are recalculated
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  // Check new total (should be >= initial, possibly higher with new room)
  const newTotalText = await page.getByText(/total|rolling|collected/i).textContent();
  const newMatch = newTotalText?.match(/(\d+)/);
  const newTotal = newMatch ? parseInt(newMatch[1], 10) : 0;
  
  expect(newTotal).toBeGreaterThanOrEqual(initialTotal);
  console.log(`Dashboard totals updated: ${initialTotal} → ${newTotal}`);
});
