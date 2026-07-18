# Chat/WhatsApp Flow Test Contract

Last updated: 2026-07-18

These are the required flows for the Active Chat/WhatsApp workstream. Use fixtures or
a sandbox; never use a real tenant conversation in an unattended run.

| Flow | Requirement | Expected result |
|---|---|---|
| Signed inbound message | CW-3 | Valid raw-body signature is accepted; invalid signature is rejected. |
| Duplicate inbound event | CW-1/CW-3 | One durable message exists after repeated delivery. |
| Conversation ordering | CW-1 | Messages return in deterministic provider/event time order. |
| Takeover | CW-2 | State and audit event persist; bot send is suppressed. |
| Manual reply | CW-2 | Authenticated staff reply is stored as outbound with actor attribution. |
| Resume | CW-2 | Explicit resume persists and later automation may proceed. |
| Delivery progression | CW-3 | Pending → sent → delivered/read advances; later state never regresses. |
| Malformed/unsupported event | CW-3 | Event is safely rejected or recorded without partial side effects. |
| Interested tenant | CW-4 | Verified property truth is used; unknown/conflict escalates. |
| Human/opt-out/sensitive request | CW-2/CW-4 | Automation pauses or escalates; no invented reply is sent. |
| Public/staff boundary | Cross-cutting | Public landing stays public; Inbox/tools remain staff-protected. |
| Logout regression | Cross-cutting | Logout returns to public site and protected routes require Google auth. |

Before handoff, run targeted tests plus the repository's full unit test, typecheck,
and production build commands. Browser verification is required for UI changes; API
and repository slices require contract/integration tests and recorded fixtures.
