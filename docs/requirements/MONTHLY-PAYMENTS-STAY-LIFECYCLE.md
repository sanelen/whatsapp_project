# Monthly Payments Stay Lifecycle Requirements

Last updated: 2026-07-25

Status: **Partial / Needs decision**. This document captures the owner walkthrough
from 2026-07-24 and the local owner-test slice from 2026-07-25. The hosted
Supabase stay lifecycle migration has been applied after owner approval, and the
local UI can edit active/past tenant versions. This still does not authorize
deployment, tenant-data cleanup, unattended refund/payment actions, or automatic
current-vs-future tenant allocation.

## Product Model

- A **unit** is the physical room. The room keeps labels, expected reference text,
  match hints, rent amount, and operational availability.
- A **tenant version / stay** is a tenant's occupancy episode in that room. It has
  a Billing from date, optional notice/end date, occupant snapshot, deposit target,
  and status.
- A **payment reference** can be matched to the unit because tenants often use room
  references, names, or stubborn custom text.
- A **money allocation** must be attached to a purpose and, when deposit-related,
  to the correct stay. Matching a reference to a room is not enough to decide
  rent versus deposit.

This distinction prevents the dangerous case where the same R1,500 is counted as
both rent for the current month and deposit for the tenant stay.

## Requirements

### MP-STAY-1: Show Recent Unit Payments

Classification: **Partial**

The expanded unit row must show the last three visible payments for the selected
unit, covering the current billing period plus the previous two billing periods.
Each row should show date, amount, masked account, payer/reference text, and the
current allocation split where known: rent, deposit, held credit, or applied
credit.

Current local evidence:

- Local UI read model has a recent-payments panel.
- Expanded unit rows show source payment dates for held/applied credit allocation
  history, not only the later allocation date.
- Screenshots:
  - `docs/audits/screenshots/2026-07-24-room-recent-payments-history-safe.png`
  - `docs/audits/screenshots/2026-07-24-scenario-2-current-stay-with-history.png`

Remaining acceptance:

- Prove the panel against a migrated/stay-aware dataset without exposing tenant or
  payment data.
- Add Playwright coverage for period changes and no-data states.

### MP-STAY-2: Bind and Remove Known References Safely

Classification: **Partial**

Operators must be able to bind tenant-created references to the unit and remove
bad hints/rules. Reference binding affects future matching only. It must not
silently change historical allocations or sign off money.

Current local evidence:

- Known reference chips expose delete controls locally.
- Match scoring no longer lets generic property tokens such as `ESSEX` and `ROOM`
  overpower the exact room number.

Remaining acceptance:

- Confirm persisted delete behavior in the browser on a test room.
- Add regression coverage for exact-room preference and removed hints staying
  removed after refresh.

### MP-STAY-3: Create and Close Stay Versions

Classification: **Partial / Needs decision**

Operators need a simple way to say: this tenant version should own money from X,
ended on Y, and a new tenant starts on Z. Retrospective entry must be supported
because the business predates the system.

Current local evidence:

- Hosted migration `add_unit_occupancy_deposit_lifecycle` was applied after owner
  approval.
- Room Manager exposes editable active tenant-version and add-past-stay controls.
- The tenant display is derived from Name + Surname for the active tenant version.
- UI copy now uses **Billing from** rather than generic **Starts** to reduce
  confusion when a tenant pays before the month the money belongs to.

Proposed behavior:

- Room manager owns start/end/edit controls for stays.
- Monthly payments shows the current stay summary and previous stay history.
- Ending a stay freezes its deposit ledger and marks it previous.
- A new stay starts with a fresh deposit ledger for the same physical unit.

Open decisions:

- Exact statuses: `holding`, `active`, `notice`, `ended`, plus whether `cancelled`
  is needed for failed holds.
- Whether stay start/end belongs only in Room Manager or can be launched from the
  expanded monthly-payments unit row.
- Required owner evidence for ending a stay retrospectively.
- Whether **Billing from** is enough, or the model also needs a separate physical
  move-in/date-arrived field.

### MP-STAY-4: Allocate Payments to the Correct Stay

Classification: **Needs decision**

When a unit has a current tenant and an upcoming tenant, the operator must choose
which stay receives the deposit/payment. The system must never infer a new tenant
solely from a bank reference or amount.

Acceptance criteria:

- If only one open/current stay is relevant, default to that stay but still show
  the allocation purpose.
- If there is a current stay and a future holding stay, allocation actions must
  ask which stay receives the money.
- Rent for the current tenant and deposit for the incoming tenant can exist in the
  same billing window without double counting.
- The dashboard rollup must count each rand exactly once.
- Deposit cannot exceed the target unless explicitly moved to held credit or an
  owner-approved adjustment path.

### MP-STAY-5: Release Deposit at End of Stay

Classification: **Deferred**

The system must support deposit close-out when a tenant leaves: inspection,
deduction, refund, adjustment, or reversal. Refund must require human evidence and
must not expose full banking details.

Acceptance criteria:

- Closing a stay shows deposit paid, deductions, refund due, refund paid, and
  remaining balance.
- Refund/deduction entries require a reason and evidence reference.
- Closed-stay deposits do not carry into the next tenant's stay.
- Previous stays remain queryable for audit, but are visually separate from the
  current stay.

### MP-STAY-6: Backfill Historical Stays

Classification: **Needs decision**

Because existing tenants and payments predate the system, an owner/operator needs
a backfill mode to define historical stay windows and attach visible payments to
the correct stay.

Acceptance criteria:

- Operator can enter a start date and optional end date for a previous/current
  stay.
- System shows candidate matched payments in that date range before attaching.
- Backfill never mutates imported bank evidence; it only creates allocation/stay
  metadata.
- Any ambiguous payment remains unassigned until explicitly handled.

## Manual Test Scenarios

1. **Holding deposit before move-in:** current room is vacant or future-dated;
   tenant pays R1,500 as a deposit. Expected: payment is matched to the unit,
   allocated only to the new holding stay's deposit ledger, and not counted as
   rent for the selected month.
2. **Current rent and future deposit in one window:** current tenant pays final
   rent; incoming tenant pays a holding deposit for the same room. Expected:
   operator sees two relevant stays and allocates each payment to the correct
   stay/purpose with no double counting.
3. **Tenant leaves and deposit is released:** ended stay has a deposit balance.
   Expected: close-out records deduction/refund evidence, previous stay becomes
   ended, and the next stay starts with a zero/new deposit ledger.
4. **Retrospective stay versioning:** operator enters a Feb-Jun stay after the
   fact. Expected: historical payments can be reviewed and attached to that stay
   without rewriting imported bank records.
5. **Bad reference hint removal:** a bad hint such as a temporary E2E keyword is
   deleted. Expected: it disappears from known references, no longer influences
   future matching, and past payment evidence remains intact.
6. **Exact room beats generic hints:** a payment reference naming Room 05 must not
   strong-match Room 06 merely because both share property-level tokens. Expected:
   exact room number wins; ambiguous references stay for review.

## Build Order

1. Keep and verify the local panels: recent payments, known references,
   allocation history, source-payment provenance, and tenant-version deposit
   display.
2. Owner-test Room Manager tenant-version controls and decide whether Billing from
   needs a separate physical move-in date.
3. Add safe backfill guardrails and browser tests over seeded/private-safe data.
4. Add stay-aware allocation chooser.
5. Add deposit close-out/refund flow with evidence capture.
6. Add automated browser tests over seeded safe data.
