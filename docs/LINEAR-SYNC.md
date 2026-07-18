Last updated: 2026-07-18

# Linear Sync

**Live audit completed 2026-07-18.** Requirement validity and nightly eligibility
are tracked in [`REQUIREMENT-TRACKER.md`](./REQUIREMENT-TRACKER.md). Linear remains
the work-management view, but its workflow status does not override the product
requirement register.

Team: **Automatemylife** · Project: **WhatsApp Tenant Assistant Guardrails**

## Ticket ↔ roadmap map

| Ticket | Status (last known) | Maps to | Notes |
|---|---|---|---|
| AUT-9 | In Review | [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-known-architectural-debt) | Current flattened root schemas still need one clean source of truth; legacy nested-platform claims are not evidence. |
| AUT-11 | Todo | Phase 2/3 (KB) | Seed knowledge base; structure-agnostic, can run anytime. |
| AUT-13 | Done | — | Record of the 2026-05-30 deploy fix + env + DeepSeek/Node config session. |
| AUT-14 | Done | Phase 6 / [REQUIREMENTS.md FR-5.1](./REQUIREMENTS.md#5-platform--production-readiness) | Preview and Production runtime configuration and the production flow were verified. |
| AUT-15 | In Progress | Phase 7 / [REQUIREMENTS.md §3](./REQUIREMENTS.md#3-whatsapp-tenant-assistant-active-foundation) | Provider-neutral events, idempotency, delivery states, and sandbox verification remain. |
| AUT-16 | Done | [REQUIREMENTS.md FR-5.4/5.5](./REQUIREMENTS.md#5-platform--production-readiness) | Supabase Auth is Google-only with an approved-email allowlist; public legal/landing routes remain open and staff enter through `/staff`. |
| AUT-17 | Backlog | Phase 2–4 (vector retrieval) | The 768-dim upload/retrieval core is shipped; remaining breadth and race-hardening must be re-scoped. |
| AUT-7, AUT-10, AUT-12 | Backlog | [Chat/WhatsApp requirements](./requirements/CHAT-WHATSAPP.md) | Valid but dependency-gated or deferred; removed nested-platform paths are not current evidence. |
| AUT-8, AUT-29 | In Progress | [Chat/WhatsApp requirements](./requirements/CHAT-WHATSAPP.md) | Durable inbox state first, then audited takeover/manual reply/resume. |
| AUT-30 | Todo | [Chat/WhatsApp requirements](./requirements/CHAT-WHATSAPP.md) | Read-only provider/account ownership and rollback audit; no unattended cutover. |
| AUT-18 | Canceled | — | Unspecified Equal Experts reconnection request is unrelated to the approved Hamba access model. |
| AUT-20 | Done | [REQUIREMENTS.md §2](./REQUIREMENTS.md#2-monthly-payments-operations) | Payments operator loop is shipped; the umbrella ticket is closed. |
| AUT-21, AUT-22 | Backlog | Future work | Offboarding and selective HeroUI adoption remain valid but are not general nightly queues. |
| AUT-32 | In Progress | [Requirement tracker](./REQUIREMENT-TRACKER.md) | Owns the two-day requirements reconciliation and tracker hygiene. |
| AUT-33 | In Review | [REQUIREMENTS.md §2](./REQUIREMENTS.md#2-monthly-payments-operations) | PR #3 refreshes the recent-month strip and surfaces imported-but-unmatched payments; merge and production re-check remain. |

## Gaps not yet ticketed

These are called out in ROADMAP.md / REQUIREMENTS.md but have no known Linear ticket:

- Security baseline and recurring exposure review — **shipped 2026-07-13, no known
  ticket**. Google-only exact-email authorization is enforced in callback, proxy, and
  DAL; Vercel holds the allowlist as a sensitive server variable; GitHub/Vercel/
  Supabase/dependency findings are recorded in `docs/SECURITY.md`. Open owner decisions:
  make the repository private or redact operational history, and replace/isolate the
  unpatched `xlsx` parser.

- Import validation audit (REQUIREMENTS FR-2.12) — **shipped 2026-07-12** at
  `/monthly-payments/import-audit`: period/source filters, file provenance,
  parser/Drive status, transaction totals, database-presence indicators, and
  matched/signed-off unit status. Live July Drive verification after reconciliation
  showed 4 bank files, 23 accepted transactions (R56,700), 23/23 present in the
  database, and 18 matched/signed-off.

- Account-policy and cross-source reconciliation (REQUIREMENTS FR-2.14/FR-2.15) —
  **shipped 2026-07-12, no known ticket**. Includes internal account and interest
  exclusion, property locks, mixed legacy routing, and Gmail/PDF/CSV duplicate
  reconciliation. Create a Linear ticket to own future policy changes and regression
  fixtures; do not bury account decisions only in implementation notes.

- Combined-payment allocation — **open, no dedicated ticket**. One verified mixed-account
  R4,400 reference names two rooms and correctly remains unmatched. Define and build
  an explicit split workflow instead of guessing a unit.

- Import-flow browser regression coverage — **partially addressed 2026-07-12
  (review session), no known ticket**. `e2e/flow-11-import-audit-and-configuration.spec.ts`
  now covers the read-only journey (dashboard → audit → configuration →
  reference pool) plus a nav-consistency guard, safe on live data. Still open:
  seeded Playwright coverage for the mutating flow (Drive import → audit →
  reference pool → unit match, duplicate and excluded-row cases) — blocked on
  the seeded TEST property fixture.

- Unwired helper — **open, no known ticket**. `recomputePaymentPeriodStatuses`
  (monthly-payments-ops.ts) is exported but never called; either wire it into
  the import route after `ensurePaymentPeriodsForPeriod` or remove it. Also
  queued for the owner: should cron (`source=both`) sweep the Bank uploads
  folder (today only explicit `source=bank` does), and should the R1,900/R2,200
  mixed-legacy thresholds move from the CSV parser into config? See
  `docs/reviews/code-review-2026-07-12-evening-review-session.md`.

- Deposit-split / partial-payment allocation logic (REQUIREMENTS FR-2.8) —
  **mostly done 2026-07-02**: owner ruled (paid = signed-off only; deposit
  ledger per unit; partial + outstanding). Shipped: status model
  (pending/partial/overpaid), `deposit_contributions` ledger + accept-split
  action (migration applied to live Supabase), functional test suite with
  failure→action map ([functional-test-map](./testing/functional-test-map.md)).
  Remaining: surplus-beyond-deposit rule + FR-2.7 feedback strengthening.
- ~~Drive → Supabase reverse import (REQUIREMENTS FR-2.11)~~ — **shipped and live
  verified 2026-07-12** with controlled CSV/PDF Bank uploads, dedupe, archive
  versioning, property routing, and audit visibility.
- ~~RLS enablement on `public.prompt_settings` (REQUIREMENTS FR-5.3)~~ —
  **done 2026-07-03**: migration applied to live project + committed to repo;
  anon denied, service_role unaffected, advisor ERROR cleared.
- ~~Units-table UI density pass, part 2 (REQUIREMENTS NFR-2.1)~~ — **units
  table done 2026-07-03**; **shell sidebar + locations + room manager done
  2026-07-12**; **dashboard hub + reference pool done later the same day**
  (all with before/after fixture renders in `docs/audits/screenshots/`,
  typecheck + 104 tests + prod build verified). The 2026-07-12 review session
  found and fixed one screen the pass had missed (units-table sidebar, still
  260px/13.5px) — all payments screens now genuinely have the pass-2
  treatment. Gap closed pending owner sanity-check on localhost:**3001** (3000
  is SAChatbot).
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
