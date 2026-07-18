---
sessionName: "Codex Scheduled Requirements-First Work"
autoCommit: false
pushOnComplete: false
---

# Active scheduled job instructions

This job remains active. Begin with `docs/ACTIVE-WORK.md`,
`docs/REQUIREMENT-TRACKER.md`, and `docs/REQUIREMENTS.md`. For the active
Chat/WhatsApp workstream, then read
`docs/requirements/CHAT-WHATSAPP.md` and every file it names under plan, testing,
validation, and audit.

Choose exactly one highest-priority unblocked Active requirement. Verify the current
source and tests before editing so already-satisfied or superseded work is not
rebuilt. Start a fresh `codex/*` worktree branch from `origin/main`; do not revive
`codex/monthly-payments` from the historical July 2 handover.

When implementation is blocked, complete the next safe Active validation or
requirement-reconciliation item and leave a dated handover. Never send real tenant
messages, change provider settings, migrate production data, deploy, push, or cut
over a production number automatically.

Before finishing, update the selected row in `docs/REQUIREMENT-TRACKER.md` and the
matching live Linear issue with evidence and the exact remainder. Do not mark the
issue Done from an implementation claim that is absent from current `origin/main`.
