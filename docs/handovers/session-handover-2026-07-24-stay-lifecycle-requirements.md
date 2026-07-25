# Session Handover: Stay-Aware Deposit Lifecycle

Date: 2026-07-24

## Scope

Owner asked to slow down and turn the monthly-payments reconciliation discussion
into requirements, current-state documentation, Linear tracking, and test
scenarios before further production work. No feature implementation, production
migration, deployment, push, or tenant/payment-data mutation was performed in this
handover step.

## Product Decision Captured

The key model is now explicit:

- The **unit** is the physical room.
- A **stay** is a tenant occupancy episode in that room.
- Bank references can match to the unit, but money allocation must choose the
  purpose and, for deposits, the correct stay.
- The system must not double count a payment as both rent and deposit.
- A future tenant's holding deposit and a current tenant's final rent may both
  exist for the same unit in the same billing window.

## Repository Updates

- Added
  `docs/requirements/MONTHLY-PAYMENTS-STAY-LIFECYCLE.md`.
- Updated `docs/REQUIREMENTS.md` with FR-2.17.
- Updated `docs/REQUIREMENT-TRACKER.md` with PAY-4 mapped to AUT-35-AUT-37.
- Updated `docs/ACTIVE-WORK.md` to keep full lifecycle work decision-gated.
- Updated `docs/LINEAR-SYNC.md` with new Linear issues and document.
- Updated `docs/testing/monthly-payments-flow-tests.md` with the dated lifecycle
  scenario pack.
- Cross-linked `docs/roadmap/functionality/tenant-offboarding.md`.

## Linear Updates Made

- AUT-35 created: "Define stay versions and deposit lifecycle for monthly
  payments" — Backlog, High, Feature.
- AUT-36 created: "Make payment allocation stay-aware to prevent rent/deposit
  double counting" — Backlog, High, Bug + Feature; blocked by AUT-35.
- AUT-37 created: "Add safe monthly-payments lifecycle scenario tests" —
  Backlog, Medium, Improvement; related to AUT-35/AUT-36.
- Linear project document created: "Monthly payments stay lifecycle current state
  - 2026-07-24".

## Current Evidence

Local code from the prior implementation slice already shows:

- recent unit payments in expanded rows;
- known reference bindings with delete affordances;
- compact allocation history;
- read-only deposit-version panel;
- net rent display after moving money to deposit;
- reference recommendation tests protecting exact room matches.

The stay lifecycle migration is drafted locally but not applied. The UI currently
has safe fallback behavior when lifecycle tables are absent.

Additional owner recording:

- Record & Replay session `73D6AEB2-128B-4AD7-BE04-E63B43AD1C75`, captured
  2026-07-24 06:05-06:11 UTC.
- Walkthrough moved a Room 1 case across April and May 2026.
- April showed no matched rent coverage while the legacy room-level deposit ledger
  still displayed as funded.
- May showed a later matched overpayment where rent was covered, surplus was held,
  allocation history was visible, and reverse controls were dependency-guarded.
- Product implication: rent coverage must remain period-specific, surplus must
  stay visible, and the legacy deposit panel must keep warning that occupancy
  migration is needed before old/new tenant deposit ownership is trustworthy.

## Test Scenarios To Run With Owner

1. Holding deposit before move-in.
2. Current tenant rent plus future tenant deposit in one billing window.
3. End stay and release/refund deposit with evidence.
4. Retrospective stay backfill.
5. Bad known-reference delete plus exact-room matching.
6. Funded legacy deposit plus held surplus across months.

Expected invariant for every scenario: each rand is counted exactly once.

## Open Decisions

- Final stay statuses: `holding`, `active`, `notice`, `ended`, and whether
  `cancelled` is needed.
- Whether start/end stay controls live only in Room Manager or also launch from
  monthly payments.
- Evidence required to end a stay retrospectively.
- Evidence required before marking a deposit refunded/released.
- Whether automated jobs may only test this with seeded data until production
  fixtures are approved.

## Next Eligible Work

- Safe local validation: owner/browser-test AUT-37 scenarios against the current
  local app and privacy-safe screenshots.
- Implementation after decision: AUT-35 data model and stay controls.
- Mutating allocation implementation after AUT-35: AUT-36 stay-aware allocation
  chooser and rollup invariants.
