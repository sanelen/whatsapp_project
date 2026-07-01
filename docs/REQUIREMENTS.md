Last updated: 2026-07-01

# Requirements

This turns the roadmap phases and the owner's voice-note vision into concrete,
testable requirements per capability. Pair with [ARCHITECTURE.md](./ARCHITECTURE.md)
(how it's built) and [ROADMAP.md](./ROADMAP.md) (build order and status). Status
tags: **Shipped**, **Partial**, **Planned**.

## 1. Property Assistance (chatbot workspace)

### Functional

- FR-1.1 **Shipped** — Users can create/select an organization and property, and
  chat with a property-scoped LLM assistant (OpenAI/Anthropic/DeepSeek, switchable).
- FR-1.2 **Shipped** — Knowledge Base ingestion supports text, markdown, CSV, JSON,
  HTML, PDF, DOCX, XLS/XLSX; unsupported binaries are stored but excluded from
  retrieval (`parserStatus: 'unsupported'`).
- FR-1.3 **Shipped** — Retrieval is property-scoped by default (no cross-property
  bleed); vector search uses 768-dim embeddings with a similarity threshold.
- FR-1.4 **Shipped** — Retrieval memory mode is configurable per chatbot: `hybrid`,
  `rolling_window`, `retrieval_only`.
- FR-1.5 **Planned** — `summary_memory` mode needs a defined lifecycle (per
  conversation vs. per property; transient vs. persisted) before it can diverge from
  `hybrid`.
- FR-1.6 **Planned** — Structured property/unit details (address, maps link, rent,
  deposit, max occupants, parking, ensuite, feature tags) so the assistant can answer
  factual property questions instead of relying only on free-text KB entries. See
  [property-details.md](./roadmap/functionality/property-details.md).
- FR-1.7 **Planned** — Photo galleries in the KB with caption-based retrieval. See
  [knowledge-base-photos.md](./roadmap/functionality/knowledge-base-photos.md).

### Non-functional

- NFR-1.1 **Shipped** — Corrupt/unparseable uploads degrade gracefully (stored,
  flagged, not embedded) instead of 500ing the upload route.
- NFR-1.2 **Partial** — Large-document strategy: standard multipart upload only;
  resumable/TUS upload not yet decided as needed.
- NFR-1.3 **Planned** — Public `property-images` Storage bucket alongside the
  private `uploads` bucket. See [storage.md](./roadmap/functionality/storage.md).

## 2. Monthly Payments (operator loop)

### Functional

- FR-2.1 **Shipped** — Dashboard shows month-stepper, rolling totals, and
  per-property cards, split into `matchedCollectedAmount` vs
  `unmatchedCollectedAmount` (no more "collected but 0 paid" contradiction — this is
  a hard requirement per the 2026-07-01 UI review).
- FR-2.2 **Shipped** — Clicking a property drills into its per-unit table while
  preserving `?period=YYYY-MM` billing-window context.
- FR-2.3 **Shipped** — `+ match ref` opens a property-scoped, period-scoped
  unmatched-reference pool inline in the units table (not a separate global page).
- FR-2.4 **Shipped** — Candidate references are ranked by expected reference,
  keyword hints, regex match rules, payer text, and amount similarity.
- FR-2.5 **Shipped** — Sign-off locks a matched reference and marks the period paid;
  reverse sign-off unmatches and returns the reference to the pool, preserving an
  audit trail (`payment_match_events`).
- FR-2.6 **Shipped** — Room manager can create and edit `property_units` rows
  (label, contacts, rent, expected reference, keyword hints, regex hints,
  occupancy/blocked state).
- FR-2.7 **Partial** — Post-match/sign-off feedback: the row updates, but the "what
  just happened" confirmation is not yet strong enough (open item from the
  2026-07-01 review).
- FR-2.8 **Planned** — Deposit-split / partial-payment allocation: a payment above
  expected rent should be splittable into rent-covered + deposit-contribution
  instead of reading as a plain mismatch.
- FR-2.9 **Shipped** — Bank import pulls from Gmail and/or Google Drive, parses
  forwarded Capitec PDF notifications, and only imports `Incoming Funds` entries.
- FR-2.10 **Shipped** — Billing window is 9th-of-previous-month through
  8th-of-selected-month; manual historical pulls ignore `last_synced_at` so
  backfills aren't blocked.
- FR-2.11 **Planned** — Drive → Supabase reverse import (files dropped directly
  into a Drive month folder should flow into the dashboard, not just archive
  outbound).

### Non-functional

- NFR-2.1 **Partial** — UI density: rows/buttons/text should be sized for an
  operational tool, not a demo (2026-07-01 review flagged current UI as too large;
  a first density pass has shipped, more is needed).
- NFR-2.2 **Shipped** — Navigation safety: every payments page must expose a clear
  path back (dashboard/locations/units/room-manager/reference-pool), verified by
  `e2e/navigation-safety.spec.ts`.
- NFR-2.3 **Shipped** — State consistency: dashboard, units table, and reference
  pool must agree on totals/status for the same month — this is the highest-trust
  regression surface (see [Flow 08 / contradiction check](./testing/monthly-payments-flow-tests.md#flow-08-dashboard-contradiction-check)).

## 3. WhatsApp Tenant Assistant (planning only)

- FR-3.1 **Planned** — Guardrailed conversation flow: greet → detect intent →
  interested / servicing (deferred) / leaving → human takeover from any branch.
- FR-3.2 **Planned** — Rebuild into `src/` (Linear AUT-15 direction confirmed by
  owner) rather than reviving the removed Twilio platform as-is.
- FR-3.3 **Planned** — Reuse the existing KB/retrieval pipeline for grounded
  responses, scoped per property.

See [whatsapp-tenant-assistant.md](./roadmap/functionality/whatsapp-tenant-assistant.md)
and [tenant-conversation-flows.md](./roadmap/functionality/tenant-conversation-flows.md).

## 4. Tenant Offboarding (planning only)

- FR-4.1 **Planned** — Leaving flow: acknowledge notice → market the unit → exit
  survey → leaving requirements → proof of banking → inspection/deposit → close.

See [tenant-offboarding.md](./roadmap/functionality/tenant-offboarding.md).

## 5. Platform / production readiness

- FR-5.1 **Planned** — Vercel production environment variables set from
  `.env.local` (Linear **AUT-14**, highest-priority open platform item — prod app is
  deployed but cannot reach Supabase/LLMs without this).
- FR-5.2 **Partial** — Schema unification between `supabase/schema.sql` and
  `supabase/workspace-schema.sql` (Linear **AUT-9**).
- FR-5.3 **Planned** — Enable RLS on `public.prompt_settings` (currently disabled;
  flagged by Supabase advisor).
- FR-5.4 **Shipped** — Google OAuth + email/password auth via Supabase Auth, gating
  all routes except `/login` and `/auth/*`.

## Cross-cutting open questions

Carried from ROADMAP.md — these should be resolved before hard-coding further
behavior:

1. What exactly counts as "paid" on a dashboard card — any matched amount, fully
   matched amount, or signed-off-only?
2. Should `match ref` be a drawer, modal, or inline panel, long-term?
3. After a room-rule save, should units auto-refresh or show a manual refresh CTA?
4. Which matching rules must be case-insensitive by default?
5. `summary_memory` lifecycle (per conversation vs. per property; transient vs.
   persisted).
6. Large-file upload strategy — standard multipart vs. resumable/TUS.
