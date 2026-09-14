# Property waiting list connection

The candidate `property-waiting-list-endpoint.json` retains the approved native form and adds a server-backed confirmation. It is not proof of a published or connected Flow. Consult the dated review for live acceptance status.

## Fixed destinations

- Flow: `1731454068115574`; WABA: `1331485505283891`.
- Primary phone ID: `1178193182049688` (+27812674647), verified in WhatsApp Manager.
- Existing Meta app: Hamba Tenant Assistant, `1935334950508426`.
- Endpoint: `POST /api/whatsapp/flows/waiting-list` in the existing Vercel project.
- Sheet: `185I2dzEuc-spUeifJlSVDILXBuKIFcFubdcfhbN_a-k`, tab `Waiting list`, native table `PropertyWaitingList`.

## Server configuration

Keep secrets out of source, logs and client bundles. Production variables:

| Name | Purpose |
| --- | --- |
| `WAITING_LIST_ENABLED` | Exact `true` to enable; otherwise 503. |
| `WAITING_LIST_GOOGLE_CLIENT_ID`, `WAITING_LIST_GOOGLE_CLIENT_SECRET`, `WAITING_LIST_GOOGLE_REFRESH_TOKEN` | Dedicated per-file `drive.file` grant, separate from Gmail import credentials. |
| `WAITING_LIST_PRIVATE_KEY` | RSA-2048 PEM matching the primary phone's registered public key. |
| `WAITING_LIST_PRIVATE_KEY_PASSPHRASE` | Optional for an encrypted PEM. |
| `WAITING_LIST_TOKEN_SECRET` | At least 32 characters; signs per-launch tokens. |
| `WAITING_LIST_PRIMARY_PHONE_NUMBER_ID` | Exact verified primary phone ID above. |
| `WAITING_LIST_META_APP_SECRET` | Dedicated secret if deploying with another verified Meta app. |
| `WAITING_LIST_USE_EXISTING_META_APP_SECRET` | Exact `true` explicitly reuses this project's `META_APP_SECRET`; only after verifying the existing Hamba app and callback. No implicit fallback. |

The existing Hamba app's callback was verified in Meta as `https://hambatrading.co.za/api/whatsapp/webhook`. Reusing that app secret does not change the existing webhook, its phone configuration, subscriptions or outbound settings. The new endpoint validates raw request signatures and decrypts Meta's RSA-OAEP-SHA256/AES-128-GCM envelope. Responses use the inverted IV. Ping checks endpoint crypto/configuration, not Sheet health.

`scripts/connect-waiting-list-google.mjs` is a one-time local OAuth receiver using the existing client's authorized localhost callback. It requests only `drive.file`, uses PKCE/state and Picker restricted to this Sheet, and writes a separate 0600 env file. It refuses to overwrite credentials. Do not rerun simply because the callback page displays a browser error; check whether the receiver already completed the exchange.

## Launch and deployment sequence

1. Verify primary account access and read its existing encryption key before registering a new key. Never overwrite another live key without a migration plan.
2. Deploy this source and dedicated configuration to the existing Vercel project. Preserve unrelated production environment values.
3. Configure the Flow endpoint URI and correct Meta app (Meta says this app binding cannot be changed). Register the matching public key only on the verified primary phone. Check Meta health.
4. Use `issueFlowToken` from `src/lib/waiting-list/endpoint.ts` in an authorized launch path. Each launch gets a unique signed token scoped to the exact Flow/WABA/phone, expiring in 24 hours. API launch supports a `flow_token`; this repository does not add an automatic sender. Do not pass the same token to all customers, accept `unused`, or weaken validation to make a preview work.
5. Test one actual native draft submission, response loss/retry, changed-name active duplicate and the same phone for another property. Confirm the Sheet row and native response together. Any message to the owner's phone requires that recipient's explicit test-send authorization.
6. Publish only after the live checks pass. If Business Agent cannot supply the required launch token, resolve that integration contract before claiming the flow is usable.

## Data rules and operation

The four inputs map to canonical property names 33 Essex, Westrich and Quarry Heights. South African local phone numbers normalize to +27; explicit international numbers are accepted. Format normalization does not prove WhatsApp registration or number ownership. The first entirely empty row is filled with Johannesburg date, names, property, phone, Waiting, and blank Notes. Formula-like text is written as a string. No existing duplicate's name is changed.

All statuses except Housed/Withdrawn count conservatively as active. Unknown or blank statuses therefore do not cause duplicate rows. Distinct properties are distinct interests. Permanent developer-metadata receipts protect retry, even after staff updates status. Each atomic batch claims the next unique receipt ID and writes the row together. Concurrent integration requests retry from a fresh snapshot; uncertain outcomes are checked against receipts before another attempt. OAuth and all Sheet operations share an eight-second deadline, leaving time to return an encrypted retry message.

Do not delete operational receipts, rename the table/headers, or type into a blank intake row while automation is filling it. Direct human edits are outside the integration's concurrency gate. Reviewed limits are 5,000 sheet grid rows and 10,000 receipts; reaching either fails closed and needs a storage/capacity review. Google service quotas may impose earlier limits.

To disable intake, set `WAITING_LIST_ENABLED=false` and redeploy; do not roll back or erase Sheet rows/receipts to handle a failed request. Preserve receipts and secrets for recovery. Local labeled demonstration rows and only their matching test receipts may be cleaned after inspection.
