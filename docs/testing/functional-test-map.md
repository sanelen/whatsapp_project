# Functional test map — failure → action feedback loop

Last updated: 2026-07-02

Every functional test protects a business decision, not an element. This map
says what each failure MEANS and what to DO about it, so a red test always
produces action. Tests carry the same message in their assertion text — this
file is the index.

Owner decision rules these tests enforce (rulings 2026-07-02):

1. **Paid = signed-off only.** Matched money awaiting sign-off is `pending`,
   shown separately, never counted as collected. (Alternates — "any full match
   counts" and "show both as co-equal numbers" — deliberately parked, revisit
   when sign-off volume makes the gate annoying.)
2. **Deposit ledger per unit.** Accepted overpayment splits persist to
   `deposit_contributions`; running balance tracks toward
   `property_units.deposit_amount`; suggestions are capped by REMAINING headroom.
3. **Under-payment = `partial` + outstanding**, more references matchable until
   covered.
4. **Surplus = held unit credit, operator-allocated only** (rulings 2026-07-03):
   destinations are arrears within the last 3 months, next month's rent, or
   deposit while headroom remains; suggest only, never auto-apply; sign-off is
   not blocked by surplus.
5. **TEST rooms count like normal rooms** (owner ruling 2026-07-03): `is_test`
   fixtures are NOT excluded from dashboard totals/counts — the owner accepts
   ~R6,000/month fake expected in the numbers. Do not "fix" this by filtering
   them out; reconciliation tests treat them as ordinary rows.

## Unit-level functional tests (`src/lib/monthly-payments.test.ts`, `npm test`)

| Test (name prefix) | Requirement | Decision protected | On failure |
|---|---|---|---|
| FR-2.5 [paid = signed-off only] | FR-2.5 | Collection progress is trustworthy | Fix sign-off gate in `computeUnitStatus`; never count unsigned money as paid |
| FR-2.8 [under-payment = partial + outstanding] | FR-2.8 | Arrears amounts quoted to tenants | Fix partial branch / outstanding math in `computeUnitStatus` |
| FR-2.8 [overpayment = rent + deposit split] | FR-2.8 | Deposit contributions don't get lost | Check `computeDepositSplitSuggestion` wiring + `depositAmount > 0` guard |
| FR-2.8 [deposit ledger: accepted split reads paid] | FR-2.8 | Resolved overpayments stop nagging | `computeUnitStatus` must subtract `depositContributedAmount` before rent comparison |
| FR-2.8 [deposit ledger: remaining headroom cap] | FR-2.8 | Deposits never over-fund | Pass `target − balance` (not raw target) as `depositAmount` |
| FR-2.1/NFR-2.3 [chase list] | FR-2.1, NFR-2.3 | "Due" = who to actually chase | Dashboard must use `computeUnitStatus`; due excludes pending/blocked/paid |
| NFR-2.3 [one money story] | NFR-2.3 | Dashboard vs units-table agreement | `signedOff + pending = matched` in `buildLocationsForMonth`; rate = signedOff/expected |
| NFR-2.3 [no invisible money] | NFR-2.3, FR-2.1 | Imported money never vanishes ("where did the data go?", 2026-07-02) | `signedOff + pending + unmatched = arrived` on the rolling total; unmatched shown in rand, months show "Rxk in" |

## Page-level functional tests with screenshots (`e2e/`, `npm run test:e2e`)

**Session ritual (owner request 2026-07-02): capture BEFORE starting work and
AFTER finishing, then compare page by page.**

```bash
SCREENSHOT_LABEL=before npm run test:e2e -- page-walkthrough   # session start
# ... work ...
SCREENSHOT_LABEL=after  npm run test:e2e -- page-walkthrough   # session end
```

Screenshots land in `e2e/screenshots/<label>/NN-page.png` (dashboard, units
table, room manager, reference pool). The Playwright HTML report
(`npm run test:e2e:report`) additionally screenshots every action.

| Spec | Business outcome asserted | On failure |
|---|---|---|
| `page-walkthrough.spec.ts` (Flow 00) | No NaN/undefined money anywhere; dashboard headline = signed-off total; card counts survive the drill-down into units | Open the named screenshot for the failing page; assertion message names the broken rule and the file to fix |
| `dashboard-units-reconciliation.spec.ts` (Flow 03) | Property card totals are explained by unit rows | See Flow 03 header; usually a read-model divergence |
| `navigation-safety.spec.ts` | Every payments page has a way back | NFR-2.2 |
| `match-flow-feedback.spec.ts` (Flow 04, stubs) | FR-2.7a: after clicking Match, the candidate drawer STAYS OPEN with remaining refs + a green confirmation; operator can chain matches without re-opening. FR-2.7b: signing off a manually-matched ref offers "Add this reference to this unit's list?" | Owner scenario from the 2026-07-03 live session ("I clicked one and the rest disappeared"). Fix drawer state in `units-table.tsx` `handleMatch` — it must not call `closeMatchDrawer` |
| `surplus-credit-scenarios.spec.ts` (Flow 05, stubs) | FR-2.8 surplus credit: the three allocation destinations (arrears ≤ 3 months back, next-month advance, deposit while headroom > 0) + never-auto-apply. **TEST rooms only** (`is_test = true`, 2 per location, migration 20260703120000) — real rooms must never be touched by tests. Owner watches these headed: `npm run test:e2e:headed` | If a Flow 05 test touched a non-TEST room, that is the bug — fix the test scoping first. Otherwise fix the credit ledger / allocate action |

## The loop

1. Red test → the failure message names the broken decision rule + operator impact.
2. Fix the RULE (read model / ops), never the assertion, unless the owner has
   changed the ruling — in which case update REQUIREMENTS.md in the same commit.
3. New owner decision → add a row here + a test named `FR-x.y [decision: ...]`
   in the same session the code lands.
4. Screenshots: `before/` vs `after/` folders reviewed page by page at session
   end; differences must be explainable by that session's handover note.
