# WhatsApp Project Analysis

Last updated: 2026-05-17 18:25 SAST

## Scope

This analysis covers the cloned repository `sanelen/whatsapp_project`, with emphasis on `SAWhatsApp/platform`, the WhatsApp integration app. The repo also contains `SAChatbot`, a separate Next.js chatbot app that appears related but not wired into the WhatsApp platform.

## Repository Shape

| Area | Path | Purpose | Current read |
| --- | --- | --- | --- |
| WhatsApp platform | `SAWhatsApp/platform` | Next.js app for Twilio WhatsApp webhooks, admin dashboard, Supabase storage, and grounded replies | Primary app to continue |
| Chatbot app | `SAChatbot` | Separate Next.js app with AI/chat APIs and knowledge-base endpoints | Possible source of reusable AI/admin ideas |
| Handoff notes | `SAWhatsApp/SESSION_HANDOFF.md` | Previous progress and next-session notes | Useful, but some paths and status notes need refreshing |
| HTML trackers | `SAWhatsApp/*.html` | System design and progress tracker exports | Good visual references, not the canonical tracker |

## Technology Stack

- Next.js `16.2.4`
- React `19.2.4`
- TypeScript
- Tailwind CSS 4
- Supabase for database and realtime dashboard reads
- Twilio Programmable Messaging for WhatsApp inbound/outbound messages
- Node `>=22` and npm `>=10`

## Implemented Capabilities

- `GET /api/health` health check.
- `POST /api/webhooks/twilio` inbound WhatsApp webhook handler.
- Twilio signature validation before processing inbound messages.
- Customer and active conversation creation in Supabase.
- Inbound and outbound message logging.
- Basic knowledge-base grounding through keyword scoring in `lib/assistant.ts`.
- Outbound WhatsApp reply attempt from webhook when `TWILIO_PHONE_NUMBER_ID` is configured.
- Manual outbound send endpoint at `POST /api/whatsapp/send`.
- Admin dashboard that polls conversations and webhook heartbeat, with Supabase realtime subscriptions.
- Knowledge-base seed script at `scripts/seed-knowledge-base.mjs`.

## Key Gaps And Risks

| Priority | Gap | Why it matters | Suggested next action |
| --- | --- | --- | --- |
| High | Production environment status is unknown | The handoff says Vercel needs env vars, but the repo alone cannot confirm that | Verify Vercel env vars and redeploy status |
| High | RLS is enabled without documented read/write policies | Client dashboard reads may fail unless Supabase policies are already configured externally | Document and apply explicit RLS policies |
| Medium | npm audit reports a moderate Next/PostCSS advisory | Both apps are on latest stable Next `16.2.6`, but npm still flags Next's nested `postcss@8.4.31` | Monitor Next patch releases; avoid `npm audit fix --force` because it suggests a breaking downgrade |
| Medium | Admin page performs N+1 Supabase queries | It fetches conversations, then customer/messages per conversation | Replace with joined/select query or server endpoint |
| Medium | AI response generation is keyword based | Works for first pass, but not a robust LLM/RAG pipeline | Decide whether to integrate OpenAI/Anthropic or keep rules-based replies |
| Medium | Delivery status webhook route exists but status handling needs verification | Accurate customer conversation state depends on Twilio callbacks | Test and document status callback flow |
| Medium | No automated tests are present | Webhook, signature, and database logic carry high regression risk | Add focused unit tests for parser/signature/reply logic and route smoke tests |
| Low | Setup docs still include create-next-app boilerplate in `README.md` | Makes the project harder to understand quickly | Replace with project-specific README |

## Suggested Work Sequence

1. Document RLS expectations and verify schema execution against a fresh Supabase project.
2. Verify webhook flow locally with test payloads and expected signature behavior.
3. Seed knowledge base with realistic business content, then test grounded replies.
4. Confirm production deployment settings in Vercel and Twilio.
5. Add minimal automated tests around the webhook and assistant reply logic.
6. Decide whether `SAChatbot` should be merged, linked, or treated as a separate prototype.

## Hardening Pass Results - 2026-05-17

- Installed and verified with Node `22.22.3` and npm `10.9.8`.
- `SAWhatsApp/platform`: `npm ci`, `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- `SAChatbot`: `npm ci`, `npm run typecheck`, `npm run lint`, and `npm run build` pass.
- Added `SAWhatsApp/platform/.env.local.example`.
- Removed the duplicate Supabase knowledge-base index statement.
- Removed the Next.js build setting that hid TypeScript errors in `SAWhatsApp/platform`.
- Upgraded both apps from `next@16.2.4` to `next@16.2.6`.
- Residual audit note: npm still reports a moderate advisory from Next's nested `postcss@8.4.31`; latest stable Next is already installed, and `npm audit fix --force` suggests a breaking downgrade path, so this remains a watch item.

## Linear Summary

Use `docs/LINEAR_ISSUE_DRAFT.md` as the issue body for Linear until the Linear connector is available in this Codex session.
