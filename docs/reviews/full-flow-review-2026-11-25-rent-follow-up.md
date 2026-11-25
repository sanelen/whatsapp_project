# Full-flow review: Rent Follow-up — 2026-11-25

Verdict: ready for branch review with caveats; not a production or live-alert signoff.

Scope: the added Rent Follow-up page, shared rent calculations, scoped unit and
Reconcile links, editable WhatsApp draft, and disabled post-import alert hook.
Trigger: owner-requested branch preview. Baseline: `origin/main` at `8bf8e1b`.
Branch: `codex/rent-collections-dashboard`.

## Architecture and flow

Overview → Rent Follow-up → selected overdue room → Units → Rent Follow-up is
built. Month/building survive the round trip. Payments to review leads to the
existing Reconcile screen with period/property scope. Imports stay on Overview;
no duplicate import, allocation, or signoff workflow is introduced.

The financial model uses saved charges and assigned periods, with shared room
balance calculations for dashboard and unit details. Historical vacancy/current
price cannot rewrite recorded charges. Deposits, held credits, and excess are
excluded; applied credit counts at its target. Pending remains outstanding until
confirmed. Actual saved due dates drive overdue using South African dates.
Dashboard financial reads paginate and fail on incomplete ledger reads.

Known allocation/transactional debt described in ARCHITECTURE and the payment
release requirements remains: this read-model correction does not prove atomic
allocation writes, concurrency safety, or repair historical source records.
The existing unit reader also retains older unpaginated supporting queries;
large-ledger production parity needs a real-data acceptance check before release.

## QA evidence

- `npm test`: 293 passed, zero failed.
- `npm run typecheck`: passed.
- `npm run lint`: zero errors; 11 warnings in existing unused helpers/E2E code
  and the generated workflow route.
- `npm run build`: passed, including six pamphlet checks.
- `npm run test:payments:workspace`: desktop 1440×1000 and phone 390×844 passed;
  no browser errors or horizontal overflow. Real components run with isolated
  sample fixtures and intercepted write requests.
- Financial tests cover per-room reconciliation, excess/deposits/held credit,
  applied credit, pending, date boundary, current vacancy versus historical
  charges, linked period versus receipt date, unassigned receipts, and pagination.
- Alert tests cover disabled configuration, recipient opt-in, import freshness,
  scope/completeness, chunk limits, duplicate claims, and ambiguous provider
  failure. They send no external requests.

| Flow | Verdict | Boundary |
| --- | --- | --- |
| Original Overview/import controls | Pass | Existing isolated source/pull-all request contract retained |
| Building/month totals and overdue filter | Pass | Saved synthetic charges/receipts; not a live financial audit |
| Overdue room → unit → scoped return | Pass | November room due date and balances checked |
| Compact editable management draft | Pass | Recipient validation/encoded URL inspected; WhatsApp never opened |
| Production authentication/database route | Not revalidated | Protected route uses existing requireUser boundary; build passes |
| Migration/provider send | Blocked | Migration unapplied; private routing saved, template In review, stored API token rejected |

## UI and accessibility

Reviewed the actual desktop/mobile screenshots and foreground Chrome preview.
Overview remains first; Rent Follow-up is second. Primary cards use the owner's
plain-language labels. Expected/confirmed are secondary. Pending copy explains
staff confirmation and warns against premature tenant follow-up.

Native labeled selects, keyboard-focus styles, pressed filter states, status
messages, and focused draft heading are present. Phone room rows stack without
overflow. Fixed conflicting background classes that hid the WhatsApp link and
selected filter styling. This is a manual accessibility review, not a certified
screen-reader or automated WCAG audit; design plugin skills were unavailable.

## Roadmap fit and tensions

This is owner-promoted payments scope documented in
[RENT-FOLLOW-UP.md](../requirements/RENT-FOLLOW-UP.md). It does not advance leases,
tenant messaging, or unattended financial repair. Linear mapping remains a gap;
no external issue was created or marked complete.

QA passes with fixture data, while deployment acceptance still needs live saved
charge/reference/credit parity. The Overview layout is preserved, but shared
figures intentionally change from gross receipts to applied rent; operators
should review that accounting correction. Pending receipts can be overdue under
the confirmed-balance definition, so the UI and draft explicitly say to verify
them before chasing. Scheduled alerts target the current billing cycle, which
rolls after the ninth; they are not a historical-arrears digest.

## Remaining actions, in priority order

1. Owner review of this branch and sample preview; do not infer production
   acceptance from the local fixture.
2. Before release, compare live selected-month charges, linked receipts, deposit
   exclusions and applied credits to unit totals, including a historical month.
   Review existing large-ledger query limits and transactional allocation debt.
3. Before alert activation, review/apply the migration, configure an opted-in
   recipient and approved template, then test provider receipt/failure handling
   with an explicitly authorized test destination. Follow the runbook.
4. Map the owner request to Linear when external issue updates are authorized.

## Screenshot checklist

Local artifacts: `.runtime/payment-workspace-check/` (not committed).

- [x] `collections-overdue-1440.png` — selected building/month, totals, due date.
- [x] `collections-overdue-390.png` — mobile overdue room.
- [x] `collections-draft-1440.png` and `collections-draft-390.png` — compact
  manager briefing, separate awaiting signoff, editable message, scoped URL.
- [x] `dashboard-imports-1440.png` / `dashboard-imports-390.png` — Overview intact.
- [x] Foreground Chrome opens the read-only sample preview, with visible banner
  that production is unchanged. Manage-rooms/other app routes are outside the
  fixture; this preview is not a full backend-connected app.

No push, merge, deployment, live import, migration, allocation, or message send
was performed. Optional delivery remains disabled.

## Subsequent authorized alert setup

The owner selected connected **hamba Trading info** as sender and the Hamba
Trading pamphlet number ending **4647** as the only recipient. Verified routing
is saved in ignored `.env.local` with mode 0600, opt-in true and delivery disabled.
The verified sender differs from the old local production phone setting; that
production file was not modified. No token was copied into this branch.

Submitted `hamba_management_rent_briefing` (`en_US`) through WhatsApp Manager.
Meta required Marketing categorization; the resulting list shows **In review**
and zero sends. Review samples are fictional and were not sent as a message.
The four-parameter contract and exact body are recorded in the requirements.

A read-only Graph token check failed with HTTP 401 / error 190. Consequently,
the authorized setup delivery remains blocked; no message POST was attempted.
Approval, valid selected-sender credentials, organization/building scope, the
ledger migration and reviewed deployment remain prerequisites to activation.
Configuration verification checked recipient suffix, sender identity, disabled
flag, file permissions and Git ignore coverage without exposing values. No
application code changed during this setup follow-up.
