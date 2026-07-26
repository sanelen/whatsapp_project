# Chat/WhatsApp Validation Ledger

Last updated: 2026-07-26

## Baseline evidence on `main`

| Capability | Status | Evidence |
|---|---|---|
| Public landing + WhatsApp CTA | Verified | `src/app/page.tsx` |
| Public legal pages | Verified | `/privacy`, `/terms`, `/data-deletion` |
| Google-only staff boundary | Verified 2026-07-17 | `src/proxy.ts`, auth callback, production walkthrough |
| Staff hub: Chatbox/Payments/Admin/logout | Verified 2026-07-17 | `src/app/staff/page.tsx`, production walkthrough |
| Exact public webhook route | Verified | `src/proxy.ts`, `src/proxy.test.ts` |
| Challenge/signature helpers | Verified | `src/lib/whatsapp-webhook.ts` and test |
| Durable Inbox repository | Verified on isolated branch | CW-1 tests |
| Persisted takeover/manual reply/resume | Verified on isolated branch | CW-2 tests |
| Idempotent provider events/delivery states | Verified on isolated branch | CW-3 tests |
| Prospective-renter automation | Verified on isolated branch | CW-4 tests and visual transcript |
| Meta payload replay | Verified on isolated branch | CW-5 provider replay test |

## Per-run evidence template

- Date/run:
- Branch and base commit:
- Requirement/slice:
- Source reality checked:
- Tests added/changed:
- Commands and results:
- Browser/sandbox evidence:
- Safety checks:
- Remaining blocker or next acceptance criterion:

Do not mark a capability Verified from a plan, mock, old handover, or ticket status.
Verification requires current source plus passing evidence. Production cutover is
recorded only during an owner-present run.

## 2026-07-25 local prospect-flow evidence

An uncommitted implementation on `codex/hamba-customer-service` validates the
AUT-38 prospect-first CW-4 direction, including native property reply buttons and
typed free-text alternatives, without changing production. See
[`hamba-customer-service-2026-07-25.md`](./hamba-customer-service-2026-07-25.md).
This is local evidence only; the baseline table above remains unchanged until a
reviewed change reaches `main`.

## 2026-07-25 local authoritative-content evidence

The same isolated worktree now covers AUT-39/AUT-40 and the local portion of
AUT-41:

- actual connected Storage metadata was inspected read-only: one private `uploads`
  bucket, 50 MB limit;
- additive migration defines authoritative property/room facts, approved media,
  reviewed import audit, and durable handoff fields;
- authenticated Property Content workspace exposes facts/rooms, media, and
  review-before-apply structured import;
- property/room media ownership, http(s) external links, file type/size, and
  explicit approval are server validated;
- descriptive vector content excludes price, deposit, availability, viewing,
  contacts, addresses, and URLs;
- property assistant retrieval accepts only approved descriptive metadata and
  composes structured authority separately;
- the final repository suite completed with 225/225 passing, typecheck/build
  compilation clean, lint at 0 errors, and release artifacts 6/6 passing;
- a safe authenticated local browser walkthrough verified Facts & rooms, Media,
  and the no-save import preview, while the prospect harness verified greeting,
  discovery, and stale-state availability recovery.

## 2026-07-26 one-project schema release evidence

The owner rejected a second Supabase project and explicitly authorized the
additive authoritative-content migration in the existing `hambatrading` project.

- pre/post row counts stayed unchanged at 3 properties, 46 units, 0 media, and
  1 conversation state;
- all expected structured property, unit, media, and handoff columns are present;
- the import-audit table has RLS, no `anon` or `authenticated` grants, and a
  service-role policy;
- the existing private `uploads` bucket and 50 MB limit remain unchanged;
- existing public portfolio, staff chatbot, and monthly-payment views loaded
  after migration;
- the full suite passed 225/225, lint/typecheck/build passed, and release
  artifacts passed 6/6;
- the read-only prospect harness again verified the greeting, Quarry Heights
  discovery, and availability recheck recovery from stale tenant state.

No live rows, Storage objects, provider calls, tenant sends, application
deployments, commits, pushes, merges, or protected branches were changed.

## 2026-07-26 Meta activation readiness

Read-only checks against the connected Meta and Vercel accounts established that:

- `+27 67 291 0054` is connected with high quality under WABA
  `1050269137461823`; its phone-number ID ends in `310287`;
- the Meta app is subscribed to the `messages` webhook field at Graph API v25;
- the callback is already `https://hambatrading.co.za/api/whatsapp/webhook`;
- business verification and payment setup are complete;
- the production deployment has the Meta access token, app secret, phone-number
  ID, verify token, and the ingestion/dispatch/outbound toggles configured;
- recent traffic confirms the webhook and dispatcher are active, with no paid
  messages and an approximate Meta charge of USD 0.00 in the inspected period.

The isolated branch adds `WHATSAPP_PILOT_ALLOWLIST_ONLY`. The production pilot must
set it to `true` before releasing the new flow, so the existing approved tester
conversation can exercise the assistant without enabling unknown customer
conversations. Luna remains optional: without `OPENAI_API_KEY`, verified
deterministic property answers are used and the safety flow remains functional.

Current verification on the release branch: 232/232 tests pass, typecheck passes,
and lint reports 0 errors (10 pre-existing warnings). The Meta replay test covers
greeting, free-text location discovery, Quarry Heights selection, a parking
follow-up, and switching to other locations without tenant-flow leakage.
