Last updated: 2026-07-12

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
  `unmatchedCollectedAmount`. Dashboard percentages/bars are now the
  **operator progress** signal (`matchedCollectedAmount / expectedAmount`),
  while signed-off money remains visible as a stricter audit sub-number. This
  removes the dead-looking `0%` state when money is already matched to unit rows
  but still awaiting sign-off.
- FR-2.2 **Shipped** — Clicking a property drills into its per-unit table while
  preserving `?period=YYYY-MM` billing-window context.
- FR-2.3 **Shipped** — `+ match ref` opens a property-scoped, period-scoped
  unmatched-reference pool inline in the units table (not a separate global page).
- FR-2.4 **Shipped** — Candidate references are ranked by expected reference,
  keyword hints, regex match rules, payer text, and amount similarity.
- FR-2.5 **Shipped** — Sign-off locks a matched reference and marks the period paid;
  reverse sign-off unmatches and returns the reference to the pool, preserving an
  audit trail (`payment_match_events`). **Owner ruling 2026-07-02: "paid" means
  signed-off only, everywhere.** A full match awaiting sign-off is `pending`
  ("awaiting sign-off"), shown as its own number/pill on dashboard and units
  table, and excluded from the due/chase list. (Alternate readings — count any
  full match, or show both numbers co-equally — parked, not discarded; revisit
  if the sign-off gate becomes operationally annoying.) Period state must be
  recomputed from the **full set of matched references on that billing period**,
  never from a single reference in isolation.
- FR-2.6 **Shipped** — Room manager can create and edit `property_units` rows
  (label, contacts, rent, expected reference, keyword hints, regex hints,
  occupancy/blocked state).
- FR-2.7 **Partial** — Post-match/sign-off feedback (owner rulings 2026-07-03,
  from a live matching session):
  - FR-2.7a **Shipped 2026-07-03 (pending owner browser check)** — the match
    drawer no longer closes after a match: the candidate list stays open with
    the remaining references, and a green "Matched R X · REF → unit (awaiting
    sign-off)" confirmation shows above the list, so multi-reference sessions
    don't lose their working context after each accept.
  - FR-2.7b **Built 2026-07-04 (pending owner browser check)** —
    reference-learning prompt on sign-off: signing off a reference the unit's
    active rules would NOT have matched shows "Add this reference to
    \<unit\>'s reference list?" in the drawer. "Yes, add rule" persists a
    `reference_equals` rule (`bank_import_unit_match_hints`) via the new
    `add_match_rule` API action so next month auto-matches it; "No, just this
    once" persists nothing (owner ruling: a question, never automatic).
    References under 4 chars are never offered (same noise floor as rule
    tokens); a rule that already covers the reference suppresses the prompt.
    7 decision-rule tests in `src/lib/auto-match.test.ts`; before/after
    fixture renders in
    `docs/audits/screenshots/2026-07-04-signoff-learning-prompt-*.png`.
