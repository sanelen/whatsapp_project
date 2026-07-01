---
name: bank-import-debug
description: >
  Diagnose and fix bank import pipeline issues. Traces the full flow from
  Gmail → Google Drive → Supabase database, checks billing windows, verifies
  entries and payment references, identifies common failures (unmapped accounts,
  unsupported PDFs, billing window mismatches, stuck "processed" messages).
  Use when: "why didn't my import work", "trace the import", "check payment
  references", "missing entries", "import not creating entries", "bank import
  debug", "re-run import", or any issue where expected transactions aren't
  appearing after a bank import run.
---

# Bank import pipeline debugger

Systematic diagnosis of the Hamba bank import pipeline. The pipeline pulls
Capitec transaction notification PDFs from Gmail and Google Drive, parses them,
creates `bank_import_entries`, and upserts `payment_references`.

## Architecture

**File:** `src/lib/bank-import.ts` (core logic)
**Supporting:** `src/lib/google-drive.ts` (Drive API helpers)
**API route:** `src/app/api/monthly-payments/import/route.ts`

### Flow
```
Gmail API → fetch messages → extract PDF attachments → SHA256 dedup
  → upload to Supabase storage → parse PDF text → validate entry
  → billing window check → create entry → upsert payment reference
  → mark message "processed" → archive to Google Drive
```

### Key tables
- `bank_import_mailboxes` — configured email accounts
- `bank_import_messages` — one row per Gmail message or Drive file
- `bank_import_files` — one row per attachment, has `parser_status` and `file_sha256`
- `bank_import_entries` — parsed transaction data, has `entry_fingerprint`
- `payment_references` — the records the dashboard uses
- `bank_import_property_mappings` — maps account suffix → property
- `bank_import_unit_match_hints` — maps reference patterns → units

## Diagnosis steps

### 1. Check what the user sees

Ask which billing period they selected and how many messages/references the
dashboard reported. The billing period determines the window filter.

### 2. Verify the billing window

```
getBillingWindowForPeriod('YYYY-MM')
```
Rule: day 1–8 = current month, day 9+ = next month.
For 2026-07: startDate = 2026-06-09, endDate = 2026-07-08.

A transaction on July 1 belongs to the July billing period. A transaction on
July 9 belongs to August.

### 3. Check messages in DB

```sql
SELECT id, gmail_message_id, import_status, processed_at, error_message
FROM bank_import_messages
WHERE mailbox_id = '<id>'
ORDER BY created_at DESC
LIMIT 20;
```

Look for:
- `import_status = 'processed'` with no corresponding entries (self-healing bug)
- `import_status = 'failed'` with an error message
- `import_status = 'pending'` that should have been processed

### 4. Check files for those messages

```sql
SELECT f.id, f.message_id, f.parser_status, f.file_sha256,
       f.drive_file_id, f.drive_archived_at,
       LENGTH(f.storage_path) as path_len
FROM bank_import_files f
JOIN bank_import_messages m ON f.message_id = m.id
WHERE m.mailbox_id = '<id>'
ORDER BY f.created_at DESC
LIMIT 20;
```

Look for:
- `parser_status = 'unsupported'` — parser couldn't handle the PDF format
- `parser_status = 'failed'` — parser threw an error
- `parser_status = 'parsed'` with no entries — billing window rejection

### 5. Check entries exist

```sql
SELECT e.id, e.file_id, e.transaction_date, e.reference, e.amount,
       e.property_id, e.destination_account_suffix
FROM bank_import_entries e
WHERE e.organization_id = '<org_id>'
ORDER BY e.created_at DESC
LIMIT 20;
```

If entries are missing for parsed files, the likely cause is:
- Transaction date outside the billing window
- The message was marked "processed" under a previous billing period run

### 6. Check payment references

```sql
SELECT pr.id, pr.reference, pr.amount, pr.payment_date,
       pr.property_id, pr.bank_import_entry_id
FROM payment_references pr
WHERE pr.organization_id = '<org_id>'
  AND pr.payment_date >= '<startDate>'
  AND pr.payment_date <= '<endDate>'
ORDER BY pr.created_at DESC;
```

### 7. Check property mappings

```sql
SELECT account_number_suffix, property_name, is_active
FROM bank_import_property_mappings
WHERE organization_id = '<org_id>';
```

If a transaction's account suffix isn't mapped, entries still get created but
with `property_id = null` — they won't appear in property-filtered views.

### 8. Verify PDF content

If a file is marked "unsupported", download the PDF from Google Drive or
Supabase storage and check the text. The parser (`parseCapitecTransactionText`)
requires a "Transaction Type" field. PDFs without this (e.g., debit orders,
outgoing payments) are not supported.

## Common issues and fixes

### Messages "processed" but no entries
**Cause:** Messages imported under wrong billing window. The file was parsed
but entries were rejected by `isEntryInsideBillingWindow`. Message was then
marked "processed".

**Fix:** The dedup skip logic (Fix 1) now checks for entries before skipping.
Messages with no entries are always re-processed. If messages are stuck, reset
them:
```sql
UPDATE bank_import_messages
SET import_status = 'pending', processed_at = NULL
WHERE id IN ('<ids>');
```

### Unmapped account suffix
**Cause:** `bank_import_property_mappings` is missing a row for the account.

**Fix:** Insert a mapping:
```sql
INSERT INTO bank_import_property_mappings
  (organization_id, property_id, account_number_suffix, property_name, is_active)
VALUES ('<org>', '<property_uuid>', '<4-digit-suffix>', '<name>', true);
```

### Unsupported PDFs
**Cause:** The Capitec parser only handles "Incoming Funds" notifications.
Other transaction types (debit orders, outgoing payments) produce PDFs without
the expected "Transaction Type" field.

**Resolution:** These are archived to `Hamba Trading Bank Files/{period}/Unsupported/`
in Google Drive for human review. Over time, support for new transaction types
can be added to `parseCapitecTransactionText`.

### Drive import re-processing archived files
**Cause:** The app archives files to Drive, then the Drive import re-downloads them.

**Fix:** The dedup logic checks `driveFile.appProperties?.hambaFileId` — files
archived by the app have this property set and are skipped.

### Duplicate file counts inflated
**Cause:** No message-level skip — every run re-fetched and re-processed all
Gmail messages.

**Fix:** Pre-load processed message IDs and skip before Gmail API fetch.
Only skip if the message has entries (to preserve self-healing).
