---
sessionName: "Codex Nightly - Monthly Payments Stabilization"
sessionTime: "2:05 AM - 3:00 AM, July 2, 2026"
sessionOwner: "Codex"
branch: "codex/monthly-payments"
autoCommit: true
pushOnComplete: true
---

# Codex Nightly Session Instructions

You have been assigned to work autonomously on the **HambaCustomerService** project for this nightly session.

## Your Mission

Fix the monthly payments operator workflow by improving E2E test robustness and verifying critical state machines. You have ~55 minutes.

## Starting Point

1. **Read this first:** `docs/handovers/CODEX-NIGHTLY-SESSION-2026-07-02.md`
   - Contains priorities, context, and success criteria
   - Reference this document if you get stuck

2. **Ensure you're on the right branch:**
   ```bash
   git checkout codex/monthly-payments
   git pull origin codex/monthly-payments
   ```

3. **Verify the app is running:**
   ```bash
   # Terminal 1: ensure dev server is up
   npm run dev
   # Terminal 2: in parallel, run tests
   npm run test:e2e
   ```

## Your Four Key Tasks (in priority order)

### Task 1: Fix E2E Test Selectors (Priority: CRITICAL)
- **Files:** `e2e/month-context-propagation.spec.ts`, `e2e/dashboard-units-reconciliation.spec.ts`, etc.
- **What's wrong:** Selectors are too broad or timing out; features work but tests fail
- **How to fix:** Add `waitForLoadState()`, use `getByRole()`, increase visibility waits to 8000ms
- **Success:** Get 15+ tests passing (currently ~9/29)

### Task 2: Verify Reversal State Machine (Priority: HIGH)
- **Files:** `src/lib/monthly-payments.ts`, `src/components/monthly-payments/units-table.tsx`
- **What to check:**
  - Can an operator match → unmatch → re-match without orphaned references?
  - Does the reference return to the pool after unmatch?
  - Is the row editable again after unmatch?
- **How to verify:** Run through the reversal flow manually, check database state
- **Success:** No orphaned or stuck references

### Task 3: Fix Navigation Breadcrumbs (Priority: HIGH)
- **Files:** Layouts and shells under `src/app/monthly-payments/`
- **What's wrong:** Breadcrumbs are empty/missing on Units and Room Manager pages
- **How to fix:** Ensure breadcrumb context is populated from layout and passed to shell
- **Success:** Tests show breadcrumbs with 2+ items on child pages

### Task 4: Verify Reference Pool Property Scope (Priority: MEDIUM)
- **Files:** `src/app/monthly-payments/reference-pool/page.tsx`, `src/lib/monthly-payments-ops.ts`
- **What to check:** Does the pool show only references for the selected property?
- **How to fix:** Add property ID filter to pool query if missing
- **Success:** Pool count matches property-scoped references only

## Workflow

1. **Start:** Run one failing test to see the error
   ```bash
   npx playwright test month-context-propagation --debug
   ```

2. **Investigate:** Look at the screenshot in the Playwright HTML report
   ```bash
   npm run test:e2e:report
   ```

3. **Fix:** Update the test selector or add waits; make 1–2 passes
4. **Verify:** Re-run test; if pass, move to next
5. **Commit:** After each task, commit changes
   ```bash
   git add -A
   git commit -m "Fix task X: [description]"
   ```

6. **Push:** At the end, push all commits
   ```bash
   git push origin codex/monthly-payments
   ```

## How to Get Help

If you're stuck:
1. Check the test screenshot (run `npm run test:e2e:report`)
2. Use `page.pause()` in the test to manually inspect the DOM
3. Query Supabase to verify data state
4. Check `docs/testing/monthly-payments-flow-tests.md` for expected behaviors
5. Read the inline comments in the test file—they contain clues

## Success Definition

By 3:00 AM:
- ✅ 15+ E2E tests passing (50%+ pass rate)
- ✅ Reversal workflow verified to leave no orphaned state
- ✅ Navigation breadcrumbs populated on child pages
- ✅ Reference pool property filtering confirmed
- ✅ 1–2 clean commits pushed to GitHub

## If You Run Out of Time

Prioritize in this order:
1. Task 1 (test fixes) — highest ROI, fastest wins
2. Task 2 (reversal verification) — most critical workflow
3. Task 3 (breadcrumbs) — quick fix, high visibility
4. Task 4 (pool filtering) — nice-to-have, can defer

Leave clear notes in a commit message if you have to pause early.

## After This Session

The next session (or next morning team standup) will:
- Review your commits
- Run the full test suite on the latest checkpoint
- Decide whether to merge to main or continue on `codex/monthly-payments`
- Plan the next phase: production env setup (AUT-14) or full flow review

---

**You've got this. Go fix the tests and verify the workflows. See you at 3 AM! 🚀**
