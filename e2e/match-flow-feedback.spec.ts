import { test, expect } from '@playwright/test';

/**
 * Flow 04 — Match-session feedback (FR-2.7a / FR-2.7b).
 *
 * Owner scenario, live session 2026-07-03: "I had multiple suggestions, I
 * clicked one, and then the rest disappeared — I couldn't match the next one."
 *
 * FR-2.7a (shipped 2026-07-03): after a successful Match the drawer must stay
 * open, show a green "Matched R X · REF → unit (awaiting sign-off)"
 * confirmation, and keep listing the REMAINING candidates so the operator can
 * chain matches without re-opening the panel per reference.
 *
 * FR-2.7b (planned): signing off a reference that the unit's hints/rules would
 * not have auto-matched must ask "Add this reference to this unit's reference
 * list?" and, on yes, persist a match rule so next month auto-matches it.
 *
 * NOTE: these tests mutate match state, so they need a seeded/disposable
 * property with 2+ unmatched references (they must not run against live
 * data). Un-fixme once the e2e seed fixture exists.
 */

test.describe('Flow 04 — match-session feedback (FR-2.7)', () => {
  test.fixme(
    'FR-2.7a [drawer survives a match]: matching one candidate keeps the drawer open with remaining refs + confirmation',
    async ({ page }) => {
      // 1. Open a property units page with >= 2 unmatched references.
      // 2. Open the match drawer for a unit; note candidate count N.
      // 3. Click Match on the top candidate.
      // 4. EXPECT: drawer still visible (no re-open needed); green notice
      //    matching /Matched R .+ → .+ \(awaiting sign-off\)/; candidate list
      //    now shows N-1 refs; the matched row shows "awaiting sign-off".
      await expect(page.getByText(/Matched R .+ \(awaiting sign-off\)/)).toBeVisible();
    }
  );

  test.fixme(
    'FR-2.7b [sign-off learning prompt]: signing off a manually-matched ref offers to add it to the unit reference list',
    async ({ page }) => {
      // 1. Manually match a reference whose text hits none of the unit's
      //    hints/rules; sign it off.
      // 2. EXPECT: prompt "Add this reference to <unit>'s reference list?".
      // 3. Accept → unit match rules gain a reference_equals rule; next
      //    auto-match run matches the same reference text automatically.
      // 4. Decline → no rule persisted.
      await expect(page.getByText(/Add this reference/)).toBeVisible();
    }
  );
});
