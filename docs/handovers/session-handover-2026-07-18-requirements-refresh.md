# Session Handover — Requirements and Job Inputs Refresh

Date: 2026-07-18
Branch: `codex/requirements-refresh`
Scope: documentation and scheduled-job requirement inputs; no runtime UI behavior

## Owner direction

Keep the scheduled jobs active. Review and refresh the requirements they read so
they select clean current work instead of old handovers or stale UI assumptions.

## Current product baseline

- Public landing, WhatsApp contact, and legal pages require no sign-in.
- Google-only approved staff sign-in leads to protected `/staff`.
- Staff hub contains Chatbox, Payments, and Admin, plus identity/logout.
- The shipped cloud/powder-blue and deep-navy UI is the visual foundation.

## Active automated work

Read in this order:

1. `docs/ACTIVE-WORK.md`
2. `docs/REQUIREMENTS.md`
3. `docs/requirements/CHAT-WHATSAPP.md`
4. Its linked implementation plan, flow tests, validation ledger, and discovery audit.

The Chat/WhatsApp priority remains: durable Inbox repository → persisted human
control → provider-neutral webhook/idempotency/delivery contract → guardrailed
interested-tenant path → sandbox. Production-number cutover requires the owner
present and is never unattended.

## Stale material boundary

The July 2 monthly-payments brief, removed nested platform paths, old root chooser,
password/open-signup auth, and pre-refresh visual mockups do not override current
requirements. Historical files remain evidence; they are not the active queue.

## Next scheduled run

Verify source and baseline tests, select one highest-priority unblocked Active
Chat/WhatsApp requirement, and update the current validation ledger plus a new dated
handover. If an implementation dependency is blocked, take the next safe local
validation slice without disabling the job or selecting deferred work.
