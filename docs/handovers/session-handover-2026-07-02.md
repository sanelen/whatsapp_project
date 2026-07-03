# Session Handover — 2026-07-02

## PART 2 — Interactive session with San (day)

San ruled on the open decisions and asked for functional, goal-based tests with
a failure→action feedback loop plus per-page screenshots each session.

### Owner rulings (now law, recorded in REQUIREMENTS.md)

1. **Paid = signed-off only** (headline rule; matched-awaiting-sign-off always
   visible as its own number; alternates parked, revisit on request).
2. **Deposit ledger per unit** (`deposit_contributions`, running balance toward
   `deposit_amount`, suggestions capped by remaining headroom).
3. **Under-payment = `partial` + outstanding**, more refs matchable until covered.

### Shipped this session (typecheck ✓, tests green, build ✓, live-verified in browser)

- Status model: `pending` (awaiting sign-off), `partial` (+outstanding),
  `overpaid` (split suggestion) across computeUnitStatus, units table, dashboard;
  due/chase list excludes pending.
- Dashboard clarification (late-day correction): **signed-off money is still the
  audit-grade "paid" number, but dashboard percentages/bars are operator-facing
  progress based on matched-to-unit money / expected.** This fixes the "0% but
  money is clearly here" contradiction seen in the July walkthrough.
- Deposit ledger: migration `20260702120000_add_deposit_contributions.sql`
  (**applied to live Supabase project ddlykzackuehdexldazv**), `acceptDepositSplit`
  ops + `accept_deposit_split` API action + "Accept split" row button; reversal
  un-does ledger entries; partial sign-off now allowed (period → `partial`);
  overpaid sign-off blocked until split accepted. Pure logic extracted to
  `src/lib/payment-allocation.ts` (breaks ops↔lib import cycle).
- Period-state fix (late-day correction): match/sign-off/reverse now recompute
  the billing-period status from the **full set of matched references on that
  period**, not from the current reference alone. This closes the drift where
  split-pay months could look wrong after each individual action.
- Functional test suite: decision-rule tests named `FR-x.y [decision: ...]` with
  failure messages stating the broken rule + operator impact + action. Map:
  `docs/testing/functional-test-map.md`.
- Screenshot loop: `e2e/page-walkthrough.spec.ts` (Flow 00) — named full-page
  screenshots per core page via `SCREENSHOT_LABEL=before|after npm run test:e2e
  -- page-walkthrough`; asserts business outcomes (no NaN money, signed-off
  framing, dashboard↔units agreement). Live browser check done this session:
  dashboard + berea units render the new model correctly and consistently.

### Still open (owner decisions needed)

- Surplus beyond remaining deposit: currently BLOCKED with an error. Rule needed:
  credit next month / hold unallocated / refund.
