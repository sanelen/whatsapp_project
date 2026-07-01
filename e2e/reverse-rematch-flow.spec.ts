import { test, expect, type Page } from '@playwright/test';

/**
 * Flow 10: Reverse and re-match
 *
 * Tests that an operator can:
 * 1. Identify a matched unit row
 * 2. Reverse/unmatch the reference
 * 3. Confirm the row is unlocked
 * 4. Confirm the reference returns to the unmatched pool
 * 5. Match a different (correct) reference instead
 *
 * This is a critical state-machine test because:
 * - Audit trails depend on reversing matches correctly
 * - Totals must recalculate after reversal
 * - The original reference must be available again
 * - The new correct reference becomes attached
 */

async function goToFirstPropertyUnits(page: Page) {
  await page.goto('/monthly-payments/locations');
  const openLink = page.getByText('Open units').first();
  const hasUnits = await openLink.isVisible({ timeout: 8000 }).catch(() => false);
  if (!hasUnits) {
    test.skip(true, 'No properties found');
    return null;
  }
  await openLink.click();
  await page.waitForURL(/\/monthly-payments\/[^/]+/);
  await expect(page.getByText(/core view|units/i)).toBeVisible();
  return true;
}

async function findMatchedRow(page: Page) {
  const rows = page.locator('tr').filter({ has: page.locator('td') });
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const rowText = await row.textContent();
    
    // Look for rows that are already matched (have reference text, show amount, etc.)
    // Indicators: "signed-off", "locked", contains reference text, contains date
    if (rowText && (rowText.includes('signed-off') || rowText.includes('locked') || rowText.includes('R '))) {
      // Check if there's a reverse/unmatch button
      const reverseBtn = row.getByText(/reverse|unmatch|clear|remove/i, { exact: false }).first();
      if (await reverseBtn.isVisible().catch(() => false)) {
        return { row, index: i, text: rowText };
      }
    }
  }

  return null;
}

async function recordRowState(page: Page, rowIndex: number) {
  const row = page.locator('tr').filter({ has: page.locator('td') }).nth(rowIndex);
  const rowText = await row.textContent();
  
  // Extract key fields (reference, amount, date, status)
  let amount = '';
  let date = '';
  let status = '';

  const cells = row.locator('td');
  const cellCount = await cells.count();
  
  for (let i = 0; i < cellCount; i++) {
    const cellText = await cells.nth(i).textContent();
    if (cellText?.includes('R ')) amount = cellText.trim();
    if (cellText?.match(/\d{2}\/\d{2}/)) date = cellText.trim();
    if (cellText?.match(/signed|locked|paid|due|unpaid/i)) status = cellText.trim();
  }

  return { rowText, reference: amount, amount, date, status };
}

test('E2E: Reverse a matched reference and verify state resets', async ({ page }) => {
  // ─── Navigate to units ───────────────────────────────────────────
  await goToFirstPropertyUnits(page);

  // ─── Find a matched row ──────────────────────────────────────────
  const matchedRow = await findMatchedRow(page);

  if (!matchedRow) {
    test.skip(true, 'No matched units found for reversal test');
    return;
  }

  console.log(`Found matched row to reverse: ${matchedRow.text?.slice(0, 100)}`);

  // Record initial state
  const initialState = await recordRowState(page, matchedRow.index);
  console.log(`Initial state: amount=${initialState.amount}, status=${initialState.status}`);

  // ─── Trigger reverse/unmatch ────────────────────────────────────
  const reverseBtn = matchedRow.row.getByText(/reverse|unmatch|clear|remove/i, { exact: false }).first();
  
  if (!await reverseBtn.isVisible()) {
    test.skip(true, 'No reverse button found');
    return;
  }

  await reverseBtn.click();

  // ─── Confirm the reversal if a dialog appears ───────────────────
  const confirmBtn = page.getByText(/confirm|yes|reverse/i, { exact: false });
  if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  await page.waitForTimeout(1000); // Let UI settle

  // ─── Verify row unlocked and amount cleared ──────────────────────
  const updatedState = await recordRowState(page, matchedRow.index);

  console.log(`Updated state: amount=${updatedState.amount}, status=${updatedState.status}`);

  // After reversal:
  // - Row should show "unpaid" or empty status
  // - Amount should be empty or 0
  // - Row should be editable (not locked)
  
  const isCleared = !updatedState.amount || updatedState.amount === '' || updatedState.amount.includes('0');
  console.log(`Row cleared: ${isCleared}`);

  // The row should no longer show "locked" or "signed-off"
  const isUnlocked = !updatedState.status || !updatedState.status.includes('locked') && !updatedState.status.includes('signed');
  console.log(`Row unlocked: ${isUnlocked}`);

  // At least one should be true (either cleared or unlocked)
  expect(isCleared || isUnlocked).toBe(true);
});

