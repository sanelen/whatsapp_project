# Full-flow review: pending rent and tenant follow-up — 2026-11-25

Verdict: local acceptance passed; ready for the normal production release gate.

Scope: December reconciliation → room matching → pending confirmation → Rent
Follow-up filters and management briefing. Trigger: owner-reported discrepancy.
Baseline: cf51b2e. Branch: codex/pending-rent-follow-up.

## Architecture and flow

All steps are existing built screens. Reconcile lists unmatched receipts, split
between the selected bank window and older cycles. Matching attaches a receipt
to its room and saved billing period; sign-off remains a separate staff action.
Follow-up's pending filter displays all matched unsigned rent. Review unit keeps
building, unit, and period scope; no new screen or setup dependency is introduced.

The defect was confusing accounting outstanding (which correctly includes pending)
with rent to request again. Shared projection helpers now subtract only matched,
applicable pending rent for chase amounts and filters. Saved charges, deposit/
credit exclusions, assigned periods and signed-off confirmed balances are unchanged.
The optional alert formatter uses the same projection; delivery remains disabled.
Known transactional/stay-allocation debt in ARCHITECTURE §9 is not resolved here.

## QA

- 306 unit/contract tests passed, including full pending, partial pending, applied
  credit, deposit exclusion, accounting identities and management room lines.
- Type checking and focused lint passed.
- Desktop 1440×1000 and phone 390×844 isolated payment flows passed, without
  browser errors or horizontal overflow. A fully pending room with a past due
  date is excluded from both chase filters but present in confirmation with zero
  remaining rent; unit links retain scope. Drafts were inspected, never sent.
- Live signed-in inspection and database trace confirmed the same December bank
  window and assigned period. Three explicit room references were matched through
  the standard UI; all current-window receipts remain unsigned. Historical
  unmatched receipts remain in their original periods. No forced match or sign-off.
- Production build and six release-artifact checks passed. Production gate
  evidence will be recorded after completion.

## UI and accessibility

Reviewed real desktop/mobile fixture screenshots. Pending room rows explicitly
say awaiting confirmation and fully received, while partial rows say verify before
follow-up. Still to receive replaces the ambiguous Outstanding column on this
page. Native select labels, pressed filter state, focus styling, touch targets,
textual status and mobile wrapping remain intact. No new form or navigation step.
The design plugin is unavailable; its clarity/accessibility lenses were applied
manually to the actual rendered screens.

## Roadmap fit and tensions

This implements FR-2.5 and the owner's current discrepancy report, not a new
payments feature. The older follow-up tests protected unsigned accounting balances
but missed the chase-list distinction; keeping both notions explicit resolves
that tension. No schema, auth, provider, import or allocation change is needed.
PAY-7 tracks the acceptance evidence. A dedicated Linear mapping remains absent
and is recorded in LINEAR-SYNC; no external issue status is claimed.

## Actions and evidence

1. Run the normal PR/build and exact-revision production API/browser gates.
2. Verify live December pending, remaining rent and unmatched counts after release.
3. Staff review/sign off the matched receipts themselves; pending is not paid.

Screenshots (local ignored artifacts):
- .runtime/payment-workspace-check/collections-pending-390.png
- .runtime/payment-workspace-check/collections-pending-1440.png
- .runtime/payment-workspace-check/collections-overdue-1440.png
- .runtime/payment-workspace-check/collections-draft-390.png
