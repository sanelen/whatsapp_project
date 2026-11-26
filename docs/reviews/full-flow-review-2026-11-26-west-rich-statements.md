# West Rich account 4079 statement intake — 26 November 2026

Verdict: ship with a coverage caveat. Authorized August–October evidence reconciles; November bank evidence is still missing. Production backfill and replay passed on revision 2349031 (PR #30). A narrow follow-up corrects date presentation and late-arriving statement audit filtering.

## Scope and trigger

Owner-authorized correction of missing West Rich receipts, reviewed before release. Existing notification intake only scanned the business mailbox and its transaction-notification subject. Account 4079 monthly statements arrived in the inactive personal source mailbox. The account mapping existed but was not property-locked. No new operator journey or tenant messaging is introduced.

## Architecture and flow

The daily/manual Both workflow adds one explicit 4079 statement source using the existing source OAuth credential. The personal mailbox remains inactive for general imports. Search is restricted by bank sender, statement subject, PDF attachment, suffix and September-onward received date. One configured historical message/filename permits the August stamped original; unrelated attachments in that message are not downloaded. Every accepted PDF independently verifies the account header and statement dates.

Encrypted originals go to private Storage and the business Drive archive under Account Statements / West Rich / 4079 / statement month. Byte equality is checked before receipt creation. The parser keeps gross cash deposits, excludes interest, separates fees and checks running balances. Unknown layouts/activity and ambiguous identical same-day credits fail for review. Missing receipts are repaired on replay without replacing an existing receipt or original evidence.

A service-role-only, advisory-locked database function gives 4079 a date/amount/canonical-reference identity shared by statements, CSV imports and timed notifications. Conflicting times require review. Multiple evidence files link to every canonical entry; import-audit totals count unique entries and include cash deposits. This closes the relevant canonical-provenance debt in ARCHITECTURE §9 for the scoped source without repairing unrelated historical 9613 duplicates.

Statement matching is restricted to imported entry IDs. Transaction dates determine billing periods. Nine references identify rooms; the remaining payer-only reference stays unmatched. Staff retain sign-off and allocation decisions, including larger deposits.

## QA

- Original August unencrypted and September/October encrypted PDFs parsed locally: 10 credits, R21,600; cash deposits R7,600; interest/fees excluded.
- Billing periods: September 5 / R10,200; October 3 / R5,700; November 2 / R5,700.
- Sanitized tests cover account mismatch, corrupt balances/fees, non-rent activity, out-of-period dates, identical same-day ambiguity, stable overlap identity, property boundary and exact room outcomes.
- Database transaction verification passed overlap/retry, original file preservation, multi-file links and distinct-time rejection. All fixture changes were rolled back; no test receipts persisted.
- Existing matching persistence tests retain pending status and protect staff decisions; an added scope test proves an empty scope does no work and an explicit scope restricts entry IDs.
- Build and artifact checks passed before the final audit/UI adjustments; final CI reruns test/build on the PR revision. Targeted lint passed.
- Production acceptance: run December Both, inspect 4079 receipts and archive hashes, replay with zero added receipts, compare all 68 pre-existing West Rich receipts against baseline, and inspect import configuration/audit in the signed-in browser. Record exact release/run IDs in the PR.

## UI, accessibility and roadmap

The existing Import configuration policy area reports the scoped source and latest archived statement end date, explicitly distinguishing missing later evidence from nonpayment. Import audit retains one line per canonical transaction per source, with unique totals. Existing reference/property screens remain the matching/sign-off path. No new form, modal, navigation or styling is added; design/accessibility plugin skills were unavailable, so the existing screen conventions were reviewed manually. Verify the rendered configuration, audit links and pending receipt state after deployment.

This is an owner-promoted FR-2.12–2.15 / PAY-3 correction, not the unattended Chat roadmap queue. The separate Linear mapping remains a documented gap. Daily scheduler and 1st/7th briefing schedule are unchanged; no tenant messages are authorized.

## Tension and remaining work

A successful import proves that available evidence was processed, not that every tenant paid or that November evidence exists. The latest available 4079 statement ends 31 October. Obtain a bank-issued export covering 1–26 November (and later dates when available) before concluding nonpayment. Legacy 9613/6570 duplicate pairs and financial repairs remain outside this correction.

The strict parser intentionally stops on an unsupported future layout rather than guessing financial columns. The source has a bounded 250-message limit; exceeding it requires a reviewed continuation strategy. Secrets are production-only server variables; never commit the full account/password, original PDFs or operational email IDs.

## Production screen checklist

- [x] Import configuration: scoped 4079 policy and coverage date.
- [x] September/October/November audit: gross amounts, duplicate evidence links, correct unique totals.
- [x] West Rich receipts: nine matched pending, one unmatched, none signed off by this import.
- [x] December: no statement-backed claim beyond 31 October; November evidence gap retained.

## Live acceptance and final read-model correction

PR #30 deployed successfully; its production API and browser gates passed. The first Both run completed at 09:59 SAST with ten scoped receipts (R21,600), nine matched, one unmatched and zero sign-offs. Four original files were archived, including two August versions. The three independently downloaded originals have matching SHA-256 values in the archive records; each import/replay also downloaded and byte-compared every archive against its Gmail source before processing.

The repeat completed at 10:01 SAST: zero new entries, receipts or archives, zero matching changes and zero failures. All 68 pre-existing West Rich receipt rows retain their exact pre-run digest. Statement coverage remains 31 October; the personal mailbox remains inactive for general import. Neither run sent a manager or tenant message. The regular notification part additionally imported one newly arrived Quarry Heights receipt; it is separate from the ten-credit West Rich backfill.

Browser verification confirmed all three billing-period totals, multiple August evidence links, cash-deposit rows, the pending room payment and the unmatched payer-only receipt. It also exposed two read-model defects: UTC slicing showed midnight SAST payments one day early, and a September statement received in October appeared as a missing database record in October despite its credits belonging to September. The follow-up converts timestamps to South African dates and filters known parsed canonical evidence by transaction period, with regression tests for the 9th cutoff and overlapping statement periods. Stored receipts, original dates, allocations and sign-offs are unchanged.
