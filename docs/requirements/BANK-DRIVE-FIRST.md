# Drive-First Bank Evidence

Owner review: 14 September 2026. Local branch only; not deployed.
This work takes priority over further matching-interface changes.

## Requirements

| ID | Status | Requirement | Remaining acceptance |
| --- | --- | --- | --- |
| BANK-DRIVE-01 | Partial | Business Gmail supplies bank attachments; Drive holds the source processed by the application. Save and verify the PDF before creating a payment. | Isolated full Gmail-to-payment integration test and controlled staging-provider verification. |
| BANK-DRIVE-02 | Partial | Use original transaction date and billing cycle, not import date. Create missing cycle/property folders; retain unreadable dates in Needs review. | Verify provider folder creation races and manual multi-period statement handling. |
| BANK-DRIVE-03 | Partial | Interrupted uploads reuse a durable file identity. Failed archival must not produce a new payment. Existing payment decisions must not be overwritten on re-import. | Full payment-write failure/concurrency tests; confirm deployed database constraints. |
| BANK-DRIVE-04 | Partial | Source-file links open Drive, never fall back to Gmail. Missing copies say Not yet saved to Drive. | Controlled source permissions check and legacy backfill. |
| BANK-DRIVE-05 | Partial | Inspect existing Drive evidence when normal Gmail import creates no payments. Preserve failures for retry instead of marking failed attachments ignored. | Scheduled chunk recovery/load test, complete historical pagination, and operator outcome checks. |
| BANK-DRIVE-06 | Partial | Exclude bank transfer transactions from rent imports; preserve evidence. | Audit and exclude previously imported internal transfers without deleting source or allocation history. |

Linear: not synchronized in this session. Last reviewed: 2026-09-14.
Nightly financial execution: not eligible. Local isolated verification only.
Dependencies: existing Google access, archive columns, file fingerprint uniqueness,
payment-reference uniqueness, and business-mailbox configuration. No migration or
provider setting change was applied.

## Scenarios

1. Late June payment imported in September: source lands in the July billing-cycle
   folder because July covers 9 June through 8 July. Its transaction date remains June.
2. Upload succeeds but checkpoint update fails: next attempt reuses the reserved
   Drive ID and verifies contents; one file is created.
3. Two archive workers race: conditional reservation selects one Drive ID; both
   workers verify the same source bytes.
4. Drive rejects upload or the stored bytes differ: fail visibly and do not proceed
   to payment processing.
5. PDF cannot be read: retain the source, label it for review, and create no payment.
6. A message has several attachments and one fails: mark the message failed and
   preserve the sync cursor so a later attempt can retry.
7. Existing payment is already matched or signed off: repeated import must not
   overwrite its amount, property, match, allocation, or approval decisions.
8. No new Gmail payments: normal manual import scans saved Drive evidence; an
   explicit Drive import remains available. Gmail failure is not treated as an
   empty inbox. Scheduled message chunks must not each scan the entire Drive tree.
9. Bank-labelled internal transfer: retain source evidence, exclude from rental
   payment ingestion. Ordinary tenant EFT payment remains eligible.
10. Old archived Gmail file: View source file in Drive opens the archive; no archive
    means an explicit pending message, never a Gmail link.

## Deliberate Limits

No production import, Drive upload, record cleanup, migration, scheduler change,
deployment or push was performed. Existing transfers remain in reconciliation.
Gmail notification processing remains PDF-focused. CSV/manual statements retain
their separate Drive-bank workflow; organizing a multi-cycle statement needs an
explicit evidence-to-many-periods design, not copying a payment into several months.
The existing scheduled job is not proven healthy by these local tests.
