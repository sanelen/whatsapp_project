# Project Handoff — HambaCustomerService (whatsapp_project)

**Last updated:** 2026-06-30 — windowed-import fix (§6d) + refresh-from-DB, categorization, dashboard visuals, Gmail→Drive archive with source toggle (§6e). Next: Drive→Supabase re-import. Prior: 2026-06-29 — monthly-payments dashboard, bank-import schema/service, Google Cloud Gmail API setup, manual import UI, and Gmail/PDF evidence captured into docs (see §6b and §12)
**Repo:** github.com/sanelen/whatsapp_project
**Local folder:** `/Users/macdaddy/Documents/DEV/HambaCustomerService`
**Working branch:** `codex/monthly-payments`
**Production branch:** `main` (currently at `2174bde`, == working branch tip)
**Vercel project:** `whatsapp-project` (team "sanele's projects") — production **READY**
**Supabase project:** `hambatrading` (ref `ddlykzackuehdexldazv`, eu-central-1, ACTIVE_HEALTHY)
**Linear project:** WhatsApp Tenant Assistant Guardrails (team Automatemylife)

> Read this top-to-bottom to resume. The "Pick up here" section at the bottom is the
> shortest path back into the work.

---

## 1. What this project is

A Next.js 16 (App Router, Turbopack) app for Hamba Trading: a multi-tenant
organization/property chatbot workspace backed by Supabase, with a knowledge-base-
grounded reply pipeline and pluggable LLM providers (OpenAI / Anthropic / DeepSeek).

> ⚠️ **Framework caveat (see `AGENTS.md`):** this is a modified Next.js with breaking
> changes vs. stock. Read `node_modules/next/dist/docs/` before writing Next code.

---

## 2. Project structure — IMPORTANT: it changed on 2026-05-30

The repo was **flattened**. This is the single biggest thing to understand.

### Before (old `main`, commit `569efde`)
Two apps living side by side under the repo root:
```
.gitignore
SAChatbot/      ← a Next.js app (package.json, src/, supabase/, ...)
SAWhatsApp/     ← Twilio WhatsApp platform + docs
  platform/                     (Next.js app: Twilio webhook, assistant pipeline)
  SESSION_HANDOFF.md
  whatsapp-progress-tracker.html
  whatsapp-system-design.html
```

### Now (current `main`, commit `2174bde`) — the flattened structure WE USE
The old **`SAChatbot/` app was promoted to the repo root**, and **`SAWhatsApp/` was
deleted entirely**.
```
package.json            ← "next": "16.2.6", engines.node "22.x"
next.config.ts  tsconfig.json  eslint.config.mjs  postcss.config.mjs
AGENTS.md  CLAUDE.md  README.md
src/
  app/
    layout.tsx  page.tsx  globals.css  favicon.ico
    api/
      chat/route.ts              ← LLM chat (OpenAI/Anthropic/DeepSeek) + KB grounding
      history/route.ts
      models/route.ts            ← model catalog + live listing per provider
      settings/prompt/route.ts
      workspace/route.ts
      kb/{search,list,upload,update,delete}/route.ts
    organizations/[organizationId]/page.tsx
    properties/[propertyId]/page.tsx
    properties/[propertyId]/chatbot/page.tsx
  lib/
    supabase.ts                  ← createClient + getPromptSettings; reads NEXT_PUBLIC_* + service role
    types.ts  workspace.ts  workspace-routes.ts
  components/workspace/workspace-route.tsx
supabase/
  schema.sql                     ← customers, conversations, messages, knowledge_base, prompt_settings, ...
  workspace-schema.sql           ← organizations, properties, property_chatbot_settings
scripts/                         ← check-runtime.mjs (predev/prebuild guard: Node >=22, npm >=10)
data/  public/
health-check.sh  start-all.sh
```

### What was REMOVED in the flatten (and is NOT in current `main`)
- The entire **`SAWhatsApp/platform`** Twilio WhatsApp app — inbound webhook
  (`app/api/webhooks/twilio/route.ts`), `lib/assistant.ts` reply pipeline, etc.
- `SAWhatsApp/SESSION_HANDOFF.md` and the two HTML tracker/design pages.
- ✅ Confirmed: **no Twilio/webhook code exists anywhere in the new `src/`.**

To recover any of it: `git show 569efde:SAWhatsApp/platform/<path>`.
This removal is tracked in **AUT-15** (decision needed — see below).

---

## 3. What we did this session (2026-05-30)

