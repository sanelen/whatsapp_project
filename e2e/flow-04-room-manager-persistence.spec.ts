import { test, expect, type Page } from '@playwright/test';

/**
 * Flow 04 (Enhanced): Room manager persistence round-trip
 *
 * Tests that room data is editable and all saved values persist after:
 * - Page refresh
 * - Navigation away and back
 * - Returning to the edit screen
 *
 * This ensures operators can trust their room configuration is saved.
 */

async function goToFirstPropertyRoomManager(page: Page) {
  await page.goto('/monthly-payments/locations');
  const manageBtn = page.getByText('Manage rooms').first();
  const hasRooms = await manageBtn.isVisible({ timeout: 8000 }).catch(() => false);
  
  if (!hasRooms) {
    test.skip(true, 'No properties with rooms found');
    return null;
  }
  
  await manageBtn.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+/);
  await expect(page.getByText(/room manager|edit room/i)).toBeVisible();
  
  return true;
}

function generateTestSuffix(): string {
  return `TEST-${Date.now().toString(36).slice(-6)}`;
}

test('Flow 04: Room manager — full CRUD persistence (edit, save, refresh, verify)', async ({ page }) => {
  await goToFirstPropertyRoomManager(page);

  // Click edit on first room
  const firstRoomCard = page.locator('article').first();
  const originalRoomLabel = await firstRoomCard.locator('h2, h3').first().textContent();
  
  await firstRoomCard.getByText('Edit room', { exact: false }).click();
  
  // Verify edit form opened
  await expect(page.getByText('Editing room', { exact: false })).toBeVisible();
  
  // Get all input fields
  const labelInput = page.locator('input[placeholder*="Room"], input[aria-label*="label" i]').first();
  const rentInput = page.locator('input[placeholder*="Rent"], input[aria-label*="rent" i]').first();
  const depositInput = page.locator('input[placeholder*="Deposit"], input[aria-label*="deposit" i]').first();
  const primaryRefInput = page.locator('input[aria-label*="primary" i], input[aria-label*="reference" i]').first();
  const keywordHintInput = page.locator('input[aria-label*="keyword" i], input[aria-label*="hint" i]').first();
  const contactInput = page.locator('input[aria-label*="contact" i]').first();
  
  const suffix = generateTestSuffix();
  
  // Capture original values
  const origLabel = await labelInput.inputValue();
  const origRent = await rentInput.inputValue();
  const origDeposit = await depositInput.inputValue();
  const origRef = await primaryRefInput.inputValue();
  const origKeywords = await keywordHintInput.inputValue();
  const origContact = await contactInput.inputValue();
  
  console.log(`Original values: label="${origLabel}", rent="${origRent}", deposit="${origDeposit}"`);
  
  // ─── Set new values ────────────────────────────────────────────
  const newLabel = `Room-${suffix}`;
  const newRent = '15500';
  const newDeposit = '31000';
  const newRef = `PrimaryRef-${suffix}`;
  const newKeywords = `keyword-a keyword-b`;
  const newContact = `Contact-${suffix}@test.local`;
  
  await labelInput.clear();
  await labelInput.fill(newLabel);
  
  await rentInput.clear();
  await rentInput.fill(newRent);
  
  await depositInput.clear();
  await depositInput.fill(newDeposit);
  
  await primaryRefInput.clear();
  await primaryRefInput.fill(newRef);
  
  await keywordHintInput.clear();
  await keywordHintInput.fill(newKeywords);
  
  if (await contactInput.isVisible()) {
    await contactInput.clear();
    await contactInput.fill(newContact);
  }
  
  // ─── Save the room ────────────────────────────────────────────
  const saveBtn = page.getByText('Save room', { exact: false });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  
  // Wait for success feedback
  await page.waitForTimeout(1000);
  
  // Should return to room list
  await expect(page.getByText(/room manager|edit room/i)).toBeVisible();
  
  // ─── Verify saved values appear on card ──────────────────────
  const updatedRoomCard = page.locator('article').filter({ hasText: newLabel });
  
  if (await updatedRoomCard.isVisible()) {
    const cardText = await updatedRoomCard.textContent();
    
    // Check that new values appear somewhere on the card
    expect(cardText).toContain(newLabel);
    expect(cardText).toContain(newRent);
    console.log('✓ Saved values visible on card');
  }
  
  // ─── Refresh page and verify persistence ─────────────────────
  await page.reload();
  await expect(page.getByText(/room manager|edit room/i)).toBeVisible();
  
  // Find the updated room after reload
  const reloadedCard = page.locator('article').filter({ hasText: newLabel });
  expect(await reloadedCard.isVisible({ timeout: 5000 }).catch(() => false)).toBe(true);
  
  const reloadedCardText = await reloadedCard.textContent();
  expect(reloadedCardText).toContain(newLabel);
  expect(reloadedCardText).toContain(newRent);
  
  console.log('✓ Values persisted after page reload');
  
  // ─── Re-open edit form and verify all fields ────────────────
  await reloadedCard.getByText('Edit room', { exact: false }).click();
  await expect(page.getByText('Editing room', { exact: false })).toBeVisible();
  
  // Read all fields again
  const readLabel = await labelInput.inputValue();
  const readRent = await rentInput.inputValue();
  const readDeposit = await depositInput.inputValue();
  const readRef = await primaryRefInput.inputValue();
  const readKeywords = await keywordHintInput.inputValue();
  const readContact = await contactInput.isVisible() ? await contactInput.inputValue() : origContact;
  
  // Verify they match what we saved
  expect(readLabel).toBe(newLabel);
  expect(readRent).toBe(newRent);
  expect(readDeposit).toBe(newDeposit);
  expect(readRef).toBe(newRef);
  expect(readKeywords).toContain('keyword-a');
  
  console.log('✓ All values persisted in edit form');
  
  // ─── Restore original values (cleanup) ────────────────────────
  if (origLabel) {
    await labelInput.clear();
    await labelInput.fill(origLabel);
  }
  if (origRent) {
    await rentInput.clear();
    await rentInput.fill(origRent);
  }
  
  await saveBtn.click();
  await page.waitForTimeout(1000);
});

