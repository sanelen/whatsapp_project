# Rent Follow-up — owner request, 2026-11-25

Status: implemented on `codex/rent-collections-dashboard` for owner review only.
This request does not activate unattended payment repair, deployment, or messaging.

## Acceptance

- Preserve Overview and its imports. Add Rent Follow-up immediately after it.
- Select building and billing month. Lead with Overdue, Still owed, and Payments
  to review; show Rent due for the month and Rent confirmed secondarily.
- Sum saved room charges and confirmed applied rent. Each room satisfies
  expected = confirmed + outstanding. Deposits, held credit, excess, and receipts
  applied to another month cannot reduce its outstanding balance.
- Keep awaiting-signoff amounts visible and separate. Use saved due dates and
  South African calendar dates. Missing charges/dates must be visible.
- Review overdue rooms, open the selected unit/month, and return to the same
  building/month. Use existing Reconcile for unmatched payments.
- Create a compact editable management WhatsApp briefing, with overdue amount
  and count, up to five overdue room lines, dates, pending signoff, and one scoped
  review link. The operator chooses the recipient and presses Send in WhatsApp.
- Optional scheduled alerts remain disabled until recipient opt-in, provider
  template, scope, migration, and owner authorization are supplied.

## Accounting boundary

Saved `unit_payment_periods` charges are historical truth; today's rent or vacancy
does not replace them. Signed references count only against their assigned period
and unit, less active deposits and credits created from those references. Active
arrears/advance credit allocations count at their target period. Confirmed rent is
capped per room; pending receipts remain within outstanding. Gross bank receipts
retain their receipt-window meaning and are not expected to equal applied rent.

The Overview layout remains unchanged, but its shared rent figures now use these
corrected calculations. Current-period creation retains the existing reader
behavior; historical unit reads no longer create missing charges from today's rent.

## Review evidence and limits

See [full-flow review](../reviews/full-flow-review-2026-11-25-rent-follow-up.md).
Local browser evidence uses sample data and real client components. Live database
balances, authentication, financial mutations, and provider delivery were not
revalidated by this fixture. Linear mapping remains pending; no issue was changed.

## Optional post-import alerts: deployment runbook

The existing scheduled bank-reconciliation workflow calls the alert step after a
successful import. No extra cron or automation is installed. Existing cadence and
import gates remain unchanged. The initial scope is one configured building and
the current billing cycle (which rolls after the ninth), not all historical debt.

Before enabling in a reviewed environment:

1. Review/apply `20261125122956_rent_management_alert_deliveries.sql` through the
   normal migration process. It adds a service-role-only delivery ledger.
2. Obtain management recipient opt-in and an approved Meta template with four
   body variables, in order: building/month/as-of/part, totals, room lines, review
   URL. Suggested body: `Hamba rent briefing: {{1}}. {{2}} Rooms: {{3}} Review: {{4}}`.
   Keep static text below 100 characters; each parameter is single-line. The
   implementation bounds the substituted message and splits large room lists.
3. Configure `RENT_MANAGEMENT_ALERT_ORGANIZATION_ID`,
   `RENT_MANAGEMENT_ALERT_PROPERTY_ID`, `RENT_MANAGEMENT_ALERT_RECIPIENT` (country
   code and digits), `RENT_MANAGEMENT_ALERT_TEMPLATE`, optional
   `RENT_MANAGEMENT_ALERT_LANGUAGE` (default `en_US`), and an HTTPS `APP_URL`.
   Existing Meta outbound configuration/token/phone ID must also be enabled.
4. Only with owner authorization, set both `RENT_MANAGEMENT_ALERT_OPT_IN=true`
   and `RENT_MANAGEMENT_ALERTS_ENABLED=true`. Validate with an authorized test
   recipient before relying on operational delivery. Neither flag was set here.

Delivery requires a scheduled completed import less than two hours old, zero
failed/pending files, zero entries missing references, refreshed current cycle,
and complete saved charges/due dates. Property ownership is checked. A database
claim keyed by run/building/recipient/part precedes the provider request. Replays
skip claimed parts. `sent` means provider acceptance, not handset delivery.
`unknown` or an old `claimed` row requires provider/operator investigation; never
delete a claim to force retry without checking for an already-delivered message.
Alert failure does not turn a completed bank import into a failed import.

Disable by clearing `RENT_MANAGEMENT_ALERTS_ENABLED`; retain the delivery ledger.
The migration and real provider transport have not been exercised in this branch.
