# Hamba Customer Service Guided Assistant — Local Validation

Date: 2026-07-25  
Branch: `codex/hamba-customer-service`  
Base: `817c123` (`origin/main`)  
Status: application local and uncommitted; additive database migration applied 2026-07-26

## Evidence used

- `docs/roadmap/functionality/whatsapp-tenant-assistant.md`
- `docs/roadmap/functionality/tenant-conversation-flows.md`
- `docs/requirements/CHAT-WHATSAPP.md`
- User screenshots showing a prospective renter incorrectly entering unit and
  existing-tenant menus.

The durable direction is prospect first: present verified property information,
capture interest, and let staff confirm live availability. Existing-tenant
servicing and document handling remain outside this automated flow.

## Implemented boundary

- Unknown conversations start at `prospect.entry` with a concise welcome and one
  rental-intent shortcut.
- Property discovery then exposes 33 Essex, Westrich/Westridge, and Quarry Heights
  as native WhatsApp reply buttons while still accepting names, areas, aliases,
  numbers, and free text.
- Only the selected property's approved facts, page, photos, map, and pamphlet are
  shown. Unrelated property information is not dumped into the conversation.
- The selected-property step offers three focused actions: apply/check
  availability, ask a question, or choose another location.
- Deterministic intake collects property/area, monthly budget, and move-in date.
- Completion records a `create_prospect_lead` action for staff follow-up.
- Legacy `tenant.*`, old unit-selection, and FAQ states normalize to prospect
  intake; recheck wording cannot reach maintenance/payment/lease/access menus.
- Explicit existing-tenant, safety, or document requests hand off to staff.
- Test rooms are filtered from the customer-facing catalogue.
- The LLM can answer a selected-property question only. It cannot advance state,
  claim vacancy, collect ID/payslips, or start tenant servicing.
- A2UI and document/ID automation were intentionally not implemented. A2UI belongs
  in a later authenticated internal-portal roadmap.

## Authoritative property content

- Property and room facts are stored separately from descriptive retrieval text.
  Availability, occupancy, final price, deposits, viewing, contacts, public
  links, parking, features, and media associations stay structured.
- Only explicitly approved property/room descriptions and approved media
  caption/alt text can be vectorized. Retrieval also rejects entries without the
  matching approved descriptive metadata.
- The actual connected project was inspected read-only and has one private
  `uploads` bucket with a 50 MB limit. Storage paths associate every object to an
  organization, property, and optional room.
- External http(s) media such as Google Photos remains supported alongside private
  Storage during migration.
- The authenticated Property Content workspace manages property facts, room facts,
  media approval, public links, contacts, occupancy, parking, and features.
- CSV/JSON/XLS/XLSX import produces an editable mapping preview with confidence,
  reasons, row warnings/errors, and a disabled Apply action until validation
  succeeds. Applied imports are designed to retain source, mapping, preview,
  actor, and outcome for audit.
- Human handoff requested time, reason, and status are durable once the additive
  migration is applied.

## Model recommendation

Keep **GPT-5.6 Luna** as the default for this bounded short-chat role.

The scripted tests prove that journey classification, field collection, handoff,
and availability safety are deterministic and do not depend on model capability.
The model is used only for concise selected-property Q&A, with output validation and
a deterministic fallback. In the configured catalogue, Luna costs 40% of Terra for
both input and output. Terra remains an explicit settings override if a future live
A/B shows a material answer-quality improvement.

No live Luna-versus-Terra generation A/B was run because this isolated worktree has
no provider credentials. That is the remaining evidence gap, not a reason to move
state control into the model.

## Verification

- Focused prospect/model/Meta-button boundary: 43/43 passed.
- Full repository unit/integration suite: 227/227 passed.
- TypeScript: passed.
- ESLint: passed with 0 errors (10 pre-existing warnings).
- Production build and release artifact tests: passed.
- The read-only local browser harness passed eight guided scenarios: concise
  greeting, location choice, selected Quarry Heights information, free-text
  question routing, application interest, budget/move-in capture, staff follow-up,
  and availability recheck from a stale tenant state.
- The final greeting exposes one clear rental-intent action. Property discovery
  exposes all three locations, then reveals only the selected property's approved
  media and facts. Recheck wording returns to prospect property choice without a
  tenant menu.
- The authenticated local Property Content walkthrough verified the Facts & rooms,
  Media, and Import tabs. A safe local CSV preview produced six reviewed mappings,
  one valid row, and the explicit “Nothing has been saved yet” state; Apply was
  enabled only after validation and was not clicked.
- The browser gate caught and fixed a Node-only module import that crossed into a
  client component. The corrected client path loads in Next.js development and
  the production build remains green.
- When local auth bypass is enabled without Supabase credentials, the property
  snapshot is an explicit read-only fixture: preview works, while every save,
  upload, or apply action is rejected.
- `git diff --check`: passed.
- The additive migration was applied to the existing Supabase project in one
  transaction after an owner-authorized production preflight. Original row counts
  remained 3 properties, 46 units, 0 media, and 1 conversation state.
- Post-migration checks confirmed all expected columns, RLS, service-role-only
  import access, constraints, the Luna default, and the existing private
  `uploads` bucket with its 50 MB limit.
- The existing public property portfolio, authenticated chatbot workspace, and
  monthly-payments locations page loaded successfully after migration.
- No provider settings, production rows, real messages, application deployments,
  commits, or protected branches were changed.

## Release caveats

- The owner selected a single Supabase project and authorized the additive
  migration; the prior staging-project plan is superseded and recorded in
  [`hamba-staging-readiness-2026-07-26.md`](./hamba-staging-readiness-2026-07-26.md).
- Media upload and import Apply were not exercised against live data. Those
  authenticated writes remain a release verification step after the reviewed
  application code is deployed.
- A Meta sandbox run and small Luna/Terra comparison remain before customer
  traffic. Luna stays the lower-cost default in the meantime because deterministic
  code owns all safety-critical decisions.

See
[`full-flow-review-2026-07-25-guided-property-assistant.md`](../reviews/full-flow-review-2026-07-25-guided-property-assistant.md)
for the release synthesis and priority actions.
