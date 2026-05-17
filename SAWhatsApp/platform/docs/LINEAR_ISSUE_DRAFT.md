# Linear Issue Draft

## Title

Analyze and stabilize WhatsApp integration platform

## Description

Review and stabilize the cloned `sanelen/whatsapp_project` repository, focused on `SAWhatsApp/platform`. The app is a Next.js WhatsApp customer-support platform using Twilio for inbound/outbound WhatsApp messages, Supabase for persistence, and a simple knowledge-base grounded reply pipeline.

Current analysis and tracker are committed in:

- `SAWhatsApp/platform/docs/PROJECT_ANALYSIS.md`
- `SAWhatsApp/platform/docs/PROGRESS_TRACKER.md`

## Current State

- Main app identified as `SAWhatsApp/platform`.
- Related but separate app identified as `SAChatbot`.
- Inbound Twilio webhook exists at `POST /api/webhooks/twilio`.
- Outbound WhatsApp send endpoint exists at `POST /api/whatsapp/send`.
- Supabase schema exists with customers, conversations, messages, knowledge base, prompt settings, and webhook logs.
- Admin dashboard reads conversations and webhook heartbeat from Supabase.
- Basic grounded replies are implemented through keyword scoring in `lib/assistant.ts`.
- Knowledge-base seed script exists.

## Acceptance Criteria

- [ ] Add safe `.env.local.example` with all required placeholder variables.
- [ ] Clean duplicate index statement in `supabase/schema.sql`.
- [ ] Document and verify required Supabase RLS policies.
- [ ] Run and record local `npm install`, `npm run lint`, and `npm run build` results.
- [ ] Seed realistic knowledge-base content.
- [ ] Verify Twilio sandbox inbound and outbound flow.
- [ ] Confirm Vercel production env vars and health endpoint.
- [ ] Add focused tests for Twilio parsing/signature validation and grounded replies.
- [ ] Decide whether `SAChatbot` should be merged, linked, or tracked as a separate prototype.

## Notes

Linear connector was not fully available in Codex at the time this draft was created, so this markdown is ready to paste into Linear or convert into an issue when the connector is connected.
