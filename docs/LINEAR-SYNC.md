Last updated: 2026-07-04

# Linear Sync

**Connector status:** the Linear connector is installed but not yet authorized in
this environment — Claude cannot read or write live tickets until you connect it
(claude.ai connector settings, or `/mcp` in an interactive session). Everything
below is reconstructed from HANDOFF.md ticket references and should be reconciled
against live Linear once connected.

Team: **Automatemylife** · Project: **WhatsApp Tenant Assistant Guardrails**

## Ticket ↔ roadmap map

| Ticket | Status (last known) | Maps to | Notes |
|---|---|---|---|
| AUT-9 | In Review | [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-known-architectural-debt) | Schema unification (`schema.sql` vs `workspace-schema.sql`) + migration not applied. |
| AUT-11 | Todo | Phase 2/3 (KB) | Seed knowledge base; structure-agnostic, can run anytime. |
| AUT-13 | Done | — | Record of the 2026-05-30 deploy fix + env + DeepSeek/Node config session. |
| AUT-14 | Todo (Urgent) | Phase 6 / [REQUIREMENTS.md FR-5.1](./REQUIREMENTS.md#5-platform--production-readiness) | Set Vercel production env vars — highest-priority open item. |
| AUT-15 | Todo (High) | Phase 7 / [REQUIREMENTS.md FR-3.2](./REQUIREMENTS.md#3-whatsapp-tenant-assistant-planning-only) | WhatsApp/Twilio platform decision — **owner confirmed: rebuild into `src/`.** Ticket should be re-scoped to reflect this, not closed. |
| AUT-16 | Done | — | Supabase Auth (Google OAuth + email/password) shipped. |
| AUT-17 | In progress | Phase 2–4 (vector retrieval) | Document upload → 768-dim vector retrieval → grounded chat; implementation started 2026-06-04. |
| AUT-5, 7, 8, 12 | Stale (pre-flatten) | Phase 7 (WhatsApp) | All point at `SAWhatsApp/platform` paths removed in the 2026-05-30 flatten. Should be re-scoped or closed once AUT-15's rebuild starts, so they don't reference dead paths. |

## Gaps not yet ticketed

These are called out in ROADMAP.md / REQUIREMENTS.md but have no known Linear ticket:

- Deposit-split / partial-payment allocation logic (REQUIREMENTS FR-2.8) —
  **mostly done 2026-07-02**: owner ruled (paid = signed-off only; deposit
  ledger per unit; partial + outstanding). Shipped: status model
  (pending/partial/overpaid), `deposit_contributions` ledger + accept-split
  action (migration applied to live Supabase), functional test suite with
  failure→action map ([functional-test-map](./testing/functional-test-map.md)).
  Remaining: surplus-beyond-deposit rule + FR-2.7 feedback strengthening.
- Drive → Supabase reverse import (REQUIREMENTS FR-2.11) — **found already
  code-complete 2026-07-03** (source toggle → `importDrivePayments` in
  `runBankImport`); needs one live Drive pull by the owner to call it Shipped.
- ~~RLS enablement on `public.prompt_settings` (REQUIREMENTS FR-5.3)~~ —
  **done 2026-07-03**: migration applied to live project + committed to repo;
  anon denied, service_role unaffected, advisor ERROR cleared.
- ~~Units-table UI density pass, part 2 (REQUIREMENTS NFR-2.1)~~ — **units
  table done 2026-07-03** with before/after screenshots in
  `docs/audits/screenshots/`; dashboard/locations screens still pending a pass.
- Post-match/sign-off operator feedback strengthening (REQUIREMENTS FR-2.7) —
  **FR-2.7b built 2026-07-04** (nightly run): sign-off learning prompt +
  `add_match_rule` action, verified with tests (104/104), typecheck, prod
  build, and before/after fixture renders. Remaining: owner browser check of
  both FR-2.7a and FR-2.7b on a TEST room, then un-fixme
  `e2e/match-flow-feedback.spec.ts`.

## Suggested sync process going forward

1. Any new item that lands in ROADMAP.md's "Questions For Review" or a phase's
   task list gets a matching Linear ticket in the same session, or is flagged here
   under "Gaps not yet ticketed" if ticket creation isn't possible yet.
2. When a Linear ticket's scope changes materially (like AUT-15's direction), update
   this file's mapping table in the same session — don't let the two drift.
3. Session handover docs (`docs/handovers/session-handover-*.md`) should list which
   tickets they touched, mirroring the "Files touched" section already in use.
4. Once the connector is authorized, replace the "last known" statuses above with a
   live pull and remove this caveat.
