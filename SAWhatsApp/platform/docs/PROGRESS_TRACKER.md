# WhatsApp Platform Progress Tracker

Last updated: 2026-05-17 18:25 SAST

Status legend: `[x]` done, `[~]` in progress or partially done, `[ ]` not started or unverified.

## 1. Project Orientation

- [x] Clone repository locally.
- [x] Identify main app: `SAWhatsApp/platform`.
- [x] Identify related app: `SAChatbot`.
- [x] Review existing markdown docs.
- [x] Create current project analysis.
- [ ] Decide whether `SAChatbot` should be integrated, archived, or tracked separately.

## 2. Local Setup

- [x] Runtime constraints documented in `package.json`.
- [x] Runtime precheck script exists.
- [x] Add `.env.local.example` with safe placeholder variables.
- [x] Run `npm ci` in `SAWhatsApp/platform`.
- [x] Run `npm run lint`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Start local dev server and verify `/api/health`, `/`, and `/admin`.

## 3. Supabase

- [x] Core schema exists in `supabase/schema.sql`.
- [x] Customer, conversation, message, knowledge-base, prompt settings, and webhook tables are represented.
- [~] RLS is enabled.
- [x] Remove duplicate `idx_knowledge_base_is_active` index statement.
- [ ] Document required RLS policies for dashboard and service-role operations.
- [ ] Confirm schema runs cleanly on a fresh Supabase project.
- [ ] Seed knowledge base in target Supabase environment.

## 4. Twilio WhatsApp

- [x] Inbound webhook route exists.
- [x] Twilio signature validation helper exists.
- [x] Outbound send endpoint exists.
- [x] Webhook attempts automatic grounded reply.
- [ ] Verify sandbox inbound webhook with valid Twilio signature.
- [ ] Verify outbound reply from webhook.
- [ ] Verify delivery/status callback route behavior.
- [ ] Configure production WhatsApp sender when ready.

## 5. AI And Knowledge Base

- [x] Basic grounded reply builder exists.
- [x] Knowledge-base fetch helper exists.
- [x] Knowledge-base seed script exists.
- [~] AI response chain is implemented as keyword matching, not a full LLM flow.
- [ ] Replace sample seed content with real business FAQ/product/policy content.
- [ ] Decide target LLM provider and model.
- [ ] Add fallback/escalation rules for low-confidence replies.
- [ ] Add tests for `buildGroundedReply`.

## 6. Admin Dashboard

- [x] Dashboard page exists.
- [x] Conversation list loads from Supabase.
- [x] Webhook heartbeat endpoint is consumed.
- [x] Polling and realtime refresh are implemented.
- [ ] Reduce N+1 queries or move dashboard aggregation server-side.
- [ ] Confirm dashboard works under intended RLS policies.
- [ ] Add loading, empty, and error-state verification screenshots during UI QA.

## 7. Deployment

- [~] Previous handoff says Vercel build succeeded.
- [ ] Confirm current Vercel project and production URL.
- [ ] Add all required env vars in Vercel.
- [ ] Redeploy after env var setup.
- [ ] Confirm production `/api/health`.
- [ ] Configure Twilio production webhook URL.

## 8. Quality And Tests

- [x] Add `typecheck` script for `SAWhatsApp/platform`.
- [x] Confirm `SAWhatsApp/platform` build now runs TypeScript validation.
- [x] Confirm `SAChatbot` install, typecheck, lint, and build pass.
- [~] Upgrade both apps to `next@16.2.6`; npm audit still reports a moderate advisory from Next's nested `postcss@8.4.31`.
- [ ] Add unit tests for Twilio body parsing/signature validation.
- [ ] Add unit tests for assistant reply scoring.
- [ ] Add route smoke tests for health, webhook missing fields, and send missing fields.
- [ ] Add CI workflow for lint/build/test.
- [ ] Document manual end-to-end test script.

## Immediate Next Sprint

1. Document required Supabase RLS policies.
2. Seed realistic knowledge base data.
3. Test Twilio sandbox end-to-end.
4. Add focused unit tests for Twilio and assistant behavior.
5. Decide whether to keep `SAChatbot` as a separate app or fold useful pieces into `SAWhatsApp/platform`.
