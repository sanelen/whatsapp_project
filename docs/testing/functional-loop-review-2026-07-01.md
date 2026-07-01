Last updated: 2026-07-01

# Functional Loop Review — for owner consideration

Purpose: a single place to review, per test flow, whether the operator loop is
actually working, what's still failing, and what screenshot evidence backs each
verdict — before deciding what to build next. This is a review artifact, not a new
test spec: flow definitions live in
[monthly-payments-flow-tests.md](./monthly-payments-flow-tests.md); the narrative
UI critique lives in
[monthly-payments-ui-flow-review-2026-07-01.md](../audits/monthly-payments-ui-flow-review-2026-07-01.md).

## How to use this doc

For each flow: **Verdict** (Pass / Pass with caveats / Fails / Not yet testable),
**Evidence** (automated test file if one exists, or "manual only"), and a
**Screenshot** slot to paste into before the owner reviews. Add new flows as they're
built; don't delete failed ones — a fixed-then-regressed flow is exactly what this
doc should catch.

| Verdict | Meaning |
|---|---|
| ✅ Pass | Verified working, both automated (where it exists) and in browser. |
| ⚠️ Pass with caveats | Works, but with a known rough edge (see note). |
| ❌ Fails | Confirmed broken or contradictory as of the last check. |
| ⏳ Not yet testable | Feature doesn't exist yet — flow is aspirational. |

## Flow-by-flow status

### Flow 01 — Entry to dashboard
- **Verdict:** ✅ Pass
- **Evidence:** `e2e/entry-page.spec.ts`, `e2e/navigation-flow.spec.ts`
- **Screenshot:** _(paste here)_

### Flow 02 — Month context changes the whole workspace
- **Verdict:** ✅ Pass
- **Evidence:** `e2e/month-context-propagation.spec.ts`
- **Screenshot:** _(paste here)_

### Flow 03 — Dashboard cards reconcile to unit rows
- **Verdict:** ⚠️ Pass with caveats
- **Note:** matched vs. unmatched money is now split correctly (2026-07-01 pass), so
  the old "collected but 0 paid" contradiction is fixed at the data-model level.
  Still worth re-confirming visually per property after any dashboard styling change.
- **Evidence:** `e2e/dashboard-units-reconciliation.spec.ts`, `e2e/dashboard-and-import.spec.ts`
- **Screenshot:** _(paste here)_

### Flow 04/05/09 — Room manager persistence + feeds into units view
- **Verdict:** ⚠️ Pass with caveats
- **Note:** create/edit both work and save context is preserved. Per the 2026-07-01
  UI review, it's still not self-explanatory *why* editing a field changes matching —
  functionally fine, clarity gap only.
- **Evidence:** `e2e/rooms-and-navigation.spec.ts`
- **Screenshot:** _(paste here)_

### Flow 06/07 — Unmatched pool is property-aware / match a reference
- **Verdict:** ✅ Pass
- **Evidence:** `e2e/reference-pool-matching.spec.ts`, `e2e/reference-pool.spec.ts`,
  `e2e/units-and-matching.spec.ts`
- **Screenshot:** _(paste here)_

### Flow 08 — Dashboard contradiction check
- **Verdict:** ✅ Pass (regression-critical — keep this one first-class)
- **Note:** this is the highest-trust test in the suite; any future dashboard change
  should re-run this before merge.
- **Evidence:** `e2e/dashboard-units-reconciliation.spec.ts`
- **Screenshot:** _(paste here)_

### Flow 10 — Create-room path exists
- **Verdict:** ✅ Pass
- **Note:** shipped 2026-07-01 (`Create room` action in room manager).
- **Evidence:** manual only — add to `e2e/rooms-and-navigation.spec.ts`
- **Screenshot:** _(paste here)_

### Flow — Reverse and re-match
- **Verdict:** ✅ Pass
- **Evidence:** `e2e/reverse-rematch-flow.spec.ts`
- **Screenshot:** _(paste here)_

### Flow — Units-table matching drawer runtime stability
- **Verdict:** ✅ Pass (regression, was ❌ Fails until 2026-07-01)
- **Note:** duplicate React key error in hint-chip rendering caused the Next dev
  overlay to appear while clicking through the matching drawer. Fixed by
  de-duplicating hint values and using stable composite keys. Keep this in the
  regression checklist — see the "Add this smoke test" section in
  [monthly-payments-flow-tests.md](./monthly-payments-flow-tests.md#2026-07-01-runtime-regression-note).
- **Evidence:** manual browser verification, no automated spec yet — **gap, worth
  adding.**
- **Screenshot:** _(paste here)_

### Flow — Match/sign-off operator feedback clarity
- **Verdict:** ⚠️ Pass with caveats
- **Note:** the state change happens correctly, but the 2026-07-01 review flagged
  that it's "not always obvious what happened" after choosing a candidate. This is a
  UX gap on top of working logic, not a functional failure.
- **Evidence:** manual only
- **Screenshot:** _(paste here)_

### Flow 11 — Partial-payment / deposit split
- **Verdict:** ⏳ Not yet testable
- **Note:** business rule not implemented. Overpayments currently surface as plain
  mismatches. Do not write automated coverage until the allocation rule lands — a
  pending test would just assert against unimplemented behavior.
- **Evidence:** none
- **Screenshot:** n/a

### Flow — Import refresh changes downstream state
- **Verdict:** ⚠️ Pass with caveats
- **Note:** Gmail import works; Drive archive (outbound) works and was verified at
  44/44 files. Drive → Supabase reverse import (inbound) does not exist yet, so this
  flow is only half-covered.
- **Evidence:** manual only
- **Screenshot:** _(paste here)_

### Flow 12 — Navigation safety
- **Verdict:** ✅ Pass
- **Evidence:** `e2e/navigation-safety.spec.ts`
- **Screenshot:** _(paste here)_

## Open gaps to close next (owner review requested)

1. No automated spec for the matching-drawer runtime stability fix — add one so a
   future refactor can't silently reintroduce the duplicate-key bug.
2. No automated spec for create-room presence — currently manual only.
3. Match/sign-off feedback clarity is a UX decision, not an engineering blocker —
   needs an owner call on how explicit the confirmation should be (toast, inline
   state change, both?).
4. Deposit-split behavior needs a business-rule decision before any test can be
   written meaningfully — see [REQUIREMENTS.md FR-2.8](../REQUIREMENTS.md#2-monthly-payments-operator-loop).

## Screenshot capture checklist

When filling this doc in for owner review, capture at minimum:

- Dashboard home with at least one property showing matched vs. unmatched money.
- One property's units table with a mix of paid/due/overdue/mismatch rows.
- The match-ref drawer open with candidate references visible.
- Room manager with the Create room action visible.
- Any console/runtime error overlay, if one appears (should be none per Flow —
  Units-table matching drawer runtime stability above).
