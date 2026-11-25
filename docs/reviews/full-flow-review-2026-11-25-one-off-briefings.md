# Full-flow review: one-off management briefings — 2026-11-25

Verdict: local acceptance passed; ready for normal deployment and the two
owner-authorized live deliveries. Recurring scope remains unchanged.

Scope: selected current-month building → saved balances and pending receipts →
one connected-manager send → provider acceptance → separate delivery receipt.
Trigger: the owner requested one Berea and one West Rich briefing to the already
verified manager, without resending Quarry Heights or expanding recurring alerts.

## Architecture and product flow

Reuse Rent Follow-up's existing building/month selection and visible balance
breakdown. The connected send is an inline action with the fixed manager suffix
and explicit one-off wording; no new setup screen or recipient editor is needed.
The existing editable WhatsApp draft remains a separate operator-controlled path.
Dependencies (sender, opt-in, approved template, service-only ledger and source
audit) are already real and deployed. The small action meets the requested scope.

POST authenticates the allowlisted operator, requires the same browser origin,
and accepts only an explicit building UUID and month. Recipient, organization,
template, force and other overrides are rejected. The selected property must
belong to the configured organization. A copied in-memory property scope leaves
the recurring configuration unchanged. Secrets remain exclusively server-side;
the page receives only the last four recipient digits.

One-off delivery uses the latest import, never silently falling back past a newer
failed run. It accepts a completed manual or scheduled Both audit only when the
existing clean-source and two-hour freshness gates pass. The requested month must
equal the current refreshed cycle. The shared per-property daily claim, unchanged
fingerprint and uncertain-outcome block apply to manual and scheduled sends alike.
No financial mutation, schema change or new background job is introduced.

## QA and security

317 tests, production build, six artifact checks and focused lint pass. Added
coverage rejects destination/organization/template overrides, preserves recurring
scope, distinguishes explicit one-off manual audits from scheduled sends, rejects
failed/wrong-month audits, and verifies independent building claims with shared
manual/scheduled dedupe. The release service identity can exercise only the empty
validation body; it cannot authorize a real message. Every API method remains
covered by the deployment manifest, now including the no-send validation case.

Desktop 1440×1000 and phone 390×844 fixtures pass with no browser errors. The action
is absent for historical months and all-buildings scope, submits only the selected
building/month, disables repeat clicks, and distinguishes provider acceptance from
delivery. Tests intercept the request and never contact WhatsApp. Screenshot:
`.runtime/payment-workspace-check/collections-manager-390.png` (also 1440).

## UI, accessibility and roadmap fit

The inspected mobile rendering fits without overflow. Native button semantics,
visible focus styling, minimum 44px control height and textual status feedback are
retained. The action sits beneath the selected financial breakdown, with destination
suffix visible before sending. No new navigation step or hidden recipient choice.
The design-plugin lenses are applied manually; no full screen-reader certification
is claimed. React review confirms a keyed per-scope state boundary, explicit user
event for sending, no send-on-render effect, and no secrets in client props.

This is an explicit PAY-7 extension, not enrollment of new recurring properties.
FR-2.5's human sign-off boundary remains authoritative. There is no new architectural
debt beyond the existing service-only ledger and documented import limitations.
The only acceptance tension is live external delivery versus mocked local transport;
the two exact provider delivered/read events must resolve that after deployment.

## Release acceptance

Run normal revision-bound API/browser gates. Refresh only the current cycle using
Both if the latest import is failed, incomplete or stale. Send at most once for
each owner-authorized building and match each ledger provider ID to its webhook.
Record private balances/IDs only in ignored local acceptance evidence. Never retry
an uncertain send, alter the recurring property configuration or sign off receipts.
