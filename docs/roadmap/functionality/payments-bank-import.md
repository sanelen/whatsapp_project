# Payments Bank Import Notes

Last updated: 2026-07-12

> Evidence began with the 2026-06-29 Record and Replay session and was extended with
> live Gmail, Drive, PDF, and CSV reconciliation on 2026-07-12.
> Status: **Gmail and controlled Drive imports are live. Import audit,
> configuration, layered dedupe, account policies, and property routing are shipped.**

## Why this note exists

We now have real observed evidence for how Hamba's monthly payment data arrives:

- through a dedicated Gmail mailbox
- as Capitec transaction-notification attachments
- primarily as one-PDF-per-transaction records

This note is the durable memory for that evidence so we do not redesign the import
pipeline from scratch later.

## What the recording confirmed

### Source shape

- Gmail is the automatic notification source. Google Drive Bank uploads are the
  controlled fallback for statement CSV/PDF files; there is no local upload control.
- Messages carry attachments with names like `70006Capitec.pdf`,
  `98151Capitec.pdf`, `36683Capitec.pdf`, `109044Capitec.pdf`, and many others.
- The session exposed a sizeable sample set of unique filenames, which is enough to
  confirm the naming pattern is stable enough to treat as attachment metadata, but
  not trustworthy enough to use as the only dedupe key.
- One `.eml` wrapper message was also visible, which suggests some messages may be
  forwarded before landing in the mailbox.

### Representative PDF fields

One visible Capitec PDF exposed these extractable fields on page 1:

- `Transaction Type`
- `Date Time Actioned`
- `Transaction ID`
- `Account Paid To`
- `Amount Received`
- `Reference`
- `Available Balance`

This is enough to define the first parser contract for `bank_import_entries`.

### Business interpretation from the walkthrough

The follow-up walkthrough clarified how Hamba interprets those fields:

- We care about **incoming funds** only.
- We do **not** want transfers and other non-rent movement types in the first pass.
- `Date Time Actioned` is operationally important and should be captured as a core
  field.
- `Amount Received` is the payment amount to reconcile.
- `Reference` is important and should be captured exactly as shown.
- `Available Balance` is not operationally important for matching, but can still be
  stored for completeness in the raw import layer.

## Current account/location mapping rules

These rules came directly from the owner's walkthrough and should be treated as the
current working mapping until replaced by a more formal register.

### Destination account mapping

- Account ending `6088` = **Quarry Heights**
- Account ending `7904` = **Essex / Berea**
- Account ending `2815` = the **legacy Quarry Heights** account, verified from
  the 2026-07-12 Capitec transaction-history CSV. It will be phased out.
- Account ending `9613` = **West Rich legacy**, property-locked.
- Account ending `7904` = **Essex/Berea**, property-locked.
- Account ending `6570` = **mixed legacy Quarry Heights and West Rich**.
- Account ending `7467` = **internal/excluded**. It must never create an import
  entry or payment reference.

Some current/main accounts can contain both Quarry Heights and West Rich
transactions. For those shared accounts, property resolution follows this order:

1. account-scoped reference rule
2. account-scoped exact-amount rule
3. single-property account mapping
4. unresolved/operator review when the strongest signals disagree

Amount-only rules must be scoped to an account. Do not create a global `R 2,200`
or West Rich amount rule because the same amount can legitimately occur elsewhere.

The user also referred to "688" while reviewing older records; based on the same
conversation this appears to be shorthand for the same **6088 / Quarry Heights**
destination account, but this should be verified against a direct sample before we
hard-code it.

### Unit / tenant hints from references and amounts

- A Quarry Heights sample was identified as **room `QH-06`**
- `Esmkwanazi` in Berea/Essex maps to **room 5**
- A `R 4,600` rent amount in that context was also described as **room 5**
- A `709...` style reference was described as **room 7**

These should not be treated as deterministic parser rules yet. They are best used as
operator hints or candidate matches until we build a verified lookup table.

## Filtering rules

For the first importer/admin workflow:

1. Pull from the Hamba mailbox (`info.hambatrading@gmail.com` observed in the
   recording; user also verbally referred to `info@hamburtrading`)
2. Prioritize Capitec transaction-notification messages
3. Include forwarded/"mail inside a mail" cases
4. Parse attachments and extracted mail bodies
5. Keep only rows where `Transaction Type = Incoming Funds`
6. Exclude transfers and other non-incoming transaction types from the dashboard
   reference pool
7. Exclude interest received across every source
8. Exclude account `7467`, outgoing `Account Paid From` notifications, merchant
   reservations, and statement debits before payment-reference creation
9. On mixed account `6570`, accept only positive `Payment Received` rows of at
   least R1,900; route explicit QH/WR references before the R2,200/R1,900 fallback

### Billing period window

Hamba treats each selected billing month as a working window from the **9th of the
previous month through the 8th of the selected month**, inclusive. This captures
early and late rent payments around month boundaries:

- May 2026 = 2026-04-09 through 2026-05-08
- June 2026 = 2026-05-09 through 2026-06-08

Manual historical period pulls should use this window and should not be constrained
by `last_synced_at`; otherwise a latest-data cron run could prevent backfilling an
older month.

## Import design implications

### Minimum extraction payload

For each imported attachment, we should extract and persist:

- source mailbox
- Gmail message id
- attachment filename
- attachment hash (`sha256`)
- statement / actioned timestamp
- transaction id
- transaction type
- amount received
- payer reference
- masked destination account
- raw extracted text
- parser status / parser version

### Dedupe rules

Do not trust any single signal on its own. Use layered dedupe:

