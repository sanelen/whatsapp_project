# Session Handover: Stay Lifecycle Local Owner-Test Slice

Date: 2026-07-25

## Scope

Owner asked to update SecondBrain and handover documents after the local
stay/deposit/versioning walkthrough and video analysis. This handover records the
current monthly-payments reconciliation state. No deploy, push, tenant message, or
provider setting change was performed in this documentation pass.

## What Changed Locally

- Room Manager now presents tenant occupancy as an **Active tenant version** rather
  than a vague current stay.
- The effective money-ownership date is labelled **Billing from**. This avoids
  pretending the same date always means physical move-in.
- The active tenant display is derived from `Name + Surname`; operators edit those
  fields, and the display value follows.
- Stay history rows show `Deposit paid R x / R y`.
- Open Units deposit panel now explains that deposit balance is assigned to a
  tenant version and does not decide whether the physical room is occupied.
- Held/applied credit history keeps source-payment provenance visible: source
  payment date, source payment amount, credit amount, destination, and reverse.

## Data / Migration State

- Hosted Supabase migration `add_unit_occupancy_deposit_lifecycle` was applied
  after owner approval.
- Post-migration verification observed tenant-version and deposit-ledger rows on
  the live project.
- Full production release remains blocked until owner testing and final decisions
  are complete.

## Files Updated

- `docs/ACTIVE-WORK.md`
- `docs/REQUIREMENTS.md`
- `docs/REQUIREMENT-TRACKER.md`
- `docs/LINEAR-SYNC.md`
- `docs/requirements/MONTHLY-PAYMENTS-STAY-LIFECYCLE.md`
- `docs/testing/monthly-payments-flow-tests.md`
- `src/components/monthly-payments/room-manager-view.tsx`
- `src/components/monthly-payments/units-table.tsx`

## Validation

- `npm run typecheck` passed in `.runtime/payment-reconciliation`.
- Local dev server was started on `http://localhost:3003`.
- Local screenshot validation captured:
  - `/private/tmp/hamba-video-analysis/room-manager-stay-labels-final.png`
  - `/private/tmp/hamba-video-analysis/open-units-deposit-version-labels-final.png`

## Owner-Test URLs

- Room Manager Room 1:
  `http://localhost:3003/monthly-payments/locations/ff5f0418-5bef-46a5-929c-7cfe950ff166?period=2026-07&unitId=032ccb10-20f5-433c-9378-1c601527d9b6`
- Open Units April Room 1:
  `http://localhost:3003/monthly-payments/ff5f0418-5bef-46a5-929c-7cfe950ff166?period=2026-04&unitId=032ccb10-20f5-433c-9378-1c601527d9b6`

## Current Product Model

- A **unit** is the physical room.
- A **tenant version / stay** is the tenant episode that owns deposit history and
  payment history for a period.
- Matching a bank reference to a unit is only identity matching. It does not decide
  whether money is rent, deposit, held credit, arrears, or an advance.
- Money must be counted once. A payment cannot count as both rent and deposit.
- `Billing from` is the current local field for money ownership. It may not be
  enough for physical move-in reporting.

## Open Decisions

1. Is `Billing from` sufficient, or do we need a separate physical `Moved in` date?
2. Final tenant-version statuses: `holding`, `active`, `notice`, `ended`, and
   whether `cancelled` is needed.
3. What evidence is required to end a stay retrospectively?
4. What evidence is required before marking a deposit refunded/released?
5. How should the allocation chooser behave when a current tenant and future
   incoming tenant both have money in the same billing window?

## Next Eligible Work

1. Owner test the local Room Manager tenant-version flow and Open Units deposit
   panel.
2. Add seeded/private-safe browser tests for:
   - Room Manager tenant-version persistence.
   - Holding deposit before move-in.
   - Current rent plus future tenant deposit in one billing window.
   - Bad reference removal and exact-room matching.
   - Source-payment-date provenance for deposit/held-credit allocation history.
3. After owner decision, build the stay-aware allocation chooser.
4. After refund/release evidence decision, build deposit close-out.

