# West Rich business-mailbox statements — 26 November 2026

Verdict: ship with coverage and refund caveats; production import/replay acceptance follows deployment.

## Scope and architecture

Owner-directed follow-up to the earlier statement intake review. Six bank-issued stamped statements arrived directly in the business destination. The existing Both workflow now reads scoped statements from that active mailbox and the configured personal source, independently validating sender, subject, internal account and statement coverage. General personal-mailbox import remains inactive. Existing daily scheduling and manager briefings are unchanged.

The search accepts the observed monthly and stamped subjects from exact bank addresses, with May 2026 as the authorized lower coverage boundary. A strict legacy monthly parser handles the May/June layout, derives coverage from the bank's monthly header, reconciles signed balances and fees, and excludes interest and outgoing transfers. Unsupported activity fails for review. Modern parsing and canonical date/amount/reference identity remain shared across reissues and overlapping statements.

The real path remains Both → source validation → private original archive → canonical bank entry → receipt → scoped room matching → manual staff sign-off. Original hashes dedupe identical PDFs; file occurrences retain mailbox/message provenance; distinct reissues retain their originals and canonical entry links. There is no new status model or screen. Existing historical allocation and legacy-account duplicate debt in ARCHITECTURE §9 remains outside this change.

## QA

- All six business originals parsed through the application's PDF extractor. May/June rendered and visually checked against extracted rows and balances.
- May: five gross credits / R9,700; June: two / R5,900; July: five / R9,100. Total newly available receipts: twelve / R24,700. May's R1,400 outgoing room refund is excluded from incoming receipts and preserved in the original evidence for staff review.
- Billing allocation by the existing cutoff: June five / R9,700; July four / R8,500; August three / R6,500.
- Personal encrypted July and business stamped July have identical five canonical identities. Business August bytes match the already archived stamped original. August–October otherwise overlap the previous ten / R21,600 receipts.
- Nine focused parser/source tests, all 336 repository tests, typecheck, production build, six build-artifact checks and targeted lint pass. Sanitized fixtures cover legacy column/balance validation, unsupported activity, account/date boundaries, exact senders, duplicate ambiguity and cross-layout identity.
- Captured a full-row baseline digest for all 78 pre-existing West Rich receipts. Live acceptance must preserve it, create only twelve receipts, verify original archives/provenance, inspect matching without sign-off, and replay with zero new receipts.

## UI, accessibility and roadmap

Existing configuration copy now describes both statement sources and latest archived coverage. No form, navigation, styling or interaction is added. Design/accessibility plugin skills are unavailable; manual review uses the current policy-card and import-audit conventions. Production browser checks remain required for rendered coverage and receipts.

This is authorized FR-2.12–2.15 / PAY-3 work. The tracker and Linear-sync gap are updated; there is still no dedicated Linear issue. No tenant communications or unrelated mailbox rules are part of this release.

## Tensions and prioritized acceptance

Local QA proves the available PDFs reconcile, but does not prove live archive/import success or November payment coverage. The latest verified statement ends 31 October even though its filename includes November. Gross incoming credits are not net rent after the outgoing refund and do not authorize staff sign-off.

1. Verify the deployed revision, live Both import, original hashes, provenance links and unchanged baseline; repeat to prove idempotency.
2. Confirm clear-reference matching remains pending, with ambiguous references retained for review.
3. Recheck newly arrived business mail before concluding November evidence remains absent.
4. Retain the existing 250-message-per-source continuation caveat and historical allocation debt.

## Production screen checklist

- [ ] Configuration shows both statement sources and coverage through 31 October.
- [ ] June–August billing audits show the twelve new canonical receipts and original links.
- [ ] West Rich receipt states retain staff sign-off; pre-existing rows match the baseline.
- [ ] Replay creates no additional receipts or archives.
