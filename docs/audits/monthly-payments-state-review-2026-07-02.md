# Monthly Payments State Review — 2026-07-02

This review checks the latest Claude/Codex session work against the current
monthly-payments operator loop, with special focus on the new payment-state
rules introduced on 2026-07-02.

## Verified Context

- Reviewed recent repo changes on `codex/monthly-payments`
- Read latest handover:
  - `docs/handovers/session-handover-2026-07-02.md`
- Reviewed touched code in:
  - `src/lib/monthly-payments.ts`
  - `src/lib/monthly-payments-ops.ts`
  - `src/app/api/monthly-payments/import/route.ts`
  - `src/app/api/monthly-payments/references/route.ts`
- Verified locally:
  - `npm test` — 89/89 passing
  - `npm run build` — passing

Green tests/build do not remove the findings below. The gaps are in business
logic alignment between the read model and the write-side workflow actions.

## Findings

### 1. [High] Match writes period status from one reference, not the whole period

The new rules now allow partial payments and multi-reference coverage across a
single billing period, but `matchReferenceToUnit()` still sets the
`unit_payment_periods.status` from the currently matched reference amount alone.

#### Evidence

- [`src/lib/monthly-payments-ops.ts:196`](../../src/lib/monthly-payments-ops.ts#L196)
  loads exactly one `unit_payment_periods` row.
- [`src/lib/monthly-payments-ops.ts:207`](../../src/lib/monthly-payments-ops.ts#L207)
  derives `expectedAmount`.
- [`src/lib/monthly-payments-ops.ts:208`](../../src/lib/monthly-payments-ops.ts#L208)
  derives `amount` from the single reference.
- [`src/lib/monthly-payments-ops.ts:209`](../../src/lib/monthly-payments-ops.ts#L209)
  sets:
  - exact single amount -> `unpaid`
  - everything else -> `mismatch`
- [`src/lib/monthly-payments-ops.ts:229`](../../src/lib/monthly-payments-ops.ts#L229)
  immediately updates the period status with that single-reference result.

#### Why this matters

This conflicts with the read model, which now correctly aggregates all matched
references on the row:

- [`src/lib/monthly-payments.ts:250`](../../src/lib/monthly-payments.ts#L250)
  sums `matchedReferences`
- [`src/lib/monthly-payments.ts:282`](../../src/lib/monthly-payments.ts#L282)
  derives `partial`
- [`src/lib/monthly-payments.ts:268`](../../src/lib/monthly-payments.ts#L268)
  derives exact coverage from the aggregate

So the units table can tell the truth from aggregated data while the underlying
period status was last overwritten by only the most recently matched reference.

#### Operator impact

- Two smaller payments for one month can still leave the period in the wrong
  workflow state.
- A later match can overwrite a previously correct state.
- Dashboard and write-side actions become harder to trust because the row truth
  and persisted period truth are no longer the same thing.

## 2. [High] Sign-off and reverse-sign-off still treat one reference as the whole month

The write-side sign-off flow still decides `paid` vs `partial` from one matched
reference, and reverse-sign-off resets the entire period to `unpaid`
unconditionally.

#### Evidence

- [`src/lib/monthly-payments-ops.ts:398`](../../src/lib/monthly-payments-ops.ts#L398)
  loads the period for sign-off.
- [`src/lib/monthly-payments-ops.ts:406`](../../src/lib/monthly-payments-ops.ts#L406)
  uses the current reference amount only.
- [`src/lib/monthly-payments-ops.ts:410`](../../src/lib/monthly-payments-ops.ts#L410)
  subtracts deposit contributions only for that reference.
- [`src/lib/monthly-payments-ops.ts:417`](../../src/lib/monthly-payments-ops.ts#L417)
  compares that single effective amount to the expected rent.
- [`src/lib/monthly-payments-ops.ts:421`](../../src/lib/monthly-payments-ops.ts#L421)
  sets period status to `paid` or `partial` from that one reference.

Reverse path:

- [`src/lib/monthly-payments-ops.ts:611`](../../src/lib/monthly-payments-ops.ts#L611)
  loads the current period.
- [`src/lib/monthly-payments-ops.ts:638`](../../src/lib/monthly-payments-ops.ts#L638)
  updates the period.
- [`src/lib/monthly-payments-ops.ts:641`](../../src/lib/monthly-payments-ops.ts#L641)
  hard-sets status to `unpaid`.

#### Why this matters

This breaks the same owner ruling in the opposite direction:

- if multiple references together cover the rent, signing off only the current
  reference may still leave the period as `partial`
- if one of several matched references is reversed, the period gets reset to
  `unpaid` even when other valid matched references remain attached

#### Operator impact

- Partial-payment workflows can drift after each action.
- Reverse flows can leave orphaned or misleading state.
- Audit events may record `unpaid` transitions that do not match the remaining
  reality on the row.

## 3. [Medium] Dashboard rollups do not use the same deposit-ledger inputs as the unit table

The new deposit split / accepted contribution logic is correctly accounted for
in the units table read model, but not in the dashboard location rollups.

#### Evidence

Units table path:

- [`src/lib/monthly-payments.ts:1514`](../../src/lib/monthly-payments.ts#L1514)
  loads `depositAmount`
- [`src/lib/monthly-payments.ts:1515`](../../src/lib/monthly-payments.ts#L1515)
  loads `depositBalance`
- [`src/lib/monthly-payments.ts:1516`](../../src/lib/monthly-payments.ts#L1516)
  aggregates `depositContributedAmount`
- [`src/lib/monthly-payments.ts:1520`](../../src/lib/monthly-payments.ts#L1520)
  passes those values into `computeUnitStatus`

Dashboard path:

- [`src/lib/monthly-payments.ts:408`](../../src/lib/monthly-payments.ts#L408)
  also calls `computeUnitStatus`
- [`src/lib/monthly-payments.ts:409`](../../src/lib/monthly-payments.ts#L409)
  through [`src/lib/monthly-payments.ts:415`](../../src/lib/monthly-payments.ts#L415)
  only passes occupancy, block state, expected amount, matched references, due
  date, and `now`
- it does not pass deposit headroom or contributed deposit amount

#### Why this matters

The units page and dashboard can now diverge after an accepted deposit split.
One view understands the split, the other still interprets the month as if the
full received amount belongs in the rent comparison.

#### Operator impact

- property cards can disagree with the units table
- paid/due/pending counts may not reconcile
- the dashboard can lose the "one money story" the product is explicitly aiming
  for

## 4. [Medium] Import-triggered auto-match is global, not scoped to the imported month/property

Every bank import currently ends with an auto-match pass over all unmatched
references unless a property scope is provided, but the import route does not
pass a property or period scope.

#### Evidence

- [`src/app/api/monthly-payments/import/route.ts:44`](../../src/app/api/monthly-payments/import/route.ts#L44)
  ensures periods for the requested `billingPeriod`
- [`src/app/api/monthly-payments/import/route.ts:49`](../../src/app/api/monthly-payments/import/route.ts#L49)
  runs `autoMatchUnmatchedReferences({ actor: 'auto-match (bank import)' })`
- [`src/app/api/monthly-payments/import/route.ts:95`](../../src/app/api/monthly-payments/import/route.ts#L95)
  does the same in `POST`

Write-side matcher:

- [`src/lib/monthly-payments-ops.ts:281`](../../src/lib/monthly-payments-ops.ts#L281)
  accepts only optional `propertyId`
- [`src/lib/monthly-payments-ops.ts:287`](../../src/lib/monthly-payments-ops.ts#L287)
  starts from all unmatched references
- [`src/lib/monthly-payments-ops.ts:292`](../../src/lib/monthly-payments-ops.ts#L292)
  scopes only when `propertyId` is present

#### Why this matters

Importing June can mutate older unmatched backlog outside the operator's
current working window. That may be intentional later, but it is not a safe
default for a manual operator action where the user expects "I imported this
month" rather than "the system reprocessed everything still unmatched."

#### Operator impact

- post-import counts can change outside the visible task
- historic backlog can move unexpectedly
- support/debugging becomes harder because one import action has cross-period
  side effects

## Open Questions / Assumptions

1. This review assumes the owner ruling in the handover is authoritative:
   `paid = signed-off only`, while period truth must still be computed from the
   full set of references attached to the period.
2. I am treating `unit_payment_periods.status` as workflow-critical state, not a
   disposable cache, because write-side actions and audit events still mutate it
   directly.
3. I have not yet verified whether Claude intentionally planned a later
   reconciliation pass to normalize period status after each match/sign-off; I do
   not currently see that pass in the touched code.

## Recommended Next Fix Order

1. Add one shared "recompute period state" path used by:
   - manual match
   - auto-match
   - sign-off
   - accept deposit split
   - reverse sign-off / unmatch
2. Make dashboard rollups reuse the same deposit-aware inputs already used by
   `readPropertyUnitsTable()`.
3. Scope import-triggered auto-match to the imported property/month by default,
   and only allow global backlog sweeps as an explicit operator/admin action.

## Short State Summary

The repo is in a strong "green but not yet trustworthy" state:

- tests pass
- build passes
- the new payment-state model is present on the read side
- but the write-side state machine still lags the model in a few important
  places

That makes this a good moment to stabilize the core period recomputation logic
before adding more UI behavior on top.
