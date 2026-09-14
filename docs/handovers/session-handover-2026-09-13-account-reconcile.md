# Account-First Reconciliation: Increment One

Owner requested small, reviewable changes on a separate branch, not deployment.
Branch: `codex/payment-account-reconcile`, based on released main `ab6caaf`.

## Scope

- Bank-account suffix filter on Reconcile, including unknown accounts.
- Current and earlier unmatched payments remain separate, individual records.
- Counts, amounts and property summaries follow active filters.
- Switching account resets the property filter; text search remains active.
- Suffix grouping is a display aid, not proof of account identity, property or
  tenant ownership. No automatic property assignment or matching is introduced.
- Existing import, allocation, sign-off and original-period review routes remain.

## Acceptance And Verification

1. Select an account: only its receipts remain in both current and earlier queues.
2. Search or filter property: summary counts and amounts follow visible receipts.
3. Select all accounts: older unmatched receipts remain accessible.
4. Review an earlier receipt: link keeps its original billing period.
5. Unknown account receipts remain accessible rather than being dropped.

Four focused unit tests and five isolated UI scenarios on desktop/mobile passed.
UI tests intercept import calls in memory; no financial mutations were performed.
Targeted lint and whitespace checks passed. No full build or full suite run.

## Preview And Next Step

Local preview: http://localhost:3014/monthly-payments/reconcile?period=2026-09
This uses the existing shared database configuration, not a financial sandbox.
Review filtering and navigation only; financial buttons retain real effects.
No push, migration or deployment performed.

After owner acceptance, design evidence-backed suggestions and explicit match
confirmation separately from rent/deposit allocation and sign-off. Known release
financial atomicity gaps remain open; this increment does not fix them.

## Transfer Exclusion Follow-Up (14 September)

Owner confirmed an internal property-account transfer and requested transfers be
excluded from imports. Shared non-rent validation now rejects explicit transfer
transaction types and bank transfer descriptions. CSV reads the transaction-type
column when present; statement text applies the same reference guard after parsing.
Ordinary tenant EFT receipts are retained, including free-text rent references
containing the word transfer without a bank transfer signature.

All 45 bank-import tests passed, including cross-account CSV and statement-text
transfer regression cases. No live imports, deletion or financial updates were
performed. Already imported transfers remain until a separate audited cleanup;
their exact source-document provenance remains unconfirmed. Not deployed.

## Drive-First Follow-Up

Owner prioritized Gmail -> Drive -> payment ingestion, with original-cycle filing,
Drive source links and no duplicate imports. The branch now gates PDF payment
creation on a verified Drive copy, reserves a Drive ID conditionally for retry,
retains unreadable PDF evidence, and shows pending archives instead of Gmail links.
Existing payment-reference rows are no longer overwritten by routine import retry.
Failed attachments mark the message failed and prevent advancing its sync cursor.

The normal manual Gmail path falls back to Drive if it creates no new payment;
explicit scheduled message chunks do not each rescan Drive. Existing archived files
are no longer blindly skipped solely because they have an app marker. Legacy
backfill is scoped to the selected mailbox and uses the same archive checkpoint.

See [requirements](../requirements/BANK-DRIVE-FIRST.md) for **Partial** statuses and
remaining checks. No real imports or cleanup were run. Local computer-use inspection
verified Drive links in the audit without clicking financial or import actions.

## Final Local Verification (14 September)

- 272 unit/contract tests passed.
- Production build, TypeScript and six release artifact checks passed.
- Six isolated UI scenarios at desktop/mobile passed (12 combinations), including
  source links, missing archive state, original-period navigation and import controls.
- Archive checkpoint test uses a generated test PDF and mocked Google/Supabase:
  interrupted completion recovers with one Drive file; concurrent workers share
  the reserved ID; a June transaction resolves to the July cycle.
- Targeted lint and whitespace checks passed.
- Computer use confirmed existing archived files display Drive links on the local
  signed-in audit. Fresh built-app navigation correctly required sign-in; no new
  login or financial actions were performed.
- Initial build failed because dependencies were symlinked outside the worktree;
  a clean local dependency installation resolved it. Dependency vulnerabilities
  remain inherited and unresolved (npm reported 28 dependency findings).

Owner requested a hard stop by 01:00 South African time. Work was wrapped up
before that deadline and this branch's preview server stopped. No continuation
or new scheduled task was created. Other pre-existing services were left alone.
Changes remain local and uncommitted; no push, deployment or live import performed.

Next session: review the documented Partial requirements, add full Gmail-to-payment
failure tests, verify scoped provider staging behavior, then plan audited exclusion
of confirmed old transfers. Do not start by running production imports or deleting
the older records.

## Owner Preview And Branch Backup (14 September)

Computer use verified account filtering, prior-period visibility, Drive source
links and preserved dashboard import controls. The owner confirmed the observed
month change was their own interaction, not a demonstrated navigation defect.
All 272 unit/contract tests passed again. The owner authorized pushing the feature
branch; this backup is not a main merge or production deployment. End-to-end
provider verification and audited cleanup of existing transfers remain pending.
