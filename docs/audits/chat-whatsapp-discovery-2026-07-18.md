# Chat/WhatsApp Discovery Audit

Date: 2026-07-18
Baseline: `origin/main` after the 2026-07-17 navigation/auth release

## Findings

The scheduled job is active, but its prompt named five Chat/WhatsApp documents that
were absent from `main`. That made older handovers and general roadmap prose more
likely to drive task selection. This requirements refresh creates the missing current
contract, plan, test map, validation ledger, and audit.

Current source provides the public WhatsApp CTA, protected staff entry, exact webhook
allowlist, webhook challenge/signature verification, an existing chat/retrieval
workspace, and conversation/message schema. It does not yet provide evidence for the
durable Inbox repository, persisted human-control loop, provider idempotency/delivery
model, interested-tenant automation, or sandbox loop described by the active job.

## Requirement decisions

- Keep the job enabled and preserve its priority order.
- Make storage and human control precede new Inbox UI or automated replies.
- Use provider-neutral internal contracts; do not resurrect removed nested platform
  paths as the production architecture.
- Preserve the approved public/staff navigation and UI language.
- Keep servicing, offboarding, real sends, production migrations, deployment, and
  number cutover outside unattended work.

## Risk reduced

The job now has files at every path it is instructed to read, and those files agree
on status, build order, safety, and evidence. Historical material remains available
for context without acting as the current queue.