All committed to `main` (and the working branch — they're at the same tip).

| # | Change | Commit |
|---|--------|--------|
| 1 | **Fixed production deploy** — fast-forwarded `main` `569efde → 2174bde` so prod builds the flattened structure (was failing: *"No Next.js version detected"*) | (ff merge) |
| 2 | **DeepSeek API key env fallback** — `resolveApiKey()` in `chat/route.ts` + `models/route.ts` now read `DEEPSEEK_API_KEY` (was silently falling through to `OPENAI_API_KEY`) | `2deaca8` |
| 3 | **Pinned Node** `engines.node` `">=22"` → `"22.x"` (stops Vercel auto-upgrade warning) | `2174bde` |
| 4 | **Created `.env.local`** (git-ignored) with all 8 vars, **live-validated** (all HTTP 200) | (local only) |
| 5 | **Wrote this `HANDOFF.md`** | (this file) |

**Why the deploy was broken:** Vercel builds prod from `main`; `main` still had the
old nested layout with no root `package.json`, so Next.js couldn't be detected. The
flattened structure only existed on the feature branch. The fast-forward fixed it.
Latest prod deploy `dpl_7DreGY6e55NL3mmbiK1eqZFfnZbC` = **READY**.

---

## 4. Environment variables

`.env.local` (repo root, **git-ignored** via `.env.*`) — local only, validated live.

| Variable | Source | Notes |
|----------|--------|-------|
| `APP_URL` | default | `http://localhost:3000` (set to prod URL on Vercel) |
| `ANTHROPIC_API_KEY` | provided | valid |
| `OPENAI_API_KEY` | provided | valid |
| `DEEPSEEK_API_KEY` | provided | valid; base URL auto-defaults to `https://api.deepseek.com/v1` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase MCP | `https://ddlykzackuehdexldazv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase MCP | `sb_publishable_...` (preferred by app) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase MCP | legacy JWT (fallback) |
| `SUPABASE_SERVICE_ROLE_KEY` | provided | role=service_role; **server only**, bypasses RLS |

- Key-resolution order in code: DB setting (`prompt_settings.llm_api_key`) > env var.
- ⚠️ **These are NOT on Vercel yet.** `.env.local` does not deploy. Prod app cannot
  reach Supabase/LLMs until they're added in Vercel settings → **AUT-14**.

---

## 5. Linear tickets

Created/updated this session (project: WhatsApp Tenant Assistant Guardrails):

| Ticket | Status | What |
|--------|--------|------|
| **AUT-9** | In Review | Original schema issue. Added a progress comment; **left In Review** (schema unification + migration not done). |
| **AUT-13** | ✅ Done | Record of this session's deploy fix + env + DeepSeek/Node config. |
| **AUT-14** | Todo (Urgent) | **Set Vercel production env vars** — next concrete action. |
| **AUT-15** | Todo (High) | **Reconcile removed `SAWhatsApp/platform`** vs AUT-5/7/8/12 (decision needed). |
| **AUT-16** | ✅ Done | Supabase Auth shipped and dashboard wiring completed; follow-up logout/auth-test UX added locally. |

Pre-existing, now affected by the flatten (referenced in AUT-15):
- AUT-5 (analyze/stabilize WhatsApp platform), AUT-7 (greeting/intake),
  AUT-8 (human handoff / bot pause), AUT-12 (e2e Twilio validation) — all point at
  `SAWhatsApp/platform` paths that no longer exist on `main`.
- AUT-11 (seed knowledge base) — Todo, structure-agnostic.

---

## 6. Open items / not done

1. **AUT-14 — Vercel prod env vars.** Highest priority; app is deployed but blind to
   Supabase/LLMs without it. Vercel MCP can't write settings — use dashboard or `vercel env`.
2. **AUT-15 — SAWhatsApp decision.** Was dropping the Twilio platform intentional? If
   yes, re-scope/close AUT-5/7/8/12; if no, port the webhook+assistant into `src/`.
3. **AUT-9 schema work.** Unify `supabase/schema.sql` + `workspace-schema.sql`; the
   tenant-register migration is likely **not applied** to live Supabase (earlier
   integration tests 4 pass / 4 fail; `CREATE TABLE IF NOT EXISTS` skips pre-existing
   `organizations`/`properties`).
4. **Schema verification** vs live `hambatrading` — offered, not run.
5. **E2E smoke test** (`npm run dev` + real chat request) — offered, not run.
6. **`HANDOFF.md` commit** — this file may still be uncommitted; commit + push if desired.
7. **(Cosmetic)** Vercel dashboard Node version still says 24.x; build now uses 22.x
   from `engines` and logs an informational notice. Set dashboard to 22.x to silence.

### 6a. Current roadmap execution status (2026-06-14)

Work completed since the earlier handoff:

- Restored workspace top-nav dropdown behavior so organization/chatbot selection is visible in the correct screens and persisted with `localStorage`.
- Added KB roadmap docs:
  - `docs/ROADMAP.md`
  - `docs/roadmap/ui/README.md`
  - `docs/roadmap/functionality/vector-embeddings.md`
- Added a vector audit script:
  - `scripts/audit-vector-pipeline.mjs`
  - npm script `audit:vector-pipeline`
- Captured audit findings in:
  - `docs/audits/vector-pipeline-2026-06-14T19-52-40-546Z.md`
- Moved the KB system prompt editor out of the Text tab and into Settings.
- Added text chunk-settings UI in the KB Text tab footer, persisted per property in local storage, and threaded those settings into indexing metadata.

Current implementation pass now underway:

- property-scoped retrieval filters
- real multipart file ingestion
- Supabase Storage-backed uploads
- retrieval metadata returned to chat/test surfaces
- source listing and delete/info controls for KB files

Implementation landed in code (2026-06-14):

- Added KB file parsing/storage helper:
  - `src/lib/kb/sources.ts`
  - supports text, markdown, CSV, JSON, HTML, PDF, DOCX, and XLS/XLSX extraction
  - unsupported binaries are stored but marked `unsupported`
- Added tests for parser/path/chunk-setting helpers:
  - `src/lib/kb/sources.test.ts`
  - expanded `src/lib/kb/vector.test.ts`
- Reworked `src/app/api/kb/upload/route.ts`:
  - now accepts `multipart/form-data`
  - uploads files to Supabase Storage bucket `uploads`
  - stores under `{organizationId}/{propertyId}/{sourceId}/{fileName}`
  - persists parser/chunk/storage metadata
  - indexes extracted text when supported
- Updated KB list/delete/search routes:
  - property-scoped listing
  - source deletion clears storage objects and KB rows
  - search now accepts property filters and returns `source_id` / `chunk_count`
- Added retrieval settings to property chatbot settings model:
  - `retrieval_top_k`
  - `retrieval_similarity_threshold`
  - `retrieval_memory_mode`
  - `retrieval_history_window`
- Added migrations:
  - `supabase/migrations/20260614102000_scope_knowledge_vector_matches.sql`
  - `supabase/migrations/20260614103000_add_retrieval_settings_to_property_chatbots.sql`
- Updated workspace/chat UI:
  - KB File tab now uses real multipart upload
  - file sources show info + delete controls
  - chatbot sends `propertyId` + retrieval settings to `/api/chat`
  - retrieval settings are editable from the Retrieval section
  - latest retrieval results are surfaced in the Retrieval panel

Blocker — RESOLVED (2026-06-14):

- The live Supabase DB was behind the code: it had only 2 migrations applied and
  `property_chatbot_settings` was missing the 4 retrieval columns, so the workspace
  load failed with
  `Failed to load chatbot settings: column property_chatbot_settings.retrieval_top_k does not exist`.
- Both pending migrations were applied to live `hambatrading` / `ddlykzackuehdexldazv`
  (via Supabase MCP `apply_migration`, with explicit owner authorization):
  - `20260614102000_scope_knowledge_vector_matches.sql` — `match_knowledge_vectors`
    now takes `filter_organization_id` / `filter_property_id` (6-arg signature verified).
  - `20260614103000_add_retrieval_settings_to_property_chatbots.sql` — added
    `retrieval_top_k` (5), `retrieval_similarity_threshold` (0.200),
    `retrieval_memory_mode` ('hybrid'), `retrieval_history_window` (20). Verified present.
- Verified end-to-end: `npm test` 40/40, `npm run typecheck` clean. The running dev
  server returns `GET /api/workspace -> 200` and the payload now carries the property's
  `chatbot.retrievalTopK/SimilarityThreshold/MemoryMode/HistoryWindow` (5 / 0.2 /
  hybrid / 20). The original column error is gone.

KB pipeline hardening — COMPLETED (2026-06-14, same session):

### 6b. Payments dashboard and bank-import progress (2026-06-29)

Work completed in the current monthly-payments pass:

- Added the entry-layer split on the home screen so the product now branches into
  `Chatbox` and `Dashboard`.
- Reworked the monthly-payments UI toward the reviewed wireframes while keeping the
  current design language.
- Added the Supabase tables behind the dashboard model:
  - `property_units`
  - `unit_payment_periods`
  - `payment_references`
- Added the Supabase tables behind the bank-email ingestion model:
  - `bank_import_mailboxes`
  - `bank_import_messages`
  - `bank_import_files`
  - `bank_import_entries`
- Applied both new migration sets to the live Supabase project
  `ddlykzackuehdexldazv`.
- Replaced the earlier local-data monthly payments flow with Supabase-backed
  dashboard snapshot logic.
- Captured a Record and Replay session against the real Gmail source and documented
  the observed Capitec attachment pattern plus the visible PDF fields in
  `docs/roadmap/functionality/payments-bank-import.md`.
- Follow-up owner walkthrough clarified the first business rules for interpretation:
  - only `Incoming Funds` should be imported into the payment-reference flow
  - destination account `6088` maps to Quarry Heights
  - destination account `7904` maps to Essex / Berea
  - reference strings, amount received, and actioned datetime are important
  - available balance can be stored but is not operationally important for matching
- A second implementation pass executed the backend import plan:
  - added migration `supabase/migrations/20260629213000_add_bank_import_lookup_tables.sql`
  - applied it live to Supabase project `ddlykzackuehdexldazv`
  - added lookup tables:
    - `bank_import_property_mappings`
    - `bank_import_unit_match_hints`
  - extended import/reference schema with:
    - `bank_import_entries.transaction_type`
    - `bank_import_entries.destination_account_suffix`
    - `bank_import_entries.available_balance`
    - `payment_references.bank_import_entry_id`
  - seeded live lookup/mailbox rows:
    - mailbox `info.hambatrading@gmail.com`
    - property/account mapping `7904 => Essex / Berea` (bound to live property `berea`)
    - property/account mapping `6088 => Quarry Heights` (currently unbound; no live property row yet)
  - added server import service:
    - `src/lib/bank-import.ts`
    - handles Gmail fetch, forwarded `.eml` extraction, Capitec PDF parsing, lookup resolution, and persistence into `bank_import_*` + `payment_references`
  - added protected trigger route:
    - `src/app/api/monthly-payments/import/route.ts`
    - supports manual authenticated calls and cron-style bearer-secret calls
    - accepts `billingPeriod` (`YYYY-MM`) and `pullAll`; selected periods use the
      Hamba working window of previous-month 9th through selected-month 8th
  - added protected Google Cloud Gmail API setup/status route:
    - `src/app/api/monthly-payments/import/google-cloud/route.ts`
    - supports Google Cloud OAuth refresh-token setup for the observed
      `info.hambatrading@gmail.com` inbox, while leaving service-account delegation
      available for Google Workspace/domain-wide setups
  - added test coverage:
    - `src/lib/bank-import.test.ts`
    - current suite total: **52 passing tests**
- Added the first manual import UI to `/monthly-payments`:
  - `src/components/monthly-payments/bank-import-controls.tsx`
  - Google Cloud configuration status and setup action
  - month selector
  - `Pull everything` toggle
  - `Import` button
  - success/error summary
- Billing period rule now implemented in the importer:
  - May 2026 = 2026-04-09 through 2026-05-08
  - June 2026 = 2026-05-09 through 2026-06-08
  - manual historical month pulls ignore `last_synced_at` so backfills are not
    blocked by a later latest-data sync

Important nuance from the recording:

- The capture is strong enough to define the import/parser shape.
- It is **not** strong enough to preserve a clean location-by-file mapping from the
  spoken narration. If that mapping matters for historical backfill, record one
  tighter follow-up pass or upload representative files directly.

Current blocker for live import execution:

- The route and service are working and call Google's Gmail API directly from the
  app runtime using Google Cloud credentials; mailbox data is not pulled through an
  app connector.
- A mailbox inspection confirmed Capitec messages with forwarded `message/rfc822`
  attachments; one sample was
  `Capitec Business Transaction Notification - 36683Capitec.pdf`.
- Actual app/runtime Gmail pulls are blocked until either OAuth or service-account
  env vars are present in the runtime.
- Preferred OAuth env for this mailbox:
  - `GMAIL_OAUTH_CLIENT_ID`
  - `GMAIL_OAUTH_CLIENT_SECRET`
  - `GMAIL_OAUTH_REFRESH_TOKEN`
- Alternative service-account env:
  - `GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL`
  - `GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY`
- Verified current failure mode:
  - `POST /api/monthly-payments/import` with a selected billing period returns
    `Missing Gmail auth env...` until one of the auth paths above is configured.

Verified this session:

- `npm run typecheck` — clean
- `npm test` — **52/52 passing**
- Supabase live verification:
  - new tables exist
  - mailbox seed row exists
  - property mappings exist for `6088` and `7904`

Security advisory surfaced by Supabase after verification:

- `public.prompt_settings` still has RLS disabled.
- Supabase remediation doc:
  [RLS Disabled in Public](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public)

A fresh `npm run audit:vector-pipeline` after the migrations surfaced a regression and
several audit-script staleness issues. All fixed; the audit now reports **0 findings /
32 checks** (`docs/audits/vector-pipeline-2026-06-14T20-55-00-371Z.md`).

- **Upload route regression fixed.** `src/lib/kb/sources.ts` imported `pdf-parse`
  (→ `pdfjs-dist`) at module scope, which crashed the Next server runtime with
  `TypeError: Object.defineProperty called on non-object`, 500-ing **every** upload
  (even plain text). Heavy parsers (`pdf-parse`, `mammoth`, `xlsx`) are now lazy
  `await import(...)`ed inside their format branches, and `next.config.ts` lists them
  under `serverExternalPackages`.
- **Corrupt/invalid documents degrade gracefully.** PDF/DOCX/XLSX parse failures are
  caught (`unparseableFile`) → the file is still stored in Supabase Storage but flagged
  `parserStatus: 'unsupported'` and skipped for embedding, instead of 500-ing.
- **Chat route no longer self-calls over HTTP.** It imported a `retrieveKnowledge`
  helper (new, in `src/lib/kb/vector.ts`: vector search + scoped text fallback) and
  calls it directly with the admin client, removing the `fetch(${APP_URL}/api/kb/search)`
  internal round-trip (auth/hostname coupling). `/api/kb/search` uses the same helper.
- **Retrieval memory modes implemented** in `src/app/api/chat/route.ts`:
  `hybrid` (history + KB), `rolling_window` (history only, retrieval skipped),
  `retrieval_only` (latest user turn + KB). `summary_memory` falls back to `hybrid`
  pending the lifecycle decision below. Verified live: hybrid → `retrieval: vector`,
  rolling_window → no retrieval.
- **Audit script made accurate.** `scripts/audit-vector-pipeline.mjs` now sends the
  required `organizationId`/`propertyId` on multipart uploads, asserts storage paths and
  parser types, adds a property-scope cross-bleed isolation test, and replaces three
  previously-hardcoded findings with dynamic checks.
- Final checks: `npm run typecheck` clean, `npm test` 40/40, `npm run build` ✓.

### 6b. Open questions requiring review before hard-coding behavior

These are noted in `docs/ROADMAP.md` as well:

1. Unsupported binaries such as `.exe`:
   storage is straightforward, but text embedding is not. Current safest assumption is to store them and mark indexing status `unsupported`.
2. `summary_memory` semantics:
   label is clear, implementation is not. We still need a decision on whether summaries are per conversation, per property, transient, or persisted.
3. Large-document strategy:
   standard multipart uploads are fine for the first pass, but resumable uploads may be needed if large files are expected regularly.

### 6c. Design-handoff review and payments branch status (2026-06-29)

The sibling folder `/Users/macdaddy/Documents/DEV/design_handoff_hamba_roadmap/`
has now been reviewed and should be treated as the visual reference for Phase 7.

What it clarified:

- **Payments preferred flow:** entry layer → dashboard home → per-unit table →
  reference-pool match/sign-off → unit detail drawer with reverse sign-off.
- **WhatsApp preferred flow:** greet → detect intent → interested / servicing /
  leaving → human takeover from any branch.
- **Offboarding preferred flow:** acknowledge → market unit → exit survey →
  leaving requirements → proof of banking → inspection/deposit → close.

What changed in code on `codex/monthly-payments`:

- `/` now splits into **Property Assistance** and **Monthly Payments**
- `/property-assistance` preserves the existing `WorkspaceRoute`
- `/monthly-payments` is live with a local-data admin workspace
- buildings/units are currently stored in `data/monthly-payments-buildings.json`
- server actions support create/update/delete for building setup

Important nuance:

- The roadmap docs previously said payments was planning-only.
- That is no longer true in a strict sense: a first implementation pass exists, but
  it is still prototype-grade and not yet backed by Supabase payments tables.

### 6d. Fix — windowed import returned "0 messages" (2026-06-30)

Symptom: clicking **Import** on `/monthly-payments` for a selected month (e.g. Jun)
returned `Imported 0 references from 0 messages`, even though a prior **Pull everything**
run had already populated the DB (20 messages, 9 entries, 9 payment references).

Root cause: `buildGmailSearchQuery` (`src/lib/bank-import.ts`) scoped the Gmail search by
**email received-date** using a tight `after:`/`before:` pair around the billing window.
But Capitec notifications are **forwarded** into `info.hambatrading@gmail.com`, so a
message's Gmail received-date is the *forward* date — weeks after the transaction. The
20 forwarded mails were received **2026-06-12 … 06-29**; the Jun window's Gmail filter
(`after:2026/05/08 before:2026/06/09`) excluded all of them → 0 messages scanned. The
service already re-filters parsed PDFs by true transaction date
(`isEntryInsideBillingWindow`), so the received-date window was redundant *and* harmful.

Fix: for billing-window runs, drop the `before:` received-date guard and keep only a
generous `after:` floor (window start − 1 day) to bound API volume. A forward can never
arrive before the transaction, so received-date ≥ window start; transaction-date scoping
happens downstream. `Pull everything` (no window) is unchanged.

- Changed: `src/lib/bank-import.ts` (`buildGmailSearchQuery` billing-window branch).
- Tests: updated `src/lib/bank-import.test.ts` (now asserts the `after:` floor and the
  absence of any `before:` guard). `gmailBeforeDate` is still computed on `BillingWindow`
  but no longer used in the query — left in place for compatibility.
- Verified: `npm run typecheck` clean; the two query functions exercised directly via
  Node type-stripping produce `has:attachment subject:"…" after:<floor>` with no `before:`.
  (`npm test` could not run in the Linux sandbox — repo `node_modules` carries the macOS
  esbuild binary; run `npm test` on the Mac to confirm the suite.)

Important follow-on for the operator: the existing 9 transactions are dated **Jun 12–27**,
which fall in the **July** billing period (Jun 9 – Jul 8) under the 9th-to-8th rule, not
June. To import them, select **Jul**. Open question worth confirming with the owner:
whether the month *label* shown in the UI should match this 9th-to-8th window or the
calendar month the rent is "for".

Not yet done: account `6088` (Quarry Heights) still has no bound `property_id`, so its
entries import as an inferred/unresolved location (see §8 step 5).

### 6e. Refresh-from-DB, categorization, dashboard visuals, Drive archive (2026-06-30)

Shipped in the same session as §6d (all on `codex/monthly-payments`, verified live in the
browser at `localhost:3001`):

- **Refresh no longer imports.** The Recent-Months "Refresh" button was triggering a Gmail
  import (`runRequestToken` → `runImport`). It now calls `router.refresh()` to re-read the
  dashboard snapshot from the DB. A successful Import also refreshes the dashboard.
  (`monthly-payments-hub.tsx`, `bank-import-controls.tsx` → `onImported`.)
- **Categorization.** Created live property `Quarry Heights` and bound account `6088` to it;
  created `West Rich` and bound account `4079` (proactive — no 4079 txns yet); backfilled
  `property_id` on existing entries + payment_references. Account map is now
  `7904 → Essex / Berea (property "berea")`, `6088 → Quarry Heights`, `4079 → West Rich`.
- **Dashboard visuals when no expected target exists.** Collected money was invisible because
  every %/bar was `collected ÷ expected` with expected = 0. Now: rolling-total + location
  badges show `—` (not a misleading 0%) and bars fill from collected money; month cards show
  the collected **rand** (e.g. `R21k`) with mini-bars sized by collected vs the busiest month.
  Exposed `collectedAmount`/`expectedAmount` per month in `MonthlyPaymentsMonthSummary`
  (`monthly-payments.ts`, `monthly-payments-hub.tsx`).
- **Bank-import source toggle + Gmail→Drive archive.**
  - Added a `getBillingPeriodForDate` helper (inverse of `getBillingWindowForPeriod`); unit-checked.
  - New segmented **Gmail | Drive | Both** control in the import panel (`source` param threaded
    through `/api/monthly-payments/import` → `runBankImport`).
  - New `src/lib/google-drive.ts` (drive.file REST client: ensure-folder-path, multipart
    upload, list, download).
  - `archiveStoredFilesToDrive()` in `bank-import.ts` mirrors every stored PDF into
    `Hamba Trading Bank Files / <billing-period> / <building>`, **re-parsing each PDF** for its
    own date+account (the entry↔file link is lossy), deduped via new
    `bank_import_files.drive_file_id` / `drive_folder_path` / `drive_archived_at` columns
    (migration `add_drive_archive_tracking_to_bank_import_files`). Idempotent.
  - **OAuth scope expanded** to include `drive.file`; re-consented via browser as
    `info.hambatrading@gmail.com`; new refresh token stored in `.env.local` (Next auto-reloaded
    it — no manual restart needed).
  - **Enabled the Google Drive API** in Cloud project `hamba-customer-service` (1012541406349) —
    it was off (only Gmail API was on); that was the only thing blocking uploads.
  - **Verified live:** ran source=Drive → all **44/44** files archived into month/building
    folders (Feb→Jul; re-parsing surfaced months the dashboard doesn't show because they had no
    linked entries). On-screen: "44 files archived to Drive".

Data-quality note from this session: 9 June files were mislabeled `parser_status='failed'`
(stale ON CONFLICT error from before a unique constraint existed) — flipped back to `parsed`
since their entries/references were already correct. Only **2** PDFs are genuinely unparseable
(`22185Capitec.pdf`, `74037Capitec.pdf`, forwarded 12 Jun) → they sit in `Uncategorized`.

Folder-name note: account `7904` archives under **"Essex Berea"** (slash stripped from the
mapping's "Essex / Berea"). Rename if "Berea Essex" is preferred.

#### Pick up here next (Drive → Supabase re-import)
The reverse direction is the open piece: read PDFs **back from the Drive month folders into
Supabase** (so files manually dropped into Drive flow into the dashboard). Needs a nullable
`bank_import_files.message_id` (Drive-sourced files have no Gmail message) and a small refactor
to share the per-PDF parse/upsert path between the Gmail and Drive importers. The `source='drive'`
branch currently only *builds/syncs* the archive.

### 6f. Match & sign-off data model (per-unit table) — schema created 2026-06-30

The next section is the **per-unit table / match & sign-off** view
(`Hamba Trading › <Property> › Units`, columns: Unit · Contact · Exp R · Reference ·
Recv R · Status · action). Most of it was already modelled; this session added the
remaining schema. **DB only — UI/server actions are the next build.**

How the wireframe maps to tables:

- **Unit row** → `property_units`: `label` (Unit), `contact_primary`/`contact_secondary`
  (the two phone numbers), `rent_amount` (Exp R), `expected_reference` + `match_keywords[]`
  (auto-match hints), `is_blocked` (→ blocked/excluded row), `display_order`.
- **Per-period cell** → `unit_payment_periods`: `expected_amount`, `status`, `is_blocked`,
  `note`, and new **`due_date`** (drives "overdue Nd").
- **Reference / Recv R / sign-off** → `payment_references`: a reference is **matched** by
  setting `unit_id` + `unit_payment_period_id`; **signed off** via `signed_off` /
  `signed_off_at` / `signed_off_by` (signed_off == the 🔒 "locked"). New provenance:
  **`matched_at`, `matched_by`, `match_method`** (`manual|auto_reference|auto_keyword|auto_amount`).
- **"all logged" + Reverse sign-off** → new append-only **`payment_match_events`**
  (event_type: `matched|unmatched|signed_off|reverse_signed_off|blocked|unblocked|status_changed|note_added`,
  plus actor + reference/amount/status snapshots). FKs are ON DELETE SET NULL so the log
  survives deletes; RLS enabled (admin/service-role bypasses, like the other dashboard tables).

State machine the server actions should implement:

1. **Match**: set `unit_id`/`unit_payment_period_id`/`matched_*` on a pool reference →
   log `matched`. Status derives: recv==exp → ready to sign; recv≠exp → `mismatch`.
2. **Sign off**: `signed_off=true`, stamp `signed_off_at/by` → period `status='paid'`,
   reference locked → log `signed_off`.
3. **Reverse sign-off** (sticky note): clear `signed_off` AND the match
   (`unit_id`/`unit_payment_period_id` → null) so the reference "drops back into the pool",
   the row unlocks, the period recalculates to `unpaid` → log `reverse_signed_off`.
4. **Block/unblock** a unit-period → `is_blocked` + `status` `blocked`/`excluded` → log.

Status is largely **derived** at read time (mismatch = matched recv≠exp; overdue =
unpaid past `due_date`; partial = recv<exp; paid = signed off). Store the base
(`unpaid`/`paid`/`blocked`); derive the rest in the read layer (extend
`src/lib/monthly-payments.ts`).

Migration: `supabase/migrations/20260630000000_add_match_signoff_audit.sql` (applied live as
`add_match_signoff_audit`).

> Repo/remote migration drift to fix: the Drive-archive columns from §6e were applied to the
> remote via MCP (`add_drive_archive_tracking_to_bank_import_files`) but have **no local
> migration file** yet — backfill one so `supabase/migrations/` matches the live DB.

---

## 7. Tooling / environment notes

- **`gh` CLI: NOT installed.** PRs were not creatable programmatically; pushes done via git.
- **Vercel CLI**: present (v54.x) but **not logged in**.
- **Supabase CLI**: available via `npx` but **not logged in**. The Supabase **MCP** IS
  connected (used to pull URL + publishable/anon keys; cannot read the secret service_role).
- **Vercel MCP**: connected; can read projects/deployments/logs but **cannot write
  project settings** (no env-var write tool).
- Build/runtime guard: `scripts/check-runtime.mjs` requires Node ≥22, npm ≥10
  (runs on predev/prebuild/prestart/prelint).
- Scripts: `npm run dev` (webpack), `build`, `start`, `lint`, `typecheck`, `test`
  (node --test on `src/**/*.test.ts(x)`).

---

## 8. Pick up here (fastest resume path)

1. `cd /Users/macdaddy/Documents/DEV/HambaCustomerService` — confirm branch + clean tree.
2. **Commit/push the current auth UX follow-up if desired:** files changed after the last
   commit are listed in §10 below (`/auth-test`, login messages, tests, and this handoff).
3. **Keep the docs and Linear in sync with the design review:** the reviewed flow is
   now entry layer → dashboard home → unit table → ref pool → drawer for payments,
   plus explicit WhatsApp/offboarding sequences.
4. **Configure Google Cloud Gmail API env next:** set `GMAIL_OAUTH_CLIENT_ID` and
   `GMAIL_OAUTH_CLIENT_SECRET`, use `/api/monthly-payments/import/google-cloud` or
   the dashboard Google Cloud setup action to get `GMAIL_OAUTH_REFRESH_TOKEN`, then
   run the manual import from `/monthly-payments` for May/June and inspect
   `bank_import_entries` plus `payment_references`.
5. **Bind missing property mappings:** `7904` is bound to Berea; `6088` is seeded for
   Quarry Heights but currently has no live property row id.
6. **Do AUT-14 next:** add the 8 env vars from `.env.local` to Vercel (Production),
   then redeploy and verify chat/KB/workspace work in prod.
7. **Resolve AUT-15:** confirm with the owner whether `SAWhatsApp/platform` was meant
   to be dropped; update AUT-5/7/8/12 accordingly.
8. **Then AUT-9:** apply/verify the tenant-register migration on live Supabase and
   unify the two schema files.
9. Reference key files: `src/app/api/chat/route.ts` (provider routing + KB grounding),
   `src/lib/supabase.ts` (client + settings), `supabase/*.sql` (schema).

---

## 9. Authentication (added/completed 2026-05-30, AUT-16)

Supabase Auth — **Google OAuth + email/password**, open sign-up, gating everything
except `/login` and `/auth/*`. Code shipped to `main` in earlier AUT-16 work; dashboard
OAuth wiring was completed this session; a follow-up auth test/logout page and clearer
login-failure UX are currently local/uncommitted.

### Architecture (Next 16 `proxy`, NOT `middleware`)
- `src/proxy.ts` — refreshes the Supabase session each request; unauthenticated →
  `/login?redirect=…` for pages, `401` for `/api/*`; logged-in users on `/login` → `/`.
- `src/lib/supabase/{env,client,server,proxy}.ts` — SSR clients (`@supabase/ssr` added).
- `src/lib/auth/dal.ts` — `getUser()` (cached), `requireUser()`, `getApiUser()`.
- `src/lib/auth/api-guard.ts` — `requireApiAuth()` 401 helper; applied to all 10 API
  route files (14 handlers).
- `src/app/login/{page,login-form}.tsx` — the login form (Google + email/password +
  sign-up toggle).
- `src/app/auth/callback/route.ts` — OAuth/email code → session exchange.
- `src/app/auth/signout/route.ts` — POST sign-out.
- `src/app/auth-test/page.tsx` — protected smoke-test page that displays signed-in email
  and posts to `/auth/signout`.
- `src/lib/auth/login-messages.ts` — normalized user-facing login/OAuth failure messages.
- `workspace-route.tsx` — top-nav shows signed-in email + Sign out.

### Dashboard setup completed
- Google Cloud project: `Hamba Customer Service` (`hamba-customer-service`).
- Google Auth Platform: External, app name `Hamba Customer Service`, support/developer
  contact `info.hambatrading@gmail.com`.
- Google OAuth web client: `Hamba Web`; authorized redirect URI exactly:
  `https://ddlykzackuehdexldazv.supabase.co/auth/v1/callback`.
- Google Auth Platform remains in **Testing**; test user added:
  `info.hambatrading@gmail.com`.
- Supabase Auth → Sign In / Providers → Google: enabled with the OAuth client ID/secret.
  **Do not print or commit the client secret.**
- Supabase Auth → URL Configuration:
  - Site URL: `https://hambatrading.co.za`
  - Redirect allow-list:
    - `http://localhost:3000/**`
    - `https://hambatrading.co.za/**`
    - `https://whatsapp-project-kappa.vercel.app/**`

### Login/logout UX follow-up (local, uncommitted)
- Failed email/password or OAuth attempts stay on `/login` and show a clear user-facing
  message. Unknown/unregistered users are directed to use **Sign up**.
- The login form now uses `method="post"` as the no-JS/pre-hydration fallback so dummy
  or real passwords are not leaked into the URL if React has not hydrated yet.
- We intentionally do **not** auto-create a user after failed sign-in; that would be a
  surprising/security-sensitive UX. The explicit Sign up path creates the Supabase user.
- New protected `/auth-test` page verifies session + logout without touching workspace data.

### Verified locally this session
- Supabase connector: project `hambatrading` / `ddlykzackuehdexldazv` is `ACTIVE_HEALTHY`.
- Supabase dashboard: Google provider shows `Enabled`.
- Supabase dashboard: Site URL + all 3 redirect URLs are present.
- Local smoke:
  - `/` → 307 `/login`
  - `/login` → 200
  - unauthenticated `/api/models` → 401
  - Google sign-in as `info.hambatrading@gmail.com` → Supabase callback → authenticated
    workspace → Sign out → `/login`
- Manual browser visual walkthrough completed in Chrome:
  - Opened `http://localhost:3000/auth-test` while signed out → redirected to
    `/login?redirect=%2Fauth-test`.
  - Submitted dummy email/password (`not-registered@example.com` / fake password) →
    stayed on `/login?redirect=%2Fauth-test`; displayed the red
    "Login failed... choose Sign up" message; password did **not** appear in the URL
    after the `method="post"` fallback patch.
  - Clicked "Continue with Google" → Google account chooser → selected
    `info.hambatrading@gmail.com` → returned to `/auth-test`.
  - `/auth-test` showed `You are signed in` and signed-in email
    `info.hambatrading@gmail.com`.
  - Clicked "Sign out and return to login" → returned to `/login`.
- Local environment note from visual testing:
  - A Hermes gateway/WhatsApp bridge was auto-binding `127.0.0.1:3000` and serving
    `Cannot GET ...`, which intercepted Chrome's `localhost:3000` requests while Next was
    only reachable on the IPv6/all-interface listener. It was stopped for the visual test.
    At handoff, `launchctl list | grep -i hermes` and `lsof -nP -iTCP:3000 -sTCP:LISTEN`
    returned no entries.
- Final checks rerun at end of session:
  - `npm run typecheck` passed (rerun alone after a parallel build/typecheck race touched
    `.next/types`)
  - `npm test` passed, **23/23** (0 fail, 0 skipped)
  - `npm run build` passed; Next.js generated 18 static pages and includes dynamic
    `/auth-test`, `/auth/callback`, `/auth/signout`, and API routes.

### Remaining auth dependency
Production auth still depends on **AUT-14**: add the required Vercel production env vars
from `.env.local`, then redeploy. OAuth/dashboard wiring is done; prod still needs its
runtime environment before Supabase/LLM-backed features are reliable.

### Trade-off noted
Each API request runs its own `auth.getUser()` in addition to the proxy's check (defense
in depth). Can be reduced to proxy-only `/api/*` gating later if latency matters.

---

## 10. End-of-session local changes (not committed yet)

Current dirty tree at handoff:
```
 M HANDOFF.md
 M src/app/login/login-form.tsx
 M src/app/workspace-pages.test.tsx
?? src/app/auth-test/
?? src/lib/auth/login-messages.test.ts
?? src/lib/auth/login-messages.ts
```

What those changes do:
- `src/app/auth-test/page.tsx` — protected standalone auth/logout smoke page.
- `src/lib/auth/login-messages.ts` — maps Supabase/OAuth errors to friendlier login UX.
- `src/lib/auth/login-messages.test.ts` — unit coverage for login error messages.
- `src/app/login/login-form.tsx` — uses friendly error mapping and tells first-time users
  to use Sign up.
- `src/app/workspace-pages.test.tsx` — adds a route contract test for `/auth-test` without
  importing server-only auth code.
- `HANDOFF.md` — this updated handoff.

Suggested commit message:
```
Add auth smoke page and login failure messaging
```

---

## 11. Next scoped work — AUT-17 (created 2026-05-30)

Created Linear issue **AUT-17**:
`Wire document upload to 768-dim vector retrieval and harden assistant pipeline`

Why it exists:
- Current chat route already passes `temperature` to providers and fetches KB context.
- Current KB upload/search still uses plain `knowledge_base` rows and `ilike` text search.
- Supabase schema does **not** yet include pgvector, `vector(768)`, document chunks,
  embedding metadata, or a vector-match RPC.
- The next milestone is to make document upload -> chunking -> 768-dim embedding ->
  vector retrieval -> grounded chat work end-to-end.

Reference UI inspected in Chrome:
- ChatNexus chatbot overview/test page:
  `https://app.chatnexus.io/dashboard/chatbots/chatbot/overview/7e5c1268-b42e-44e6-9fb9-5dc30b0d4d88`
- Useful patterns: left chatbot navigation, chatbot test panel, right-side
  Instructions/Settings drawer, temperature/top-k/model controls, and Knowledge Base
  tabs for Overview, File, Text, Website, API, Database, and Tools.

Implementation notes for AUT-17:
- Audit race conditions around duplicate saves/uploads, stale React state, slow network
  retries, streaming cancellation, and rapid tab changes.
- Add Supabase migration for pgvector + 768-dim chunk embeddings, scoped by
  organization/property/chatbot as appropriate.
- Replace `/api/kb/search` text matching with vector similarity retrieval.
- Wire `/api/chat` to retrieved chunks with top-k/context limits and safe fallback.
- Add UI for upload/indexing status and retrieval-preview testing.
- Verify with `npm run typecheck`, `npm test`, and `npm run build`.

### AUT-17 implementation started

- Added `knowledge_vectors` pgvector migration with `embedding vector(768)`, metadata,
  source type/id/name, chunk fields, HNSW cosine index, RLS, and `match_knowledge_vectors`.
- Applied the migration to live Supabase project `hambatrading` / `ddlykzackuehdexldazv`.
- Added OpenAI `text-embedding-3-small` indexing with `dimensions: 768`.
- `/api/kb/upload` and `/api/kb/update` now save KB rows and attempt vector indexing.
- `/api/kb/search` now tries vector retrieval first and falls back to existing text search.
- `/api/chat` labels retrieved KB context as vector vs text fallback.
- Knowledge Base UI now has ChatNexus-style tabs, overview cards, file/text indexing,
  retrieval preview, and placeholder metadata-ready tabs for Website/API/Database/Tools.
- Verified live vector smoke test: 1 chunk indexed at 768 dims; vector query returned the
  smoke source with similarity `0.517`; smoke KB row and test auth user were cleaned up.
- Checks passed: `npm test` 26/26, `npm run typecheck`, `npm run lint`, `npm run build`.

### AUT-17 update — 2026-06-04

- Removed the legacy Knowledge Base block from the UI and switched the Text tab to a
  stable overwrite flow keyed by `property:<propertyId>:text`.
- `knowledge_base` now stores `source_type`, `source_id`, `source_name`, and `metadata`
  alongside the content; vector rows are refreshed when Text overwrite is used.
- Added a **local browser-testing auth bypass** controlled by
  `NEXT_PUBLIC_LOCAL_AUTH_BYPASS=true` in `.env.local`.
  - Safety: it only activates outside production builds.
  - Behavior: `src/proxy.ts`, `src/lib/auth/dal.ts`, and the API auth guard all treat
    requests as signed in with a local mock user.
  - UI: workspace/auth-test show the bypass state and suppress real sign-out flows.
  - Use case: lets Browser/in-app automation test protected routes on `localhost`
    without getting trapped at `/login`.
- Replaced the property-workspace sidebar letter badges with **Lucide** icons in
  `src/components/workspace/workspace-route.tsx`.
  - Icon mapping: Overview=`LayoutDashboard`, Chatbot=`Bot`, Agents=`Users`,
    Conversations=`MessageSquareText`, Knowledge Base=`BriefcaseBusiness`,
    Analytics=`BarChart3`, Usage=`Gauge`, Settings=`Settings2`.
  - Styling uses `currentColor` and neutral container states so a future dark-mode
    pass can theme the nav without changing the icon structure.
- Added an **Overview analytics scaffold** for the property chatbot workspace.
  - New route: `src/app/api/analytics/overview/route.ts`
  - New analytics contract: `src/lib/overview-analytics.ts`
  - New tests: `src/lib/overview-analytics.test.ts`
  - UI now includes:
    - ChatNexus-style Overview header and two 3-card metric rows
    - filter dropdown for `24 Hours`, `7 Days`, `30 Days`, `Lifetime`
    - channel toggles for `All channels`, `Web widget`, `WhatsApp`
  - Metric mapping for the real system:
    - `Users` = unique `fingerprintId` count
    - `Tokens` = prompt + completion + cached token totals
    - `Messages` = tracked interaction/message totals
    - usage row = characters/tokens/messages against plan caps
  - Phase plan:
    - **Phase 1 (done):** cached mock data scaffold, fingerprint-ready schema contract,
      browser-visible UI.
    - **Phase 2:** replace the mock event reader with real Supabase reads using the same
      `propertyId + window + channel` filter contract.
    - **Phase 3:** seed/live backfill, then revalidate cached analytics on writes.
  - Caching:
    - Uses a cached server helper (`unstable_cache`) for the summary layer.
    - Client keeps per-filter results in local state so tab/filter revisits do not
      re-fetch the same overview payload during the session.
  - Application/test requirements captured:
    - keep `fingerprintId` on analytics events from the start
    - ensure filter inputs stay DB-ready (`propertyId`, `window`, `channel`)
    - preserve automated coverage for aggregation and filter logic
- Replaced the legacy inline workspace refresh loaders with a single centered page loader.
  - Removed the old top-right / header `Loading...` pill states during initial workspace refresh.
  - `WorkspaceRoute` now blocks on the initial workspace fetch and shows a centered
    circular spinner (`LoaderCircle`) with `Loading workspace...` copy.
  - Result: refreshes transition through one intentional loading state instead of
    briefly rendering stale shell UI plus intermittent header loaders.
- After flipping the env var, restart `npm run dev`.

### Skills / connectors used in this phase

- Next.js local docs (`node_modules/next/dist/docs/...`) for `proxy` + auth guidance.
- Supabase connector for live schema confirmation/migration application.
- Linear connector for AUT-17 status tracking and requirement logging.

---

## 12. Session 2026-06-15 — pipeline, UI, transcription, and tenant-ops planning

Everything below is in the working tree only — **nothing committed/pushed yet.**

### Shipped & verified (code)
- **Retrieval migrations applied to live Supabase** (`hambatrading`): retrieval
  columns on `property_chatbot_settings` + 6-arg `match_knowledge_vectors`. Workspace
  load fixed.
- **KB pipeline hardened (AUT-17):** lazy-loaded document parsers (fixed a
  module-load crash that 500'd every upload), graceful handling of corrupt files,
  `retrieveKnowledge` helper so `/api/chat` no longer self-calls over HTTP, and
  retrieval **memory modes** (`hybrid`/`rolling_window`/`retrieval_only`). Audit:
  **0 findings / 32 checks**. `typecheck` + `test` (40/40) + `build` green.
- **HeroUI v3 adopted:** `@heroui/react` + prebuilt styles wired in `globals.css`
  (no provider needed in v3); login form migrated as the first surface and verified
  in-browser. See `docs/roadmap/ui/heroui.md`.
- **Audio transcription CLI:** `npm run transcribe -- "<file>"` (OpenAI
  `gpt-4o-transcribe`) → transcript + `.txt`. `scripts/transcribe.mjs`. Used to
  transcribe the owner's planning voice note.

### Planning docs added (NOT approved for build — drafts)
From the [2026-06-14 La Lucia Mall voice note](docs/voice-notes/2026-06-14-la-lucia-mall-16.md),
a **layer above organizations** (Chatbox vs Dashboard) with three capabilities:
- `docs/roadmap/functionality/whatsapp-tenant-assistant.md`
- `docs/roadmap/functionality/tenant-conversation-flows.md` — Mermaid **decision
  trees** (routing, inquiring, leaving, human takeover)
- `docs/roadmap/functionality/payments-dashboard.md` — per-unit CRM, tables/columns
- `docs/roadmap/functionality/tenant-offboarding.md`
- Plus earlier this session: `property-details.md`, `knowledge-base-photos.md`,
  `storage.md`, `ui/forms.md`. Index: `docs/README.md`. Roadmap **Phase 7** added.

> **AUT-15 direction confirmed by the owner:** the WhatsApp/Twilio platform *is*
> wanted — resolve that ticket as "rebuild into `src/`."

### Next steps
1. Owner reviews the tenant-ops planning docs (esp. payments columns + open
   questions) and records follow-up voice notes.
2. Commit/push this session's work when ready (KB pipeline, HeroUI, transcription,
   docs).
3. Still outstanding from before: **AUT-14** (Vercel prod env vars).
