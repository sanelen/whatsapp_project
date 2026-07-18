# Chat/WhatsApp Validation Ledger

Last updated: 2026-07-18

## Baseline evidence on `main`

| Capability | Status | Evidence |
|---|---|---|
| Public landing + WhatsApp CTA | Verified | `src/app/page.tsx` |
| Public legal pages | Verified | `/privacy`, `/terms`, `/data-deletion` |
| Google-only staff boundary | Verified 2026-07-17 | `src/proxy.ts`, auth callback, production walkthrough |
| Staff hub: Chatbox/Payments/Admin/logout | Verified 2026-07-17 | `src/app/staff/page.tsx`, production walkthrough |
| Exact public webhook route | Verified | `src/proxy.ts`, `src/proxy.test.ts` |
| Challenge/signature helpers | Verified | `src/lib/whatsapp-webhook.ts` and test |
| Durable Inbox repository | Not yet evidenced | CW-1 |
| Persisted takeover/manual reply/resume | Not yet evidenced | CW-2 |
| Idempotent provider events/delivery states | Not yet evidenced | CW-3 |
| Interested-tenant automation | Not yet evidenced | CW-4 |
| Sandbox end-to-end run | Not yet evidenced | CW-5 |

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
