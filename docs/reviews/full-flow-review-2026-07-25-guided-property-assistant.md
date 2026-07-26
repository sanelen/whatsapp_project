# Full-flow review — guided property assistant and authoritative content

Date: 2026-07-25  
Scope: AUT-38, AUT-39, AUT-40, and local AUT-41 release evidence  
Branch: `codex/hamba-customer-service`  
Status: isolated, uncommitted, not deployed

## Verdict

Ready for owner/code review in the isolated worktree. Do not release it yet.

The prospect journey, structured-content boundary, authenticated admin surface,
read-only import preview, and durable handoff evidence are implemented and pass the
local release gates. Production readiness still requires applying the additive
migration to a development/staging project first, walking the authenticated
write-path there, and then running a provider sandbox conversation. Those steps
were deliberately excluded because this run authorized no production or provider
writes.

## Architecture and flow

- Unknown contacts default to `prospect.location`; deterministic code controls
  persona, state, intake, opt-out, and human handoff.
- The model can answer only bounded questions inside the selected prospect
  journey. It cannot enter tenant servicing, collect documents, claim live
  availability/final terms, or confirm a viewing.
- Property and room records are authoritative for price, deposit, occupancy,
  availability, viewing instructions, contacts, public links, parking, features,
  and media associations.
- Only separately approved property/room descriptions and approved media
  captions/alt text are eligible for vector retrieval. Structured operational
  facts and URLs remain outside vectors and override descriptive retrieval.
- Media uploads use the connected project's existing private `uploads` bucket,
  associated to property ID and optional room ID. External http(s), including
  Google Photos, remains supported during migration.
- CSV/JSON/XLS/XLSX input is parsed server-side, mapped to known fields with
  confidence and reasons, previewed, and validated before Apply can be enabled.
  Applied imports retain source, mapping, preview, actor, and outcome for audit.
- Handoff requests persist requested time, reason, and pending status in channel
  state once the migration is present.

## QA and browser evidence

- Repository tests: 225/225 passed.
- TypeScript: passed both the explicit check and production build compilation.
- ESLint: 0 errors; 10 pre-existing warnings outside this scope.
- Production build: passed; `/api/property-content` is included.
- Release artifact tests: 6/6 passed.
- `git diff --check`: passed.
- Local browser walkthrough:
  - caught and fixed a Node-only `crypto`/`path` import crossing into a client
    component;
  - opened the authenticated Property Content workspace under local auth bypass;
  - verified Facts & rooms, approved media, private `uploads` labeling, external
    media, and the structured authority explanation;
  - uploaded a local CSV only to the read-only preview endpoint, reviewed six
    100%-confidence mappings and one valid row, confirmed “Nothing has been saved
    yet”, and did not click Apply;
  - verified unknown-contact greeting, Quarry Heights discovery to budget, and
    availability recheck recovery from stale tenant state.

## UI/UX and accessibility

The admin task stays on one Property Content screen with three in-place tabs:
Facts & rooms, Media, and Import. Decision-critical fields are visibly separated
from approved descriptive copy. Approval toggles explain the retrieval boundary,
status messages use `role="status"`, tabs use tab semantics, inputs have labels,
and Apply is disabled until validation succeeds.

The local no-Supabase fixture is explicitly development-only and read-only. It
allows the screen and preview flow to be inspected without creating a false save
path or touching production.

## Roadmap fit and exclusions

The local implementation covers AUT-39, AUT-40, and the code/evidence portion of
AUT-41 while preserving AUT-38. It does not add prospect access to maintenance,
payments, leases, keys/access, room selection, or document/ID handling. A2UI
remains a later authenticated internal-portal roadmap item.

GPT-5.6 Luna remains the default for short bounded Q&A because deterministic tests
own every safety-critical decision and Luna is the lower-cost configured option.
Terra remains an explicit override. A live Luna/Terra quality comparison was not
possible without provider credentials and is a staging evidence item.

## Cross-lens tensions

- The additive schema exists only as a local migration. Runtime code and migration
  must be promoted together; deploying code first would make authoritative saves
  fail safely with migration guidance.
- The import preview is fully exercised, but applying an import and uploading
  media require an authenticated development/staging Supabase write test.
- Provider construction and prospect responses are tested without sends; a Meta
  sandbox run remains necessary before customer traffic.
- The marketing-led greeting fits the enforced WhatsApp interactive-body limit,
  but it is intentionally information-dense. Staff should review customer
  completion rates after sandbox testing before shortening it.

## Priority actions before release

1. Review the isolated diff and additive migration.
2. Apply the migration to development/staging, never production first.
3. Run authenticated save/upload/import-apply checks with disposable staging data.
4. Run a Meta sandbox conversation covering greeting, property selection, budget,
   move-in, free-text question, recheck, opt-out, and human handoff.
5. Perform a small Luna-versus-Terra answer-quality/cost comparison on the same
   scripted prospect questions.
6. Only then commit, review, merge, and schedule production migration/deployment.
