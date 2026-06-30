# Project Roadmap

## Current Focus

The KB/retrieval shell is in place, and a first monthly-payments branch now exists.
The next major work is to reconcile planning with implementation, then continue the
tenant-operations build in a deliberate sequence.

## Execution Status

- Shipped and verified (2026-06-14): property-scoped vector retrieval, real Supabase
  Storage uploads, retrieval metadata plumbing, KB source management, retrieval memory
  modes (`hybrid`/`rolling_window`/`retrieval_only`), graceful handling of corrupt/
  unsupported uploads, and direct (non-HTTP) KB retrieval from the chat route. The
  vector-pipeline audit now reports **0 findings across 32 checks**.
- Shipped on branch `codex/monthly-payments` (2026-06-29): the new top-level split
  between **Property Assistance** and **Monthly Payments**, plus a local-data monthly
  payments admin workspace for building, unit-count, occupancy, price, reference, and
  keyword setup.
- Already shipped: restored top navigation, local-storage selection persistence, tablet
  layout improvements, KB text chunk settings UI, retrieval settings, vector audit
  script, and roadmap docs.
- Still under review (decisions needed, not blocking): `summary_memory` lifecycle
  (currently falls back to `hybrid`), large-file upload strategy above standard
  multipart usage, and whether the current monthly-payments local JSON layer should
  be treated as prototype scaffolding or carried forward into Supabase-backed buildout.

## Questions For Review

These items are still underspecified enough that they should be confirmed before we hard-code behavior:

1. Unsupported binaries:
   The earlier note mentioned formats such as `.exe`. We can store any file in Supabase Storage, but executables and other opaque binaries cannot be meaningfully chunked into text embeddings without a separate extraction rule. Current assumption: store them, mark indexing status `unsupported`, and exclude them from retrieval.
2. `summary_memory` behavior:
   We can safely implement `rolling_window`, `retrieval_only`, and `hybrid` immediately. A real `summary_memory` mode needs a clear summary lifecycle: where the summary is stored, when it refreshes, and whether it is per conversation or per property chatbot.
3. Large file uploads:
   Supabase standard uploads are a clean fit for smaller multipart uploads. If this project needs routinely large documents, we should confirm whether to add resumable/TUS upload flow now or keep phase one on standard uploads.

## Phase 1: UI Navigation And Workspace Polish

- Keep top organization/chatbot dropdowns visible inside selected chatbot pages.
- Show only the organization dropdown on organization and chatbot-overview screens.
- Persist selected organization/chatbot IDs in local storage for future visits.
- Improve tablet layout so the chat pane is not squeezed by side panels.
- Expose upcoming retrieval settings from both the chatbot side settings panel and the full Settings page.

See [UI roadmap](./roadmap/ui/README.md).

## Phase 2: Property-Scoped Vector Knowledge

- Keep embeddings at 768 dimensions with pgvector.
- Enforce property-only retrieval by default.
- Store source metadata for text and files.
- Filter vector search by selected property/chatbot.

See [Vector embeddings roadmap](./roadmap/functionality/vector-embeddings.md).

## Phase 3: Text And File Ingestion

- Make text knowledge a first-class indexed source with chunk settings.
- Accept any uploaded file into Supabase Storage.
- Index supported file types and mark unsupported files clearly.
- Delete storage objects, source metadata, knowledge rows, and vector rows together.

## Phase 4: Chatbot Retrieval Testing

- Add retrieval controls for top-k chunks, similarity threshold, memory mode, and chat-history window.
- Return retrieval metadata from `/api/chat`.
- Show retrieved chunks, source metadata, scores, and memory settings in the chatbot testing panel.

## Phase 5: Property Details, Media, And HeroUI

The chatbot is meant to answer property/unit questions (rent, deposit, location,
occupants, parking, ensuite, photos), but properties currently carry only a
placeholder location and an empty image. This phase makes property data structured
and visual, and standardizes the UI on HeroUI.

- Adopt **HeroUI** as the workspace component layer — see [HeroUI adoption](./roadmap/ui/heroui.md).
- Apply a consistent **forms enhancement protocol** (validation, typed inputs,
  upload progress, accessibility, multi-step wizards) — see [forms](./roadmap/ui/forms.md).
- Add **structured property/unit details** (address, maps link, rent, deposit, max
  occupants, parking, ensuite flag, feature tags) — see [property details](./roadmap/functionality/property-details.md).
