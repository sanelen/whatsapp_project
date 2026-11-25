# Rent Follow-up — owner request, 2026-11-25

Status: implemented on `codex/rent-collections-dashboard` for owner review only.
Automatic delivery remains disabled. The owner subsequently authorized private
sender/recipient routing and submission of the management template; see setup
status below. No deployment or unattended payment repair is authorized here.

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
   recipient before relying on operational delivery. The private branch routing
   now records opt-in; the delivery-enabled flag remains false.

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

## Management alert setup — 25 November 2026

The owner selected **hamba Trading info** as sender and the public Hamba Trading
pamphlet number ending **4647** as the only management recipient. Meta shows the
sender as Connected, with High quality. Its phone identifier was verified against
the phone details UI; it differs from the old locally stored production setting.
The branch's ignored, owner-readable `.env.local` records that verified sender,
recipient, `RENT_MANAGEMENT_ALERT_OPT_IN=true`, template/language and HTTPS app
origin. `RENT_MANAGEMENT_ALERTS_ENABLED=false` remains explicit. No credential was
copied and no deployed environment was changed.

Template **hamba_management_rent_briefing**, language **en_US**, was submitted in
the selected sender account. Meta required **Marketing** instead of Utility;
the initial status was **In review**, with zero messages sent. A later refresh
on the same day confirmed **Active — Quality pending**. No duplicate template
was submitted. Body contract:

```text
*Hamba rent briefing*
{{1}}
Balances: {{2}}
Rooms: {{3}}
Review: {{4}}
Verify pending receipts first.
```

The four parameters match the implementation's order above. Static text is 81
characters, within the 100-character budget. Fictional examples were supplied
only for Meta's template review, not delivered to a recipient.

The authorized one-time setup delivery was **not sent**. A read-only Graph check
rejected the existing local API token (HTTP 401, error 190). Template approval is
now verified; credential issuance requires the owner's direct Meta action. No
message POST was attempted. Before activation, supply a valid token for the
selected sender, confirm approval/category, set organization
and building scope, apply the reviewed ledger migration and deploy the reviewed
route. The production follow-up URL is not yet deployed by this branch.

Any later setup check must use only the confirmed recipient, clearly say it is a
setup test, and contain no sample financial figures. Do not substitute hello_world
or infer successful handset receipt from provider acceptance.

### Live readiness follow-up

- Meta Developer app: Hamba Tenant Assistant, Live. Its WhatsApp production
  setup selects hamba Trading info and exposes **Generate token** for a permanent
  access token. No token is present. Browser credential-handling rules require
  the owner to perform credential issuance/authorization directly; the page is
  prepared for that handoff. Never paste the resulting token into chat.
- Existing schedule: `vercel.json` requests daily checks at 05:00 UTC / 07:00
  SAST. Code gates reconciliation to 72 hours after the last start. Live database
  evidence shows scheduled completed runs on 10, 14, 18, 22 and 25 November;
  this verifies execution, not the current Vercel cron configuration. The latest
  started at 07:48 SAST and completed at 07:53 SAST on 25 November.
- Latest run audit: 36 failed/pending files, zero entries missing a payment
  reference. Despite status `completed`, these files prevent this branch's
  automatic alert. Do not bypass that safeguard or silently repair imports.
- Three properties belong to one organization. The owner context selects Quarry
  Heights as the initial branch/test scope, now saved privately. Read-only live
  dashboard checks found 18 rooms, zero missing saved charges and zero missing
  due dates for November and the current December cycle. This checks completeness;
  it does not replace accounting acceptance of confirmed-payment allocations.
- The delivery ledger returned REST 404 / PGRST205 (not available in the schema
  cache); a subsequent SQL `to_regclass` check confirms the table does not exist.
  No migration was applied. Local production-snapshot Meta/outbound
  flags are false; current deployed flags were not independently verified.
- Duplicate handling is at-most-once per run/organization/property/recipient/
  part, enforced by a primary-key claim before the provider request. Unknown
  outcomes are retained and not retried automatically. Separate scheduled runs
  may send fresh briefings. Five targeted alert tests passed in this follow-up.
- A single setup test can use the approved four-parameter body with explicit
  setup-only text and no financial figures. Do not use the developer page's
  generic integration test template. Capture the resulting provider message ID
  privately, then seek a matching delivered/read webhook in `channel_events`
  or verified handset receipt; the alert ledger's `sent` alone is insufficient.

No credential was generated, no message sent, and no production deployment,
financial mutation, schedule change or activation was performed in this check.

