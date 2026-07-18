# Full-flow review — requirements rebaseline

Date: 2026-07-18
Scope: whole-app requirement sources and automated-job inputs
Trigger: periodic health check after the 2026-07-17 production UI/navigation release

## Verdict

Keep the shipped UI foundation, correct the access/navigation contract, and replace
stale job inputs with current workstream requirements.

## Architecture and flow

The real flow is public `/` → optional public WhatsApp/legal content or Google staff
sign-in → protected `/staff` → Chatbox, Payments, or Admin. Older docs incorrectly
described `/` as the protected two-choice workspace and omitted Admin.

## QA and production evidence

The 2026-07-17 production walkthrough verified public pages, Google-only sign-in with
the approved account, all three protected destinations, and logout. Unit tests,
typecheck, lint, and production build passed before deployment. This review changes
documentation/job inputs only; no runtime behavior is changed.

## UI/UX

The owner approved the current cloud/powder-blue visual language as the strong base.
No competing visual direction should be inferred from old wireframes or handovers.
Future work should extend this system consistently.

## Roadmap fit

The roadmap contained valid domain ideas but incorrectly behaved like an automatic
queue. Planned and Partial now mean documented state only. `ACTIVE-WORK.md` plus the
named workstream requirement file supply the active queue.

## Stale inputs revised or superseded

- July 2 monthly-payments handover as a current job input (the scheduled jobs remain
  active).
- `codex/monthly-payments` as a mandated branch.
- 15/29 E2E target, breadcrumb task, and reference-pool task as active priorities.
- Email/password and open-signup authentication notes.
- Root workspace chooser with only Chatbox and Dashboard.
- AUT-14 production environment setup as still outstanding.

## Active work preserved

- Durable server-only Chat/WhatsApp Inbox storage.
- Audited takeover/manual reply/resume persistence.
- Provider-neutral webhook, idempotency, delivery-state, and signature contracts.
- Guardrailed interested-tenant flow, then sandbox validation.

## Deferred pending owner redefinition

Offboarding, photos, `summary_memory`, resumable uploads, combined-payment allocation,
import-run history, and other unfinished slices outside the active Chat foundation.

## Tensions between lenses

The implementation and production QA agree, but the documentation and automated-job
inputs lagged behind them. The principal risk was not broken UI; it was agents
rebuilding or reprioritizing already superseded work.

## Priority actions

1. Use `REQUIREMENTS.md` + `ACTIVE-WORK.md` + the named workstream requirements as
   the current truth set.
2. Keep scheduled jobs active and select only current Active items.
3. Reconfirm deferred requirements one slice at a time.
4. Keep historical handovers/reviews for evidence, never task selection.