- FR-2.8 **Partial** — Deposit-split / partial-payment allocation (owner rulings
  2026-07-02, verified via functional tests):
  - Overpayments with a configured deposit read `overpaid` with a rent-first
    split suggestion capped at the REMAINING deposit headroom; **Accept split**
    persists it to the `deposit_contributions` ledger (running balance per unit
    toward `deposit_amount`), signs the reference off, and the row settles as
    paid. Reversal un-does the ledger entry. Fully audited
    (`deposit_split_accepted` / `deposit_split_reversed` events).
  - Under-payments read `partial` with an explicit outstanding amount; partial
    sign-off is allowed (period status `partial`) and more references can be
    matched until covered.
  - Surplus rule (owner rulings 2026-07-03, replaces the previous BLOCKED
    behavior — **Shipped 2026-07-03, pending owner browser check**. Tables
    `unit_credits` + `unit_credit_allocations` (migration 20260703140000,
    applied live); ops `allocateUnitCredit`/`reverseUnitCreditAllocation`;
    API actions `allocate_credit`/`reverse_credit_allocation`; drawer "Held
    credit" section; 7 decision-rule unit tests):
    - Surplus beyond rent + remaining deposit headroom is **held as a per-unit
      unallocated credit** (own ledger, like `deposit_contributions`); sign-off
      is no longer blocked by surplus.
    - Operator allocates credit via an explicit action to one of THREE
      destinations: (1) a short/unpaid billing period within the **last 3
      months** (arrears outside that window are not offered), (2) **next
      month's** rent (advance — one month ahead, e.g. July surplus → August),
      (3) **deposit**, only when remaining headroom > 0.
    - **Suggest only, never auto-apply** (explicit owner answer): the system
      may propose a destination, but nothing moves without the operator's
      click. Allocations must be reversible like sign-offs.
    - Live motivating case: ESSEXROOM1 July — R9,067 received, R3,800 rent,
      deposit fully funded, R1,467 surplus currently stuck.
  - Still open: tenant-visible deposit statements.
- FR-2.9 **Shipped** — Bank import pulls from Gmail and/or Google Drive, parses
  forwarded Capitec PDF notifications, and only imports `Incoming Funds` entries.
- FR-2.10 **Shipped** — Billing window is 9th-of-previous-month through
  8th-of-selected-month; manual historical pulls ignore `last_synced_at` so
  backfills aren't blocked.
- FR-2.11 **Shipped 2026-07-12** — Drive → Supabase reverse import accepts CSV and
  PDF bank statements from the controlled Bank uploads folder via `source=bank`
  (corrected 2026-07-12 review: `both` covers Gmail + the app's Drive archive
  only, so scheduled `both` imports do NOT pull the Bank uploads folder — Bank
  statement imports are an explicit operator action from the dashboard. If the
  cron should also sweep Bank uploads, that is an owner decision, not a doc fix).
  Live imports verified file hashing, timestamped archival, account/property
  routing, billing-period placement, and database/reference creation while
  skipping app-archived and previously processed files.
- FR-2.12 **Shipped 2026-07-12** — Import audit provides a read-only,
  period-scoped source-to-database ledger for Gmail PDFs, Drive bank uploads,
  and extracted transactions. It shows parser and Drive archive status, file
  provenance, database presence, and matched/signed-off unit state without
  duplicating matching controls from the reference pool.
- FR-2.13 **Shipped 2026-07-12** — Import configuration provides a read-only
  explanation of connected mailboxes, masked account/property mappings,
  parser acceptance policy, and unit matching hints. Outgoing `Account Paid
  From` notifications and statement debits are explicitly ignored. Confirmed
  internal accounts are excluded across Gmail, Drive, CSV, and PDF ingestion.
- FR-2.14 **Shipped 2026-07-12** — Import dedupe is layered: source message/file
  identity, SHA-256 file identity, transaction fingerprint, and cross-source bank
  identity. The cross-source check reconciles statement rows with Gmail/PDF
  notifications using account, transaction time/date, amount, and canonicalized
  reference so the same payment cannot be posted twice merely because it arrived
  through another source.
- FR-2.15 **Shipped 2026-07-12** — Account policy controls ingestion before unit
  matching. Property-locked accounts cannot be redirected by generic room hints;
  shared legacy accounts use account-scoped reference hints before amount hints;
  internal account `7467`, debits, transfers, merchant reservations, and interest
  received create no payment entry or reference. Ambiguous combined-room payments
  remain unmatched for operator review.

### Non-functional

- NFR-2.1 **Partial** — UI density: rows/buttons/text should be sized for an
  operational tool, not a demo (2026-07-01 review flagged current UI as too large).
  Pass 2 shipped 2026-07-03 on the units table: row height roughly halved, action
  buttons/pills no longer wrap, header/footer/reference-pool tightened — see
  `docs/audits/screenshots/2026-07-03-units-density-{before,after}.png`. Pass 2
  extended 2026-07-12 to the shared shell sidebar, locations cards, and the room
  manager (list + editor): nav cards/fonts one step down, location cards ~1/3
  shorter with buttons on one row, room rows ~20% shorter — see
  `docs/audits/screenshots/2026-07-12-{locations,room-manager}-density-{before,after}-fixture.png`
  (fixture-data renders). Completed 2026-07-12 (second slice): dashboard hub
  (inline sidebar 260→248px, nav/fonts one step down, h1 26px) and the
  reference-pool screen (table rows py-4→py-2.5, rem-scale fonts → 13px scale,
  compact month switcher and summary rail; all seven columns now fit at
  1440px) — see
  `docs/audits/screenshots/2026-07-12-{hub,reference-pool}-density-{before,after}-fixture.png`.
  Pass-2 treatment now covers every payments screen; owner sanity-check on
  localhost:3000 outstanding.
- NFR-2.2 **Shipped** — Navigation safety: every payments page must expose a clear
  path back (dashboard/locations/units/room-manager/reference-pool), verified by
  `e2e/navigation-safety.spec.ts`.
- NFR-2.3 **Shipped** — State consistency: dashboard, units table, and reference
  pool must agree on totals/status for the same month — this is the highest-trust
  regression surface (see [Flow 08 / contradiction check](./testing/monthly-payments-flow-tests.md#flow-08-dashboard-contradiction-check)).
  Concretely:
  - operator progress on the dashboard = matched-to-unit money / expected
  - audit-grade paid money = signed-off money only
  - period status is derived from all references attached to the period
- NFR-2.4 **Shipped 2026-07-13** — Dashboard and assistant surfaces share the
  approved cloud-and-powder-blue visual system: soft blue atmospheric fields,
  translucent white operational panels, deep navy navigation, sans-serif headings,
  rounded controls, restrained shadows, and consistent responsive behavior. The
  refresh preserves existing routes, data, matching, import, and chat behavior.

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

- FR-5.1 **Shipped 2026-07-13** — Required Vercel Preview/Production variables are
  configured as encrypted or sensitive values for Supabase, LLM providers, the auth
  allowlist, Gmail OAuth, and the Drive Bank Uploads folder (Linear **AUT-14**).
- FR-5.2 **Partial** — Schema unification between `supabase/schema.sql` and
  `supabase/workspace-schema.sql` (Linear **AUT-9**).
- FR-5.3 **Shipped** (2026-07-03) — RLS enabled on `public.prompt_settings` and
  direct grants revoked from `anon`/`authenticated`
  (`supabase/migrations/20260703031500_enable_rls_prompt_settings.sql`, applied
  to live project). All app access goes through the service-role client, which
  bypasses RLS. Verified live: anon role denied (42501), service_role reads
  normally, advisor ERROR finding cleared (now INFO "no policy", same as other
  service-role-only tables).
- FR-5.4 **Shipped; hardened 2026-07-13** — Google OAuth via Supabase Auth gates all
  routes except `/login` and `/auth/*`. Preview/Production additionally require the
  Google identity's normalized email to appear in the server-only
  `AUTH_ALLOWED_EMAILS` allowlist. The login UI does not expose email/password signup.
- FR-5.5 **Shipped 2026-07-13** — Every successful Google authentication lands on
  the root workspace chooser. The user explicitly
  selects **Chatbox** or **Dashboard**; protected-route redirect parameters cannot
  silently bypass this choice. The chooser also exposes a direct sign-out action.

## Cross-cutting open questions

Carried from ROADMAP.md — these should be resolved before hard-coding further
behavior:

1. ~~What exactly counts as "paid" on a dashboard card?~~ **Answered 2026-07-02 /
   clarified 2026-07-02 PM:** signed-off only is the audit-grade paid number,
   but the dashboard percentage/progress bar is operator-facing and uses matched
   unit money. Matched-awaiting-sign-off is always shown as its own labelled
   number.
2. Should `match ref` be a drawer, modal, or inline panel, long-term?
3. After a room-rule save, should units auto-refresh or show a manual refresh CTA?
4. Which matching rules must be case-insensitive by default?
5. `summary_memory` lifecycle (per conversation vs. per property; transient vs.
   persisted).
6. Large-file upload strategy — standard multipart vs. resumable/TUS.