### Import checkpoint investigation and branch repair

All 36 audit exceptions are `pending` files, not parser failures. Each already
has one bank entry, one payment reference and a Drive archive checkpoint. Thirty
references are signed off; six are unmatched, with no partially populated
unit/period matches. Twelve parent messages retain historical Gmail per-user
quota errors; 24 are marked processed.

The duplicate attachment branch verified/recovered the receipt but never changed
the file's parser checkpoint to `parsed`. A file first seen outside a requested
billing window could therefore remain pending after a later successful recovery.
The branch now marks that checkpoint only after archive verification and receipt
recovery finish. A failure before receipt verification leaves it pending.

The regression test exercises the public mailbox importer with isolated HTTP
providers: reference-read failure, successful recovery and replay. It verifies no
financial inserts or writes to existing signed-off references. All 55 focused
import/alert tests, type checking and focused lint pass.

A single-message live recovery attempt through `importMailboxPayments` was
guarded against receipt writes, new bank entries and changes to existing entry
amounts/identity. It stopped before database mutation because the locally stored
Google OAuth client is rejected with HTTP 401 `invalid_client` (client not found).
All 36 references were re-read and remain unchanged. No direct SQL checkpoint
clearing or financial sign-off was performed; the 36 pending statuses remain.
Use valid existing Google integration credentials with the reviewed recovery
path, then require a fresh successful scheduled audit rather than rewriting the
historical reconciliation summary. Do not reconnect Google through chat secrets.

The Meta credential field was rechecked and is still empty. The production setup
page is foregrounded at **Generate token**, with browser takeover requested for
the owner's direct credential issuance. No additional building choice is needed.

### Issued credential and delivered setup test — 25 November 2026

The owner completed Meta SMS authorization and generated the sender credential.
Read-only Graph checks returned HTTP 200 for the selected sender and its approved
management template. The template has the expected four body parameters.

The owner's updated storage requirement supersedes earlier local-token plans:
**persist the new Meta token only in Vercel**, as the server-only
`RENT_MANAGEMENT_ALERT_META_ACCESS_TOKEN` Secret/sensitive production variable for the existing
`whatsapp-project`. A transient local copy made before that correction was removed
while preserving other routing settings. An exact-token scan found zero matches
in tracked working files, task artifacts and all 2,398 Git objects (including
staged/unreachable objects and history). No push, remote repository secret write,
dashboard deployment or automatic-alert activation occurred.

One authorized setup message was submitted using the token in memory only,
connected hamba Trading info, and the confirmed recipient ending 4647. The approved
`hamba_management_rent_briefing` body used these four parameters:

1. `SETUP TEST ONLY: management alert delivery check.`
2. `No financial figures are included; this is not a rent statement.`
3. `No tenant follow-up or payment action is requested.`
4. `Please confirm receipt of this setup test.`

Meta returned HTTP 200 and `accepted`. A matching `channel_events` provider-message
receipt subsequently recorded **delivered at 15:38:23 SAST** (13:38:23 UTC). This
verifies handset delivery, not that a person read it. A private attempt record
prevents this setup script from sending again. No generic integration template,
hello_world message or financial sample was sent.

Vercel persistence remains blocked by account access: the connector returns 403
for the linked project/team, lists no accessible teams, and its team authorization
helper returns 404. The browser account had no projects and no other teams. The
browser is now at GitHub sign-in to Vercel, prepared for the repository-owner
account. The immediate remaining action is the owner's personal sign-in to the
Vercel account that owns `whatsapp-project`, followed by saving the token as the
production Secret. The Meta page remains available for direct private transfer;
no secret should be pasted into chat. No new local credential file is retained.


### Production credential and authorized release follow-up

The correct signed-in Vercel account now exposes `whatsapp-project`; its project
ID matches the local Vercel link and its repository is `sanelen/whatsapp_project`.
The tested token is saved as a Production **Secret** named
`RENT_MANAGEMENT_ALERT_META_ACCESS_TOKEN`. Only name/type/scope were verified.
The existing shared `META_WHATSAPP_ACCESS_TOKEN` was preserved for other integrations.
The alert transport now requires its own complete token/sender pair, including
`RENT_MANAGEMENT_ALERT_META_PHONE_NUMBER_ID`, with no shared-credential fallback.
The token is not retained in local config or Git. The setup test must not be repeated.

The owner subsequently authorized releasing Rent Follow-up and redeploying
production. That supersedes the earlier branch-only/no-deployment instruction.
Automatic financial alerts remain disabled until ledger/import prerequisites pass.
