# Chat/WhatsApp Workstream Requirements

Last reviewed with owner direction: 2026-07-18
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
- **Not yet evidenced on `main`:** a durable server-only Inbox repository,
  persisted takeover/manual-reply/resume transitions, provider event idempotency and
  delivery states, an interested-tenant automation loop, or a provider sandbox.
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

### CW-4 — Guardrailed interested-tenant path

After CW-1–CW-3, implement only the interested/inquiring path: welcome, intent,
property/location selection, verified property facts, vacancy answer where a trusted
source exists, lead/follow-up capture, and human escalation.

Acceptance:

- Answers are property-scoped and cite only verified structured data/KB material.
- Missing or conflicting truth escalates; it is never invented.
- Sensitive, unclear, opt-out, or human-request messages pause/escalate.
- Servicing and offboarding automation remain deferred.

### CW-5 — Sandbox/test sender

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
