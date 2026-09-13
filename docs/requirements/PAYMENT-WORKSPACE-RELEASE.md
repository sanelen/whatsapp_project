# Payment Workspace Release Requirements

Date: 2026-09-13. Public, privacy-safe summary of the owner-reviewed payment
workspace and backend changes. Historical recordings and financial evidence
remain local; this document contains no tenant-specific acceptance evidence.

## Scope and status

The owner explicitly requested production deployment of the full payment branch
after being informed of the unresolved release findings. Deployment does not
mark financial correctness, import completeness, or security work as complete.
No live financial mutation, mailbox setting change, or migration is part of the
release verification. Existing configured mailboxes remain the source of truth.

| ID / Linear | Status | Acceptance requirement and remaining evidence |
|---|---|---|
| PAY-3 / AUT-34 | Partial | Preserve Gmail, Drive, Bank and Both imports at the top of the billing dashboard. Retain per-message/file provenance, deduplication, individual payment records, and import audit/configuration. Recovery may create unmatched references but may not sign off. Verify the first successful deployed recovery run and source completeness independently of UI tests. |
| PAY-4 / AUT-35-AUT-37 / FR-2.17 | Partial | A first-ever tenant needs no invented prior stay. Retrospective allocations resolve the appropriate stay from billing period and transaction date; ambiguous ownership requires a decision. Ending/correcting an older stay preserves its deposit, refund and audit history without transfer to the current tenant. Surplus funds only that stay's headroom and leaves the remainder held. Atomic writes, concurrent headroom protection, reliable rollback, legacy null-owned rows and refund evidence remain unverified. |
| PAY-5 / FR-2.18 | Partial | Unmatched references persist individually across billing periods. Current and previous unmatched queues stay distinct and retain original dates and period links. A full rent-reference move to the next billing cycle preserves source evidence, recalculates statuses and checks dependencies. Financial mutation E2E verification remains open. |
| PAY-6 / FR-2.19 / Linear pending | Partial | Overview, Reconcile and Properties form the operator flow. Reconcile remains the unmatched queue; allocation/sign-off stay on units. Show signed-off rent separately from pending rent. Unit filters preserve property totals. Unit history covers six cycles and navigation retains the expanded unit. Inferred property hints never become confirmed assignment. Isolated desktop/mobile UI scenarios pass; signed-in production acceptance remains. |

These rows are not new unattended financial-job authorization. The included
import schedule wakes daily at 05:00 UTC; the service applies a 72-hour cadence
gate. Its query window is three prior cycles, the active cycle and two upcoming
cycles. This is separate from Overview's six historic/current cycles plus the
next cycle. Cadence/window alignment and the first deployed run require review.

## Acceptance scenarios

1. First occupancy: match a payment to a unit with one valid stay and no prior
   tenant. Resolve ownership without inventing history or counting deposit as rent.
2. Retrospective correction: close an older stay with a corrected end date.
   An earlier payment remains attributed to that stay, not today's active tenant.
   Preserve refund/return evidence separately; a refunded balance does not prove
   that another historical contribution is due.
3. Multiple payments: keep two same-cycle receipts distinct. Allocate combined
   surplus up to the resolved stay's deposit headroom; retain the remainder as
   held credit. Never merge or replace the rent receipt.
4. Failure/concurrency: inject failures at every write boundary and duplicate
   concurrent requests. Require no active residue, no oversubscribed credit or
   deposit, and a useful domain conflict response. This gate is not yet passed.
5. Reversal: reverse only actual source-payment/stay dependencies, preserve the
   audit trail, and return an eligible reference to its original unmatched pool.
6. Import controls: changing Gmail/Drive/Bank/Both selection does not import;
   explicit Import retains the selected cycle/source and existing pull-all rules.
   Test provider calls only in an isolated environment or an approved import run.

## Release limitations

- `resolveOverpayment` and `allocateUnitCredit` use separate database requests
  and compensating updates. Some rollback errors are ignored. A build or pure
  ownership test does not prove transaction safety.
- Five surplus-credit and two match-feedback E2E cases remain `test.fixme`.
- The runtime dependency audit reported 24 affected package nodes (one critical
  aggregate, 18 high, five moderate). These are dependency findings, not proof of
  24 exploitable application bugs. No force-fix or downgrade was applied.
- Existing hosted schema column checks passed without reading financial rows.
  They do not prove migration parity, constraints, or ledger data correctness.
- Linear requires reauthentication. No external issue status is marked Done.

Next engineering priority is transactional stay-owned allocation with isolated
failure/concurrency tests, followed by compatible dependency security updates.
