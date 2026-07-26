# Chat/WhatsApp Workstream Requirements

Last reviewed with owner direction: 2026-07-25
Status: **Active**

This is the current executable requirement set for the twice-daily Chat/WhatsApp
job. It replaces missing files and stale assumptions in older handovers; it does not
pause the job.

## Product boundary to preserve

- Public `/` remains the welcoming Hamba landing with WhatsApp contact and legal
  links. It must not expose internal tool destinations.
- Google-only approved-email authentication leads to protected `/staff`.
- `/staff` continues to show Chatbox, Payments, and Admin, with identity and logout.
- New staff UI must extend the shipped cloud/powder-blue, translucent-white,
  deep-navy system. Do not restore old wireframe styling or redesign unrelated pages.
- Build in the current root `src/` application. The removed nested
  `SAWhatsApp/platform` implementation is historical reference, not the production
  target.

## Current implementation truth

- **Shipped:** exact public `GET/POST /api/whatsapp/webhook`, Meta challenge and raw
  body signature verification helpers/tests, public WhatsApp CTA, existing
  property-scoped chat/retrieval workspace, and core conversation/message schema.
- **Built and verified on the isolated release branch:** provider-neutral event
  persistence, idempotent dispatch, durable conversation state, guarded handoff and
  opt-out, Meta reply buttons plus typed free text, and the prospective-renter
  journey. These remain release-gated until reviewed changes reach `main`.
- Existing roadmap diagrams describe intent, not proof that these capabilities
  exist.

## Active requirements, in order

### CW-1 — Durable server-only Inbox repository

Persist provider-neutral contacts, conversations, inbound/outbound messages,
provider message IDs, timestamps, direction, and normalized status through a
server-only repository. UI and webhook routes must not talk directly to storage.

Acceptance:

- Duplicate provider events cannot create duplicate messages.
- Conversation/message ordering is deterministic.
- Tenant data is returned only through authenticated staff APIs.
- Repository tests cover create/read, duplicate delivery, ordering, and failure.

### CW-2 — Audited human control

Persist takeover, manual reply, and resume actions with actor, timestamp, previous
state, new state, and reason. A paused/human-owned conversation must never receive an
automated reply.

Acceptance:

- State survives reload and process restart.
- Concurrent bot processing re-checks the latest human-control state before send.
- Manual replies are recorded as outbound staff messages.
- Every state transition is auditable and reversible only through an explicit
  action.

### CW-3 — Provider-neutral webhook and delivery contract

Translate signed provider payloads into internal events. Add idempotent processing,
delivery-state progression, and explicit handling of unsupported/malformed events.

Acceptance:

- Signature checks use the untouched request body.
- Event/message IDs are idempotency keys.
- Delivery state cannot regress from a later terminal state.
- Retries are safe and tests require no network or production credentials.

### CW-4 / AUT-38 — Guardrailed prospective-renter path

Implement only the prospective-renter path: warm welcome, property discovery,
verified property facts and media, deterministic lead/follow-up capture, and human
escalation. Unknown contacts are prospects by default. Quick replies are optional
shortcuts; typed free text must work at every intake step.

Acceptance:

- The first response is a short welcome with one clear rental-intent action.
- The location step names 33 Essex, Westrich/Westridge, and Quarry Heights
  without dumping unrelated property facts or media.
- After a property is selected, the response shows only that property's approved
  facts, page, photos, map, and pamphlet.
- Property buttons and typed property names/areas both select the same deterministic
  prospect journey.
- The intake collects property/area, monthly budget, and preferred move-in date.
- Availability and final terms are always described as staff-confirmed; missing or
  conflicting truth is never invented.
- A prospect cannot enter tenant room selection, maintenance, payment, lease,
  access, or document/ID collection, including after an availability recheck.
- Existing-tenant, sensitive, opt-out, urgent, and human-request messages pause or
  escalate to staff.
- The LLM may answer bounded, property-scoped questions but cannot choose persona,
  advance intake state, or override deterministic guardrails.
- Servicing, offboarding, document handling, and A2UI remain deferred. A2UI belongs
  to a later authenticated internal-portal roadmap.

### CW-5 / AUT-41 — Sandbox/test sender and release coverage

Exercise CW-1–CW-4 with fixtures and a provider sandbox/test sender. Keep provider
adapters replaceable and credentials server-only.

Acceptance:

- Fixture flow is repeatable without real tenant data.
- Inbound, reply, takeover, manual reply, resume, retry, and failed-delivery paths
  have recorded validation evidence.
- No production phone-number or provider-setting change is required.

### CW-6 — Production cutover (owner-present gate)

This item may be prepared but never executed unattended. Cutover requires the owner
present, a rollback plan, approved greeting/content, verified legal links, and a
successful sandbox evidence review.

The initial production test must set
`WHATSAPP_PILOT_ALLOWLIST_ONLY=true`. With this flag enabled, only conversations
already marked `pilot_enabled=true` may receive automatic replies; unknown contacts
are still ingested but receive no automated response. The flag may be removed only
after the owner accepts the real-phone walkthrough.

### AUT-39 — Authoritative content and vector boundaries

Status: **built locally 2026-07-25; migration/release gated**.

- Structured property, room, public-link, contact, price/deposit guidance,
  availability, viewing, parking, features, and media associations are authoritative.
- Only separately approved descriptions and approved media caption/alt copy are
  eligible for property-scoped vector retrieval.
- The assistant filters retrieval for approval metadata and validates that model
  output cannot turn stored availability, price, deposit, or viewing data into an
  unconfirmed promise.

### AUT-40 — Authenticated media and structured-data ingestion

Status: **built locally 2026-07-25; migration/release gated**.

- Property Content adds one authenticated screen for facts/rooms, media, and imports.
- Media uses the actual existing private `uploads` bucket, property/optional-room
  paths, signed delivery, and explicit approval.
- External Google Photos/http(s) links remain supported.
- CSV/JSON/XLS/XLSX imports show an assisted mapping with confidence/reason, normalized
  preview, warnings/errors, and disabled Apply until validation passes.
- Import preview performs no write. An applied import retains its reviewed mapping,
  preview, source file, actor, and status.

These slices do not broaden the public assistant into tenant servicing, document
handling, or A2UI.

## Deferred and stale

- Existing-tenant servicing automation and tenant offboarding.
- Automatic production-number registration, migration, deregistration, disconnect,
  or cutover.
- Direct tenant sends, live migrations, deployments, or provider changes by a
  scheduled job.
- Ticket descriptions or code paths under removed `SAWhatsApp/platform`.
- Old two-destination/root chooser, password login, open signup, and pre-refresh UI
  assumptions.

## Job selection rule

Take one highest-priority unblocked Active requirement per run. Verify whether its
acceptance criteria already exist before changing code. If blocked, take the next
safe local test, validation, or documentation slice within CW-1–CW-5 and record the
blocker; do not substitute a Deferred item.

Definition of done and evidence:

- [Implementation plan](../plans/chat-whatsapp-implementation-plan.md)
- [Flow tests](../testing/chat-whatsapp-flow-tests.md)
- [Validation ledger](../validation/chat-whatsapp-validation.md)
- [Current discovery audit](../audits/chat-whatsapp-discovery-2026-07-18.md)