1. Gmail message id to avoid re-importing the same email
2. file hash to avoid re-importing the same attachment
3. extracted transaction fingerprint to avoid double-posting the same payment line
4. cross-source identity (account + transaction time/date + amount + canonical
   reference) so a statement row cannot duplicate its Gmail/PDF notification

### Matching rules

The likely first matching key is the bank `Reference` field, with amount and date as
secondary checks. This should eventually reconcile into `payment_references` and then
into `unit_payment_periods`.

In addition, the destination account suffix gives an important first-pass location
split:

- `6088` => Quarry Heights
- `7904` => Essex / Berea

That means account mapping should happen before unit-level matching whenever the
destination account is present.

## Per-unit table date flow

The reviewed per-unit table now includes an explicit **Date** column. For imported
bank references, that date should flow like this:

1. Capitec PDF `Date Time Actioned`
2. parsed `bank_import_entries.transaction_date`
3. copied into `payment_references.received_at`
4. displayed in the per-unit row `Date` cell after the reference is matched

This keeps the visible row date anchored to the actual bank transaction instead of
an operator-entered status note. If a manual reference is created outside the bank
import path, `payment_references.received_at` remains the canonical display date for
the per-unit table.

## What is still missing

- A durable `import_run` model with progress, retry, and immutable run totals.
- A link from every skipped duplicate to the canonical transaction it matched.
- Seeded browser tests covering Drive import through audit, reference pool, and match.
- An explicit split workflow for one payment naming more than one room. These remain
  unmatched by design today.
- A validated operator-editing workflow if account policy must move out of code/SQL.

## Current implementation status

The database layer for this flow already exists in Supabase:

- `bank_import_mailboxes`
- `bank_import_messages`
- `bank_import_files`
- `bank_import_entries`
- `bank_import_property_mappings`
- `bank_import_unit_match_hints`

The backend and operator validation slices are implemented:

- `src/lib/bank-import.ts` — Gmail fetch, forwarded-mail extraction, Capitec PDF
  parsing, lookup resolution, and persistence into the import/reference tables
- `src/app/api/monthly-payments/import/route.ts` — protected trigger route for
  manual runs or a future Vercel cron
- `src/app/api/monthly-payments/import/google-cloud/route.ts` — protected Google
  Cloud Gmail API setup/status route
- `src/components/monthly-payments/bank-import-controls.tsx` — source selector,
  period selector, and import trigger on `/monthly-payments`; no local file upload
- `src/lib/import-audit.ts` and `/monthly-payments/import-audit` — read-only
  file/transaction/database/match provenance
- `src/lib/import-configuration.ts` and
  `/monthly-payments/import-configuration` — read-only mailbox, masked account,
  parser policy, property mapping, and unit-hint explanation

### Current runtime requirement

Actual Gmail pulls require one of these auth paths where the route runs.

Preferred Google Cloud OAuth path for the observed `info.hambatrading@gmail.com`
inbox:

- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REFRESH_TOKEN`

Alternative for Google Workspace domain-wide delegation:

- `GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY`

Operational helpers:

- `BANK_UPLOADS_DRIVE_FOLDER_ID` — operator-managed Drive folder read by the
  explicit **Bank** import source
- production callback override: `GMAIL_OAUTH_REDIRECT_URI`
- optional for cron protection: `BANK_IMPORT_CRON_SECRET`

Vercel Preview and Production were configured on 2026-07-13 with the OAuth client,
refresh token, production callback, and Bank Uploads folder as sensitive environment
variables. The stored refresh token was verified against the Gmail profile endpoint,
and the configured Drive folder was verified active and listable before deployment.
PDF extraction must go through `src/lib/pdf-text.ts`. It loads the
`pdf-parse/worker` Node runtime before `pdf-parse`, ensuring Vercel functions ship
the native canvas dependency and install the DOM globals required by PDF.js.

The product integration uses Google Cloud credentials to call the Gmail API
directly; mailbox data is not pulled through an app connector. During the
2026-06-29 implementation pass, a mailbox inspection confirmed the real source
shape includes forwarded messages with `message/rfc822` attachments. One sample had subject
`Capitec Business Transaction Notification - 36683Capitec.pdf` and an attached
`Capitec Business Transaction Notification.eml`, which matches the nested `.eml`
path the importer handles.

The read-only import validation slice shipped on 2026-07-12:

- `/monthly-payments/import-audit` groups source files by the selected rent
  period and source (`Gmail`, `Drive bank`, or generic `Drive`).
- Each file exposes parser status, Drive archive/source state, hash provenance,
  extracted incoming amounts, database presence, and current unit match or
  sign-off status.
- The page deliberately does not edit matches; operators continue matching in
  the reference pool or property table.
- `/monthly-payments/import-configuration` documents the live Gmail mailbox,
  masked account/property mappings, parser acceptance policy, and the folded
  unit-rule inventory. An account observed on an outgoing `Account Paid From`
  notification was confirmed as internal and is shown as excluded; it is not
  promoted to a property mapping, and no ingestion source creates payments
  from that account.
- West Rich account `9613` is a property-locked historical source: its account
  mapping establishes West Rich before room-reference hints are evaluated, so
  generic room tokens from another property cannot make the import ambiguous.
- Essex/Berea account `7904` is also property-locked across Gmail notifications
  and statement CSVs. Source format decides provenance, never property linkage.
- Mixed legacy account `6570` accepts only `Payment Received` rows of at least
  R1,900 and rejects transfer descriptions. Explicit QH/WR references decide
  property first; R2,200/R1,900 provide the fallback. Combined room payments
  stay unmatched for operator review.

The next implementation slice should build:

1. durable import runs/jobs with retry and progress
2. canonical duplicate provenance and source comparison
3. combined-payment splitting with an explicit operator decision
4. seeded Playwright coverage for the complete import/reconciliation path
