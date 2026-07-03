import { test, expect, type Page } from '@playwright/test';

/**
 * Flow 05 — Surplus-credit allocation scenarios (FR-2.8, owner rulings 2026-07-03).
 *
 * HARD RULE: these tests may ONLY touch the dedicated fixture rooms
 * ("TEST ROOM 1" / "TEST ROOM 2", property_units.is_test = true — two per
 * location, migration 20260703120000). Real rooms are NEVER edited,
 * matched, or reallocated by automated tests. Every helper below scopes to
 * TEST-ROOM rows and fails loudly if none are found.
 *
 * Owner wants these runs VISIBLE: use `npm run test:e2e:headed`
 * (non-headless, single worker, slowMo) so the flow can be watched live.
 *
 * The three destinations a surplus credit can be allocated to — always
 * operator-clicked, never automatic:
 *   1. A short/unpaid month within the LAST 3 MONTHS (arrears).
 *   2. NEXT month's rent (advance, one month ahead).
 *   3. DEPOSIT, only while remaining headroom > 0.
 *
 * All three are test.fixme until the credit ledger + allocate action ship
 * (queued for the 2026-07-03 nightly build).
 */

const TEST_ROOM = /TEST ROOM [12]/;

async function openTestRoomDrawer(page: Page) {
  const row = page.getByText(TEST_ROOM).first();
  await expect(row, 'No TEST ROOM fixture found — run migration 20260703120000').toBeVisible();
}

test.describe('Flow 05 — surplus credit allocation (TEST rooms only)', () => {
  test.fixme(
    'FR-2.8 [surplus → arrears within 3 months]: credit allocated to a short month clears its outstanding',
    async ({ page }) => {
      // Setup (TEST ROOM 1): make last month partial (fake short payment),
      // this month overpaid beyond rent + deposit headroom → surplus credit.
      // Action: Allocate credit → pick the short month (offered because it is
      // within the 3-month window).
      // EXPECT: short month outstanding drops by the allocation; credit
      // balance decreases; both movements visible and reversible; a month
      // OLDER than 3 months is NOT offered as a destination.
      await openTestRoomDrawer(page);
      await expect(page.getByText(/Allocate credit/)).toBeVisible();
    }
  );

  test.fixme(
    'FR-2.8 [surplus → next month advance]: credit applied one month ahead shows as advance on that period',
    async ({ page }) => {
      // Setup (TEST ROOM 2): overpay current month with deposit already full.
      // Action: Allocate credit → "next month" (e.g. July surplus → August).
      // EXPECT: next period shows the advance amount / reduced outstanding;
      // only ONE month ahead is offered; credit balance decreases.
      await openTestRoomDrawer(page);
      await expect(page.getByText(/Allocate credit/)).toBeVisible();
    }
  );

  test.fixme(
    'FR-2.8 [surplus → deposit while headroom remains]: deposit destination offered only when balance < target',
    async ({ page }) => {
      // Setup (TEST ROOM 1): deposit partially funded, surplus credit held.
      // EXPECT: "deposit" offered as destination, capped at remaining
      // headroom; once the ledger reaches the target, the deposit option
      // disappears from the allocate popup.
      await openTestRoomDrawer(page);
      await expect(page.getByText(/Allocate credit/)).toBeVisible();
    }
  );

  test.fixme(
    'FR-2.8 [never auto-apply]: importing/matching never moves credit without an operator click',
    async ({ page }) => {
      // Setup: TEST room holding credit + a short month in window.
      // Action: run auto-match / refresh.
      // EXPECT: credit balance unchanged; at most a SUGGESTION is shown.
      await openTestRoomDrawer(page);
      await expect(page.getByText(/credit/i)).toBeVisible();
    }
  );
});