- FR-2.7 post-action feedback ("what just happened") still weak — next slice.
- e2e suite not run this session (needs local dev server; sandbox can't) — San:
  run `SCREENSHOT_LABEL=after npm run test:e2e` and skim the walkthrough shots.

### Late-day close-out (Codex)

Context from the operator walkthrough became much clearer near the end of the
day:

- The dashboard month cards are not read as an audit report first; they are read
  as the operator's live "where do I focus?" surface.
- A dead-looking `0%` while money is already matched to rows is operationally
  misleading, even if it is technically true that nothing is signed off yet.
- The safer split is:
  - **progress % / bars** = matched-to-unit money / expected
  - **paid count / signed-off rand amount** = signed-off only

What Codex changed after that clarification:

1. Added a separate dashboard `coverageRate` (matched-to-unit progress) while
   keeping `collectionRate` as signed-off / expected.
2. Updated month cards, rolling total, and property cards to use
   `coverageRate` for the headline percentage / bars.
3. Kept signed-off money visible as its own stricter number on the same cards.
4. Extracted shared payment-state rules into
   `src/lib/monthly-payment-status.ts` so reads and writes use the same truth.
5. Updated match/sign-off/reverse flows in
   `src/lib/monthly-payments-ops.ts` to recompute period state from all matched
   refs on the period.

Verification for the late-day changes:

- `npm run typecheck` — passing
- `npm test -- src/lib/monthly-payments.test.ts src/lib/auto-match.test.ts` — passing (90 tests total in the current suite run)
- `npm run build` — passing

Files touched in the late-day fix:

- `src/lib/monthly-payment-status.ts`
- `src/lib/monthly-payments.ts`
- `src/lib/monthly-payments-ops.ts`
- `src/components/monthly-payments/monthly-payments-hub.tsx`
- `src/lib/monthly-payments.test.ts`
- `docs/REQUIREMENTS.md`
- `docs/audits/monthly-payments-state-review-2026-07-02.md`

---

# PART 1 — Nightly gap work (2:05 AM run)

## Summary

Automated nightly run working the top item on LINEAR-SYNC.md's "Gaps not yet
ticketed" list: **deposit-split / partial-payment allocation (FR-2.8)**.

Shipped the first, doc-supported slice: a matched payment **above** expected rent
now computes a rent-first split suggestion (rent covered + deposit contribution,
capped at the room's configured `deposit_amount`, remainder flagged as surplus)
and reads as **"overpaid"** with the split detail in the units table, instead of
a plain rose **mismatch**. Underpayments and rows with no configured deposit are
unchanged.

This is deliberately a **read-model suggestion only** — nothing is persisted and
status stays `mismatch` under the hood, because accepting/persisting a split
needs owner decisions (see open questions below).

## What changed

- `src/lib/monthly-payments.ts`
  - New exported `computeDepositSplitSuggestion()` + `DepositSplitSuggestion`
    type. Rules: rent covered first; overpayment allocated to deposit, capped at
    `deposit_amount`; remainder surfaces as `surplusAmount`; returns `null` for
    exact/under payments, zero deposit, or zero expected rent. Cent rounding.
  - `computeUnitStatus()` takes optional `depositAmount` and returns
    `depositSplit` (only populated on the mismatch branch).
  - `readPropertyUnitsTable()` now selects `deposit_amount` (with a `42703`
    fallback to the old select for environments missing the 2026-06-30 additive
    migration) and exposes `depositAmount` + `depositSplit` on `UnitTableRow`.
- `src/components/monthly-payments/units-table.tsx`
  - Overpaid rows: amber "overpaid" pill (instead of rose "mismatch") and a
    `rent RX + deposit RY (+RZ over)` line under the received amount.
  - The `review` action and match drawer are untouched.
- `src/lib/monthly-payments.test.ts`
  - 5 new tests covering split, cap+surplus, no-overpayment, no-deposit/no-rent,
    and cent rounding.

## Verification

- `npx tsc --noEmit` — clean.
- `npm test` — 73/73 passing (includes the 5 new tests).
- `npm run build` — passing. Note: the sandbox cannot reach fonts.googleapis.com,
  so the build was verified in a copy with the two `next/font/google` imports in
  `src/app/layout.tsx` shimmed to plain objects; the repo file was not modified.
  All application code compiled unchanged.
- e2e specs **not** run — they need a live dev server + Supabase, which this
  environment doesn't have. The units-table change is display-only; existing
  selectors for status pills use `STATUS_STYLES`/`statusLabel`, so any e2e
  asserting the literal text "mismatch" on an *overpaid* row would need updating.
- Browser check not feasible in this environment — worth a quick look at
  `/monthly-payments/[propertyId]` on a row with received > expected.

## Commit

- `115cf7d` — "Add deposit-split suggestion for overpayments (FR-2.8 slice 1)"
  on `codex/monthly-payments`. **Not pushed** (per policy).
- `02ed1c6` — this handover + docs status updates. The sandbox left stale
  zero-byte `.git` lock files it could not delete, so the branch tip could not
  be moved; the commit is parked on the side ref `refs/nightly/docs-2026-07-02`
  (parented on `115cf7d`) and the same changes are also in the working tree.
- **Cleanup (San, ~30 seconds) — updated after the day session:**
  1. `rm .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock .git/refs/heads/codex/monthly-payments.lock`
  2. `git update-ref refs/heads/codex/monthly-payments cccb2ea` — fast-forwards
     the branch onto the full day's chain
     (`115cf7d` → `02ed1c6` docs → `cccb2ea` decision rules + deposit ledger).
  3. `git status` will show only this handover modified (this cleanup section
     post-dates the commit) plus `.claude/settings.local.json` — commit the
     handover as-is.
  4. optionally `git update-ref -d refs/nightly/docs-2026-07-02 && git update-ref -d refs/nightly/session-2026-07-02-day`

## Open questions for the owner (blocking next slice)

The earlier deposit-split persistence questions are now answered in code. The
remaining live decisions are:

1. Surplus beyond the remaining deposit: hold as unallocated credit, roll into
   next month's rent, or refund/manual review only?
2. How strong should post-action feedback be after match, sign-off, split
   accept, and reverse? Toast only, inline row note, or both?
3. Should import-triggered auto-match stay global, or default to the imported
   month/property scope unless an operator explicitly requests a backlog sweep?

## What to pick up next time

1. Browser-verify the new dashboard percentages against June/July and sanity
   check that the operator story now feels right.
2. Revisit the remaining review items from
   `docs/audits/monthly-payments-state-review-2026-07-02.md`, especially:
   - deposit-aware dashboard rollups
   - import auto-match scoping
3. Then move to either:
   - FR-2.7 post-action feedback, or
   - FR-2.11 Drive → Supabase reverse import, depending on owner priority.

## Files touched in this session

- src/lib/monthly-payments.ts
- src/lib/monthly-payments.test.ts
- src/components/monthly-payments/units-table.tsx
- docs/handovers/session-handover-2026-07-02.md (this file)
- docs/LINEAR-SYNC.md (gap list annotation)
- docs/REQUIREMENTS.md (FR-2.8 → Partial)
