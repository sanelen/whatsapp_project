# Hamba Customer Service Docs

This folder is the planning and implementation strategy hub for the project.

## Start here

1. **[Roadmap](./ROADMAP.md)** — the single source of truth for phases and status.
2. **[Latest voice-note brief](./voice-notes/2026-06-14-la-lucia-mall-16.md)** — the
   current product vision in the owner's words.
3. **Design handoff package** — `/Users/macdaddy/Documents/DEV/design_handoff_hamba_roadmap/`
   contains the reviewed wireframe canvas and screen exports for the Phase 7 work.
4. Then dive into the themed sections below.

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
- [HeroUI adoption](./roadmap/ui/heroui.md) — standard component layer (spike done).
- [Forms enhancement protocol](./roadmap/ui/forms.md) — validation, typed inputs, uploads, accessibility, multi-step forms.

## Voice-note planning sessions

The owner plans primarily via voice notes (transcribed with `npm run transcribe`;
transcripts land here). Captured sessions:

- [2026-06-14 — La Lucia Mall](./voice-notes/2026-06-14-la-lucia-mall-16.md) — the three-capability vision: WhatsApp assistant, payments dashboard, offboarding.

## Notes

- These docs are committed with the project.
- Do not store secrets or `.env.local` values here.
- Before changing Next.js code, follow `AGENTS.md` and read the relevant local docs in `node_modules/next/dist/docs/`.
