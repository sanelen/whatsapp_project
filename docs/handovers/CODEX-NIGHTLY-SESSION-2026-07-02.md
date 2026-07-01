# Codex Nightly Session Handover
## Session: 2:05 AM – 3:00 AM, July 2, 2026

**Branch:** `codex/monthly-payments`  
**Status:** Operator-loop stabilization phase  
**Previous session checkpoint:** Commit `5905d21` – E2E test suite expanded, documentation synced

---

## Objective

Continue stabilizing the monthly payments operator workflow by:
1. Improving E2E test robustness (current test run had 9 passes, ~20 failures)
2. Fixing critical path regressions in match/sign-off/reverse flow
3. Ensuring UI state persists correctly across navigation
4. Preparing for production environment variable configuration (AUT-14)

---

## Context

The monthly payments workspace has three main screens working:
- **Dashboard:** Month selector, rolling totals, location cards
- **Units table:** Per-property unit rows with match drawer, reversal, sign-off
- **Locations/Room Manager:** Property setup with room definitions, occupancy, reference hints

Current blockers:
- E2E tests are failing ~70% (mostly due to selector/timing issues, not feature gaps)
- Reference pool filtering needs refinement
- Reversal workflow needs state verification fixes
- Navigation breadcrumbs not consistently populated

---

## Priority Tasks (in order)

### 1. Fix E2E Test Selectors and Timing (45 mins)
**Why:** Tests are failing on element visibility/selectors, not features.

Files to review:
- `e2e/month-context-propagation.spec.ts` — Month switching logic works, selectors need refinement
- `e2e/dashboard-units-reconciliation.spec.ts` — Amount parsing needs fixing
- `e2e/reference-pool-matching.spec.ts` — Reference item selectors too broad
- `e2e/reverse-rematch-flow.spec.ts` — Row state capture needs retry logic

**Action:**
1. Add better waits and retry logic to selector queries
2. Use `getByRole()` instead of `.locator()` where possible
3. Add `waitForLoadState('networkidle')` after navigation
4. Fix amount parsing regex (currently expects "R xx" format)

**Success:** At least 15/29 tests passing (50%+)

---

### 2. Verify Reversal Workflow State Machine (20 mins)
**Why:** Match → Unmatch → Re-match is core operator safety feature.

Files to check:
- `src/lib/monthly-payments.ts` — reversal logic
- `src/components/monthly-payments/units-table.tsx` — row state after reversal
- DB: Check if `payment_references` has audit trail / soft-delete on reverse

**Action:**
1. Trace one full reverse flow: matched row → click reverse → confirm → row becomes empty
2. Verify reference returns to unmatched pool (check Supabase)
3. Check if row edit button re-enables after reversal
4. Add console logs to track state changes

**Success:** Reversal flow leaves no orphaned references or locked rows

---

### 3. Fix Navigation Breadcrumb Population (15 mins)
**Why:** Tests show breadcrumbs empty; operators need clear trail back to dashboard.

Files to check:
- `src/app/monthly-payments/[propertyId]/layout.tsx` — breadcrumb context
- `src/components/monthly-payments/monthly-payments-shell.tsx` — breadcrumb render

**Action:**
1. Ensure breadcrumbs passed down from layout to shell component
2. Verify breadcrumb links match current URL segment
3. Add fallback labels if context is missing

**Success:** `navigation-safety.spec.ts` tests show `breadcrumbs.length >= 2` on Units and Room Manager pages

---

### 4. Reference Pool Property Filtering (10 mins)
**Why:** Operators should only see references for the active property.

Files to check:
- `src/app/monthly-payments/reference-pool/page.tsx` — Pool query
- `src/lib/monthly-payments-ops.ts` — Reference filtering logic

**Action:**
1. Check if pool query filters by property ID from URL/context
2. If pool is global, add property-scope filter
3. Verify count badge reflects property-scoped results

**Success:** Reference pool shows 0+ items; tests pass property filtering assertions

---

### 5. Commit and Push Improvements (5 mins)

```bash
git add -A
git commit -m "Codex nightly: Fix E2E test robustness, state machine verification, breadcrumbs, reference pool filtering

- Add retry logic and better waits to E2E selectors
- Fix amount parsing regex in reconciliation tests
- Verify reversal workflow leaves no orphaned state
- Populate navigation breadcrumbs from layout context
- Ensure reference pool filters by active property
- Run tests: npm run test:e2e (target 50%+ pass rate)"

git push
```

---

## Reference Materials

### Linear Tickets (current priority order)
- **AUT-14** (Urgent): Set Vercel production env vars — blocked on CLI access, note for next phase
- **AUT-17** (In Progress): Vector retrieval — separate track, not blocking monthly payments
- **AUT-9** (In Review): Schema unification — affects future migrations

### Test Document
See `docs/testing/monthly-payments-flow-tests.md` for expected behavior of:
- Flow 02: Month context propagation
- Flow 03: Dashboard reconciliation
- Flow 06–07: Reference matching
- Flow 10: Reverse/re-match
- Flow 12: Navigation safety

### Architecture Notes
- Billing window: `09 previous month - 08 current month`
- Only `Incoming Funds` bank entries become payment references
- Room match hints (keywords, regex) influence later matching suggestions
- Per-unit table dates come from transaction date, not save time

---

## Success Criteria for Session

✅ At least 15/29 E2E tests passing  
✅ No orphaned references after reversal  
✅ Breadcrumbs visible on Units and Room Manager pages  
✅ Reference pool respects property scope  
✅ One clean commit pushed to `codex/monthly-payments`

---

## Fallback / If Stuck

If a test is timing out or selector-hunting:
1. Check the Playwright HTML report: `npm run test:e2e:report`
2. Look at the screenshot after the failing action
3. Use `page.pause()` in test to manually inspect the DOM
4. Check if the app is still running on `http://localhost:3000`

If state is unclear:
1. Query Supabase directly: which payment_references exist? Which are matched?
2. Check the browser DevTools (F12) → Network tab for failed API calls
3. Check server logs for 500 errors

---

## Next Session Context

By end of this session, the monthly-payments branch should be ready for:
- Full product flow review (see `product-flow-review` skill)
- QA pass on all unit/room/reference CRUD operations
- Performance audit on dashboard rolling totals with 100+ units
- Accessibility review (WCAG 2.1 AA)

If time permits, start:
- Admin import refresh flow (Flow 11)
- Deposit-split / partial-payment logic spike (REQUIREMENTS FR-2.8)

---

**Session owner:** Codex  
**Duration:** 55 minutes (2:05 AM – 3:00 AM)  
**Commits before:** `5905d21`  
**Expected commits after:** 1–2 focused commits  
**Push to:** `codex/monthly-payments` on GitHub
