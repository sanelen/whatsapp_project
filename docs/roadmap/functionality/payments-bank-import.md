# Payments Bank Import Notes

> Evidence captured from the 2026-06-29 Record and Replay session.
> Status: **schema, importer/parser, first manual dashboard trigger, and Gmail OAuth
> setup route are in place; live Gmail execution still needs runtime credentials.**

## Why this note exists

We now have real observed evidence for how Hamba's monthly payment data arrives:

- through a dedicated Gmail mailbox
- as Capitec transaction-notification attachments
- primarily as one-PDF-per-transaction records

This note is the durable memory for that evidence so we do not redesign the import
pipeline from scratch later.

## What the recording confirmed

### Source shape

- The bank import source is Gmail, not a manual spreadsheet flow.
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

## What is still missing

- The recording did **not** reliably preserve the spoken mapping of which files
  belong to which property/location.
- We still need one cleaner capture pass, or direct sample uploads, for:
  - verification of the `6088` / `688` shorthand nuance
  - a formal room-reference lookup table by property
  - any non-Capitec formats
  - exceptions like partial payments, bundled payments, or forwarded messages with
    altered subject lines

## Current implementation status

The database layer for this flow already exists in Supabase:

- `bank_import_mailboxes`
- `bank_import_messages`
- `bank_import_files`
- `bank_import_entries`
- `bank_import_property_mappings`
- `bank_import_unit_match_hints`

The first backend execution slice is now implemented in code:

- `src/lib/bank-import.ts` — Gmail fetch, forwarded-mail extraction, Capitec PDF
  parsing, lookup resolution, and persistence into the import/reference tables
- `src/app/api/monthly-payments/import/route.ts` — protected trigger route for
  manual runs or a future Vercel cron
- `src/app/api/monthly-payments/import/oauth/route.ts` — protected Gmail OAuth
  setup/status route
- `src/components/monthly-payments/bank-import-controls.tsx` — first manual import
  panel on `/monthly-payments`, with Gmail connection status, a period selector,
  `Pull everything`, and an `Import` trigger

### Current runtime requirement

Actual Gmail pulls require one of these auth paths where the route runs.

Preferred for the observed `info.hambatrading@gmail.com` inbox:

- `GMAIL_OAUTH_CLIENT_ID`
- `GMAIL_OAUTH_CLIENT_SECRET`
- `GMAIL_OAUTH_REFRESH_TOKEN`

Alternative for Google Workspace domain-wide delegation:

- `GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY`

Operational helpers:

- optional callback override: `GMAIL_OAUTH_REDIRECT_URI`
- optional for cron protection: `BANK_IMPORT_CRON_SECRET`

The Codex Gmail connector was authenticated as `info.hambatrading@gmail.com` during
the 2026-06-29 implementation pass, and a Capitec search found forwarded messages
with `message/rfc822` attachments. One sample had subject
`Capitec Business Transaction Notification - 36683Capitec.pdf` and an attached
`Capitec Business Transaction Notification.eml`, which matches the nested `.eml`
path the importer handles.

The next implementation slice should build:

1. add the Gmail OAuth env to the runtime
2. execute the first live import against `info.hambatrading@gmail.com`
3. bind Quarry Heights once its property row exists in Supabase
4. add operator-managed unit hint rows for room/reference lookup
5. expand the admin review UI from the current trigger into month-range pull,
   dedupe review, and provenance audit
