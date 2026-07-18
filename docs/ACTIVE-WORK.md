# Active Automated Work

Last confirmed by owner conversation: 2026-07-18

## Current status

The scheduled jobs remain active. This file defines which current requirements they
may select; it does not disable or pause them.

The active implementation workstream is the Chat/WhatsApp assistant. Its detailed
requirements and exact order are in
[`requirements/CHAT-WHATSAPP.md`](./requirements/CHAT-WHATSAPP.md). The job should
take one highest-priority unblocked **Active** requirement per run, verify existing
work before editing, and leave evidence for the next run.

The active cross-cutting review work is UI requirement reconciliation: preserve the
approved visual/navigation baseline and correct stale documentation or tests that
contradict it. This does not authorize a wholesale UI redesign.

## Approved production baseline

- Public `/` with Hamba branding, WhatsApp tenant contact, and public legal links.
- Public `/privacy`, `/terms`, and `/data-deletion`.
- Google-only staff authentication restricted by `AUTH_ALLOWED_EMAILS`.
- Protected `/staff` hub with exactly three primary destinations:
  Chatbox, Payments dashboard, and Admin console.
- Visible signed-in identity, public-site link, and logout.
- Shared cloud/powder-blue, translucent-white, deep-navy visual system.

## Active Chat/WhatsApp order

1. Durable server-only Inbox repository.
2. Audited takeover, manual reply, and resume persistence.
3. Provider-neutral webhook contracts, idempotency, delivery states, and signature
   tests.
4. Guardrailed interested-tenant assistant grounded in verified property truth.
5. Provider sandbox/test sender.
6. Production-number cutover only while the owner is present.

Items 1–5 are active in order, subject to their dependency and safety gates. Item 6
is active only as an owner-present operation and must never be performed unattended.

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