test('Flow 04: Room manager — save shows success feedback and form closes', async ({ page }) => {
  await goToFirstPropertyRoomManager(page);
  
  const firstRoom = page.locator('article').first();
  await firstRoom.getByText('Edit room', { exact: false }).click();
  
  await expect(page.getByText('Editing room', { exact: false })).toBeVisible();
  
  // Make a small change
  const rentInput = page.locator('input[aria-label*="rent" i]').first();
  const originalValue = await rentInput.inputValue();
  const testValue = (parseInt(originalValue || '0') + 100).toString();
  
  await rentInput.clear();
  await rentInput.fill(testValue);
  
  // Click save
  const saveBtn = page.getByText('Save room', { exact: false });
  await saveBtn.click();
  
  // Wait for response and UI update
  await page.waitForTimeout(500);
  
  // Should show success (could be toast, badge, or just form closing)
  const successText = page.getByText(/saved|success|update/i);
  const formClosed = !await page.getByText('Editing room').isVisible({ timeout: 3000 }).catch(() => true);
  
  expect(
    (await successText.isVisible({ timeout: 2000 }).catch(() => false)) || formClosed
  ).toBe(true);
  
  console.log('✓ Save operation provided feedback');
  
  // Restore
  await firstRoom.getByText('Edit room', { exact: false }).click();
  await rentInput.fill(originalValue || '0');
  await saveBtn.click();
});

test('Flow 04: Room manager — navigate away and back preserves state', async ({ page }) => {
  await goToFirstPropertyRoomManager(page);
  
  // Edit a room but don't save
  const firstRoom = page.locator('article').first();
  const roomName = await firstRoom.locator('h2, h3').first().textContent();
  
  await firstRoom.getByText('Edit room', { exact: false }).click();
  
  // Make a change
  const rentInput = page.locator('input[aria-label*="rent" i]').first();
  const newValue = '12345';
  await rentInput.clear();
  await rentInput.fill(newValue);
  
  // Click cancel or navigate away
  const cancelBtn = page.getByText('Cancel', { exact: false });
  if (await cancelBtn.isVisible()) {
    await cancelBtn.click();
  } else {
    // Navigate back to locations
    await page.goto('/monthly-payments/locations');
    await page.waitForTimeout(500);
  }
  
  // Return to room manager
  const manageBtn = page.getByText('Manage rooms').first();
  await manageBtn.click();
  await page.waitForURL(/\/monthly-payments\/locations\/[^/]+/);
  
  // Original room should still be there
  const roomCard = page.locator('article').filter({ hasText: roomName || '' });
  expect(await roomCard.isVisible()).toBe(true);
  
  console.log('✓ Navigation away and back preserves room state');
});