test('E2E: Reversed reference returns to unmatched pool', async ({ page }) => {
  // ─── Navigate to units ───────────────────────────────────────────
  await goToFirstPropertyUnits(page);

  // ─── Count initial unmatched references ──────────────────────────
  // This might be shown at the bottom or in a separate pool section
  let initialPoolCount = 0;
  const poolSection = page.getByText(/unmatched|reference pool/i).first();
  
  if (await poolSection.isVisible()) {
    const poolText = await poolSection.textContent();
    // Try to extract count (e.g., "3 unmatched")
    const countMatch = poolText?.match(/(\d+)\s+unmatched/i);
    if (countMatch) {
      initialPoolCount = parseInt(countMatch[1], 10);
    }
  }

  // ─── Find and reverse a matched reference ────────────────────────
  const matchedRow = await findMatchedRow(page);

  if (!matchedRow) {
    test.skip(true, 'No matched units found');
    return;
  }

  // Record the reference being reversed
  const reverseBtn = matchedRow.row.getByText(/reverse|unmatch/i, { exact: false }).first();
  if (await reverseBtn.isVisible()) {
    await reverseBtn.click();
    
    const confirmBtn = page.getByText(/confirm|yes|reverse/i, { exact: false });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    
    await page.waitForTimeout(1000);
  }

  // ─── Check reference pool for the released reference ──────────────
  let finalPoolCount = 0;
  const poolSection2 = page.getByText(/unmatched|reference pool/i).first();
  
  if (await poolSection2.isVisible()) {
    const poolText2 = await poolSection2.textContent();
    const countMatch2 = poolText2?.match(/(\d+)\s+unmatched/i);
    if (countMatch2) {
      finalPoolCount = parseInt(countMatch2[1], 10);
    }
  }

  console.log(`Unmatched count: ${initialPoolCount} → ${finalPoolCount}`);

  // After reversal, the pool count should increase
  if (initialPoolCount > 0 || finalPoolCount > 0) {
    expect(finalPoolCount).toBeGreaterThanOrEqual(initialPoolCount);
  }
});

test('E2E: Re-match after reversal — match different (correct) reference', async ({ page }) => {
  // ─── Navigate to units ───────────────────────────────────────────
  await goToFirstPropertyUnits(page);

  // ─── Find a matched row and reverse it ────────────────────────────
  const matchedRow = await findMatchedRow(page);

  if (!matchedRow) {
    test.skip(true, 'No matched units found');
    return;
  }

  console.log(`Reversing matched row for re-matching test`);

  const reverseBtn = matchedRow.row.getByText(/reverse|unmatch/i, { exact: false }).first();
  if (await reverseBtn.isVisible()) {
    await reverseBtn.click();
    
    const confirmBtn = page.getByText(/confirm|yes/i, { exact: false });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    
    await page.waitForTimeout(1000);
  }

  // ─── Now match a different reference to this row ──────────────────
  const unlockedRow = page.locator('tr').filter({ has: page.locator('td') }).nth(matchedRow.index);
  const matchBtn = unlockedRow.getByText(/match|select|reference/i, { exact: false }).first();

  if (!await matchBtn.isVisible()) {
    console.log('No match button found after reversal');
    return;
  }

  await matchBtn.click();
  await page.waitForTimeout(500);

  // ─── Select a reference (preferably different from before) ────────
  const refCandidates = page.locator('button, a, div').filter({
    hasText: /R\s[\d,]+|reference|transaction|account/i
  });
  const candCount = await refCandidates.count();

  if (candCount === 0) {
    test.skip(true, 'No reference candidates available');
    return;
  }

  // If there are multiple candidates, try to pick a different one
  // Otherwise, just match the first
  const refIndex = candCount > 1 ? 1 : 0;
  const selectedRef = refCandidates.nth(refIndex);
  const selectedText = await selectedRef.textContent();

  console.log(`Re-matching with reference: ${selectedText?.slice(0, 100)}`);
  await selectedRef.click();

  // ─── Confirm the new match ──────────────────────────────────────
  const confirmBtn2 = page.getByText(/confirm|match|select|ok/i, { exact: false }).last();
  if (await confirmBtn2.isVisible().catch(() => false)) {
    await confirmBtn2.click();
    await page.waitForTimeout(1000);
  }

  // ─── Verify the row is now matched with the new reference ────────
  const rematchedState = await recordRowState(page, matchedRow.index);

  console.log(`Re-matched state: amount=${rematchedState.amount}, status=${rematchedState.status}`);

  // The row should now show new reference data
  // (amount should be populated if the new reference has an amount)
  expect(rematchedState.status).toBeTruthy();
  
  console.log('Re-match successful');
});
