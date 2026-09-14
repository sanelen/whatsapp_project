# Property waiting list: full flow review

**Verdict: backend verified; native launch blocked by Meta's primary-phone verification requirement.**

Scope: the owner's four-field native WhatsApp waiting-list Flow and its existing Google Sheet. Trigger: pre-release. This adds a dedicated encrypted endpoint and save-confirmation screen; the existing bot and payments routes are unchanged. The owner authorized deployment and publication after testing on September 15. Phone migration, re-registration and unsolicited messages remain outside scope.

## Flow and architecture

| Step | Implementation | Evidence / remaining dependency |
| --- | --- | --- |
| Launch form | Existing native Flow draft | A supported launcher must supply a unique signed `flow_token`; Business Agent launch compatibility is not yet established. |
| Name, surname, property, number | Native `WAITING_LIST` screen | Existing approved exterior thumbnails/areas and four required controls retained; no prices. |
| Join waiting list | Encrypted `data_exchange` | Signature, RSA/AES decryption, launch-token validation, input normalization, then Google save. |
| Record interest | Dedicated Sheets writer | Actual Sheet row created; exact retry and changed-name duplicate did not add rows. |
| Confirm | Native `CONFIRMATION` screen | Returned only after persistence or a confirmed active duplicate. No reservation promise. |
| Recover | Same form with values and error | Encrypted failure tests confirm retained fields; native on-device retry still needs verification. |

The shortest user path is one form and one saved-result screen. Do not add an application wizard, pricing, documents, tenant qualification or an admin workspace. The Sheet is the sole interest register for this feature. This does not replace the app's tenant/occupancy data or create a second payment status model. Architecture §9's Supabase and bank-import debt is not modified.

Retries use a durable receipt and a payload fingerprint; business duplicates use normalized phone plus property across active statuses. Names never overwrite an existing entry. Housed/Withdrawn allow a new distinct interest submission. The same event remains idempotent after a status change. Atomic Sheets batches combine a unique developer-metadata ID with the row write, so concurrent integration writers cannot both commit from the same snapshot. This gate does not serialize direct human edits: operators must not type into the blank row being filled during intake. A transactional database with a controlled editing surface would be needed for that stronger guarantee.

## QA

13 focused tests pass: encryption/signature checks, phone normalization, property validation, first empty row, preserved later rows, concurrent same/different events, changed-name duplicates, event reuse with changed payload, terminal-status behavior, response loss, and failure retention. The production Next build and six release-artifact checks passed after the timeout refinement and explicit existing-app-secret opt-in. Native editor validation showed zero JSON errors for the endpoint-backed candidate. Actual Sheet backend tests are distinct from Meta delivery evidence.

The Google connection uses a separate `drive.file` grant for the selected existing Sheet, with Sheets and Picker APIs enabled. The original Gmail credentials were not replaced. A labeled TEST ONLY / CONNECTION CHECK row was left temporarily for owner inspection. Remove that exact row and its two test receipts once inspected; retain screenshots separately.

Not yet verified: deployed encrypted exchange, Meta health check, primary phone's registered encryption key, actual draft delivery, native failure/retry behavior, and published availability. These remain release acceptance criteria rather than inferred passes.

### Verified Meta blocker

After the owner's explicit permission grant, Graph GET of the primary WABA succeeded and identified phone `1178193182049688`, +27812674647, with `platform_type: NOT_APPLICABLE`. Its encryption GET returned a blank public key and `MISMATCH`. The attempted dedicated public-key registration was rejected with code 100 and the explicit reason **Phone number is not verified through SMS or voice**. No key changed. No phone verification, migration or registration was attempted. This is a provider prerequisite, independent of the working Sheet writer and Vercel login.

Business Agent currently presents **Get started** for the primary number. Its onboarding was left untouched; no supported signed-token launch integration was established. The smallest current-number alternative is a mobile web form shared as a WhatsApp link, reusing this persistence layer with a separately designed public-form security boundary. A native release instead needs an approved supported verification/coexistence path that preserves the current Business app. Neither path is silently substituted here.

## UX and accessibility

Manual review follows the local forms protocol. The design/accessibility plugin skills were not present, so no automated plugin verdict is claimed. Native controls provide visible labels, one-column layout, property names/areas alongside photos, and a phone input. Errors use text, not color alone. Meta controls rendering, focus and pending-button behavior; HeroUI applies to web surfaces and is not used inside native Flows. On-device focus, keyboard and screen-reader checks remain open. A gray/disabled button is not proof of a saved row; only the backend-backed result establishes it.

## Roadmap fit and tensions

This is an owner-promoted, narrow prospective-renter intake slice, consistent with FR-3's guarded interest capture. It does not enable servicing/offboarding or alter Meta Business Agent knowledge. The tension is that persistence tests pass while the real launch path is not yet verified. A valid preview and a ready deployment cannot close that gap. Track the slice explicitly in requirements and the Linear gaps register.

## Priorities

1. Confirm the correct primary phone/app/key and supported unique-token launch path; complete a real draft submission before publishing.
2. Deploy with dedicated writer/crypto configuration and verify encrypted success, retry and failure against the deployed URL. Keep all secrets server-only.
3. Clean the exact labeled demo row after inspection; capture native submission plus Sheet evidence instead.
4. Record deployment/Flow status and add the outstanding launch/on-device acceptance evidence to the tracking documents.
5. Complete on-device keyboard/focus and assistive-technology checks.

## Screenshot checklist

- [x] Original saved native form: property thumbnails and required fields.
- [x] Real backend demo row under the existing Sheet headers.
- [ ] Connected endpoint and healthy primary-phone encryption.
- [ ] Actual native saved confirmation plus its Sheet row.
- [ ] Retry / changed-name duplicate with unchanged row count.
- [ ] Failure state retaining entered details.

## References

- [Meta's endpoint example](https://github.com/WhatsApp/WhatsApp-Flows-Tools/tree/main/examples/endpoint/nodejs/basic)
- [Google atomic batch updates](https://developers.google.com/workspace/sheets/api/guides/batchupdate)
- [Google Picker per-file authorization](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker)
