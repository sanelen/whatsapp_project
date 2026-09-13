# Active Automated Work

Last confirmed by owner conversation: 2026-07-25

## Current status

The scheduled jobs remain active. This file defines which current requirements they
may select; it does not disable or pause them.

All job selection and completion must reconcile against
[`REQUIREMENT-TRACKER.md`](./REQUIREMENT-TRACKER.md). A Linear status or old handover
alone is not proof that a requirement is active or complete.

The active implementation workstream is the Chat/WhatsApp assistant. Its detailed
requirements and exact order are in
[`requirements/CHAT-WHATSAPP.md`](./requirements/CHAT-WHATSAPP.md). The job should
take one highest-priority unblocked **Active** requirement per run, verify existing
work before editing, and leave evidence for the next run.

The active cross-cutting review work is UI requirement reconciliation: preserve the
approved visual/navigation baseline and correct stale documentation or tests that
contradict it. This does not authorize a wholesale UI redesign.

## Approved production baseline

Owner-directed payment release (2026-09-13): full UI/backend deployment requested
with the known acceptance gaps explicitly retained. See
[payment release requirements](./requirements/PAYMENT-WORKSPACE-RELEASE.md).
This does not authorize unattended allocation repair or mark PAY-3 through PAY-6
complete. Existing Chat requirements and priority remain unchanged.

- Public `/` with Hamba branding, WhatsApp tenant contact, and public legal links.
- Public `/privacy`, `/terms`, and `/data-deletion`.
- Google-only staff authentication restricted by `AUTH_ALLOWED_EMAILS`.
- Protected `/staff` hub with exactly three primary destinations:
  Chatbox, Payments dashboard, and Admin console.
- Visible signed-in identity, public-site link, and logout.
- Shared cloud/powder-blue, translucent-white, deep-navy visual system.

## Active Chat/WhatsApp order

1. **AUT-38:** guarded prospective-renter WhatsApp journey.
2. **AUT-39:** authoritative property/room model and vector boundaries.
3. **AUT-40:** admin media plus structured-data ingestion.
4. **AUT-41:** release and sandbox coverage.
5. Production-number cutover only while the owner is present.

Local isolated-worktree status on 2026-07-25: AUT-38, AUT-39, and AUT-40 are
implemented but not delivered; AUT-41 verification is in progress. This is evidence,
not a production-status claim. Migration, commit, push, deploy, merge, provider
settings, and real customer sends remain untouched.

The first four items are active in order, subject to their dependency and safety
gates. Cutover is active only as an owner-present operation and must never be
performed unattended. The durable Inbox, audited takeover, and provider-neutral
event contracts remain required foundations and must be preserved by each slice.

## Not active unless the owner explicitly promotes it

- Old July 2 nightly payments tasks or the `codex/monthly-payments` branch.
- Tenant offboarding.
- Property photo galleries and public image storage.
- `summary_memory` or resumable/TUS uploads.
- Combined-payment allocation, import-run history, or other open payments follow-ups.
- A wholesale visual redesign.

These items may remain documented as Planned/Partial. That status is not permission
for a job to select them.

## Run rules

- Start from `origin/main` in a fresh `codex/*` worktree branch.
- Do not deploy, push, change provider settings, migrate production data, or send a
  real tenant message automatically.
- Use the linked test and validation files as the definition of done.
- When no implementation item is safely unblocked, run the next useful local
  validation/reconciliation item and update the handover; the job remains active.
