# Hamba Customer Service Docs

Last updated: 2026-07-12

This folder is the planning and implementation strategy hub for the project.

## Start here

1. **[Roadmap](./ROADMAP.md)** — the single source of truth for phases and status.
2. **[Architecture](./ARCHITECTURE.md)** — the structural view: what runs where,
   data model, and pipelines per capability.
3. **[Requirements](./REQUIREMENTS.md)** — functional/non-functional requirements
   per capability, with shipped/partial/planned status.
4. **[Linear sync](./LINEAR-SYNC.md)** — how tickets map to roadmap phases and the
   process for keeping them in sync.
5. **[Latest voice-note brief](./voice-notes/2026-06-14-la-lucia-mall-16.md)** — the
   current product vision in the owner's words.
6. **[Latest session handover](./handovers/session-handover-2026-07-12.md)** —
   implementation, live data reconciliation, verification, and restart checklist.
7. **Design handoff package** — `/Users/macdaddy/Documents/DEV/design_handoff_hamba_roadmap/`
   contains the reviewed wireframe canvas and screen exports for the Phase 7 work.
8. Then dive into the themed sections below.

## Tenant operations (current vision)

The big push: a layer above organizations with two entry points — **Chatbox**
(existing) and **Dashboard** (new) — and three tenant capabilities.

- [WhatsApp tenant assistant](./roadmap/functionality/whatsapp-tenant-assistant.md) — guardrailed LLM flow for inquiring / servicing / leaving tenants, with human takeover.
- [Tenant conversation flows](./roadmap/functionality/tenant-conversation-flows.md) — **decision trees / flow diagrams** for routing, inquiring, leaving, and human takeover.
- [Payments dashboard](./roadmap/functionality/payments-dashboard.md) — CRM-style per-unit rent tracking, reference matching, rolling totals.
- [Payments bank import notes](./roadmap/functionality/payments-bank-import.md) — observed Gmail/Capitec attachment evidence and the parser/import shape it implies.
- [Tenant offboarding](./roadmap/functionality/tenant-offboarding.md) — the "leaving" process: notice, exit survey, deposit/banking handling.

## Reviewed design flow

The June 29 design review, plus the later operator-loop review, clarified the
preferred linear flow across the planned tenant-operations work:

- **Payments**: entry layer → dashboard home → location/unit table → inline
  match/sign-off drawer inside the unit table → reverse / audit. The reviewed
  per-unit table now explicitly includes a deposit `Date` column sourced from the
  matched payment reference, and the standalone global reference-pool page is no
  longer the v1 primary path.
- **WhatsApp assistant**: greet → detect intent → interested / servicing / leaving →
  human takeover from any branch.
- **Offboarding**: acknowledge → market unit → exit survey → leaving requirements →
  proof of banking → inspection/deposit → close.

Use the roadmap docs below as the written companion to that flow; the wireframe HTML
is now the visual reference, not a separate competing plan.

## Knowledge base & data

- [Vector embeddings](./roadmap/functionality/vector-embeddings.md) — KB ingestion, pgvector retrieval, retrieval logs.
- [Property & unit details](./roadmap/functionality/property-details.md) — structured property/unit data model (image, address, price, occupants, ensuite, features).
- [Knowledge base photos](./roadmap/functionality/knowledge-base-photos.md) — photo uploads, galleries, caption-based image retrieval.
- [Supabase Storage](./roadmap/functionality/storage.md) — document vs. image buckets, access policies, provisioning.

## UI

- [UI roadmap](./roadmap/ui/README.md) — navigation, tablet layout, workspace UX.
- [Hamba hospitality visual system](./roadmap/ui/hamba-hospitality-refresh.md) —
  the shared dashboard/chatbot design language, responsive rules, and screenshot evidence.
- [HeroUI adoption](./roadmap/ui/heroui.md) — standard component layer (spike done).
- [Forms enhancement protocol](./roadmap/ui/forms.md) — validation, typed inputs, uploads, accessibility, multi-step forms.

## Testing

- [Monthly payments flow tests](./testing/monthly-payments-flow-tests.md) —
  flow-first QA and automation reference for the operator loop, room setup, and
  cross-page state checks.
- [Functional loop review — 2026-07-01](./testing/functional-loop-review-2026-07-01.md) —
  pass/fail verdicts per flow, evidence, and a screenshot checklist for owner review.

## Full flow reviews

- [Auth security baseline full-flow review — 2026-07-13](./reviews/full-flow-review-2026-07-13-auth-security-baseline.md) — Google-only allowlist enforcement, repository/deployment exposure, QA, and release caveats.
- [Monthly payments import full-flow review — 2026-07-12](./reviews/full-flow-review-2026-07-12-monthly-payments-import-flow.md) — architecture, QA, UI/accessibility, roadmap fit, tensions, and prioritized follow-ups.
- [Code + UI review — 2026-07-12 evening](./reviews/code-review-2026-07-12-evening-review-session.md) — line-level review of the day's diff, nav-consistency fixes across all seven pages, test-suite triage, and three queued owner decisions.

- **[Full flow review skill](/Users/macdaddy/Documents/DEV/HambaCustomerService/.claude/skills/full-flow-review/SKILL.md)** —
  orchestrates architecture/flow, QA, UI/UX, and a roadmap-fit check into one
  synthesized report with cross-lens tensions and a prioritized action list.
  Run before merge points, releases, and periodic health checks. Reports land
  in `docs/reviews/` (created on first run) as
  `full-flow-review-<date>-<scope-slug>.md`.

## Voice-note planning sessions

The owner plans primarily via voice notes (transcribed with `npm run transcribe`;
transcripts land here). Captured sessions:

- [2026-06-14 — La Lucia Mall](./voice-notes/2026-06-14-la-lucia-mall-16.md) — the three-capability vision: WhatsApp assistant, payments dashboard, offboarding.

## Notes

- These docs are committed with the project.
- Do not store secrets or `.env.local` values here.
- Before changing Next.js code, follow `AGENTS.md` and read the relevant local docs in `node_modules/next/dist/docs/`.