- Add **photos** to the Knowledge Base (property/unit galleries) with caption-based
  image retrieval — see [KB photos](./roadmap/functionality/knowledge-base-photos.md).
- **Enable Supabase Storage** for images: a public `property-images` bucket
  alongside the private `uploads` document bucket — see [storage](./roadmap/functionality/storage.md).

## Phase 6: Production And Platform Readiness

- Add required Vercel production environment variables.
- Verify production auth, workspace loading, KB indexing, and chat completion.
- Resolve the old WhatsApp/Twilio platform decision and either port it into the current app or close/re-scope that work.

## Phase 7: Tenant Operations (from voice-note planning)

Captured from the [2026-06-14 La Lucia Mall session](./voice-notes/2026-06-14-la-lucia-mall-16.md).
Adds a **layer above organizations** with two entry points — **Chatbox** (existing
route) and **Dashboard** (new) — and three tenant-operations capabilities. The
wireframe package in `/Users/macdaddy/Documents/DEV/design_handoff_hamba_roadmap/`
was reviewed on 2026-06-29 and now serves as the primary visual reference. Payments
has already begun implementation on branch `codex/monthly-payments`; WhatsApp
assistant and offboarding remain planning-only.

- **WhatsApp tenant assistant** — guardrailed LLM conversations for inquiring,
  servicing (deferred), and leaving tenants, with human takeover. Resolves the
  AUT-15 platform question as "rebuild into `src/`." See
  [WhatsApp tenant assistant](./roadmap/functionality/whatsapp-tenant-assistant.md)
  and the [conversation flow diagrams](./roadmap/functionality/tenant-conversation-flows.md).
- **Payments dashboard** — CRM-style per-unit rent tracking, reference matching /
  sign-off, amber status, and rolling totals. See
  [payments dashboard](./roadmap/functionality/payments-dashboard.md) and the
  [bank import notes](./roadmap/functionality/payments-bank-import.md).
- **Tenant offboarding** — notice → market the unit → exit survey → deposit/banking
  handling. See [tenant offboarding](./roadmap/functionality/tenant-offboarding.md).

### Reviewed linear flow

1. **Entry layer**: org-level choice between `Chatbox` and `Dashboard`.
2. **Payments dashboard**: dashboard home with month stepper, recent-month strip,
   rolling total, by-location cards, and a CTA into the operator loop.
3. **Payments drill-down**: clicking a location opens the per-location unit table
   with the deposit `Date` column and inline row states.
4. **Inline match/sign-off**: `+ match ref` opens a property-scoped unmatched pool
   beside the target unit, then sign-off happens back on the row.
5. **Reverse / audit**: mistaken sign-offs reverse back into the pool with the
   audit trail preserved.
6. **Room manager**: admin setup for unit metadata and reference rules comes after
   the operator loop is working end to end.
7. **Bank import**: Gmail / Drive sync, Capitec PDF extraction, dedupe/provenance,
   and auto-created unit payment periods feed the loop.
8. **WhatsApp assistant**: inbound greeting, intent routing, interested flow, human
   takeover pane, and later servicing/offboarding branches.
9. **Offboarding**: leaving stepper, operational tracker, exit survey, and
   banking/deposit reconciliation screen.

### Immediate implementation order

For the next monthly-payments execution slice, the agreed order is:

1. **Period auto-creation**
   - ensure `unit_payment_periods` exist for every occupied, non-blocked unit when
     a month is imported or loaded
2. **Match interaction**
   - wire `+ match ref` to a property-scoped pool inside the unit table
   - rank likely references using `expected_reference`, `match_keywords`, and amount
3. **Sign-off + reverse sign-off**
   - lock the row after sign-off
   - reverse back to the pool with an audit event when a mistake is corrected
4. **Dashboard CTA wiring**
   - send operators from the dashboard straight into the property unit table, not
     a global reference-pool page
5. **Room manager**
   - keep admin setup as the follow-up branch once the operational loop is stable

## Tooling

- **Audio transcription CLI** (shipped 2026-06-14): `npm run transcribe -- "<file>"`
  converts voice notes to text (OpenAI `gpt-4o-transcribe`). Voice notes are the
  owner's primary offline planning channel; transcripts land in `docs/voice-notes/`.
