# Chat/WhatsApp Implementation Plan

Last updated: 2026-07-18
Authority: [`CHAT-WHATSAPP.md`](../requirements/CHAT-WHATSAPP.md)

## Build order

1. **CW-1 repository:** define provider-neutral records and a server-only repository;
   add idempotent persistence tests before UI work.
2. **CW-2 human control:** persist takeover/manual-reply/resume and audit events;
   prove automation cannot send while paused.
3. **CW-3 transport:** map signed webhook payloads into internal events and model
   monotonic delivery-state transitions.
4. **CW-4 assistant:** add the interested-tenant happy path using verified,
   property-scoped truth and explicit escalation.
5. **CW-5 sandbox:** validate the full local/sandbox loop and record evidence.
6. **CW-6 cutover:** owner-present operation only; never selected by an unattended
   run.

Each scheduled run takes one narrow slice from the first unfulfilled phase. It starts
from `origin/main` on a fresh `codex/*` worktree branch, runs baseline tests first,
and updates the validation ledger and a dated handover. Existing source is inspected
before implementation; a roadmap mock or old ticket is not proof of a gap.

## UI sequencing

Do not create a new Inbox/takeover surface until CW-1 and the CW-2 state contract are
tested. When UI work becomes unblocked, place it behind staff authentication and
extend the current landing/staff/workspace visual system. Keep the public landing and
three-card staff hub intact unless the owner revises that requirement.

## Safety and mutation limits

Automated runs may edit local source, tests, and documentation. They may not push,
deploy, apply production migrations, send tenant messages, change provider settings,
or cut over a production number. External blockers should move the run to the next
safe local slice, not to an unrelated roadmap item.
