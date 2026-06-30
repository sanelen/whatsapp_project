# Handover: Bank Import Duplicate Elimination

**Date:** 2026-07-01
**Status:** Analysis complete, implementation planned, partially implemented (check bottom for update)

---

## 1. The Problem

The dashboard shows **103 duplicate files skipped** on a single import run. Every run re-processes messages it has already fully handled — downloading attachments, computing SHA256 hashes, parsing PDF text — only to conclude "duplicate" at the end. This wastes Gmail API quota, CPU time, and makes the import feel slow.

The user wants:
- A fast way to check if an email has already been dealt with, BEFORE touching PDFs
- The Drive import to not re-import files that the app itself archived there
- The flow to be more efficient without breaking anything

---

## 2. The Current Pipeline (How It Works Today)

**File:** `src/lib/bank-import.ts` (1781 lines)
**Supporting:** `src/lib/google-drive.ts` (184 lines)
**API route:** `src/app/api/monthly-payments/import/route.ts`

### Flow for source="both" (default):

```
1. Gmail Import (importMailboxPayments)
   ├── Build Gmail search query (has:attachment, subject filter, label filter, after: date)
   ├── List matching messages (max 25 by default)
   ├── FOR EACH message:
   │   ├── Fetch full message from Gmail API (format=full)
   │   ├── Upsert into bank_import_messages (mailbox_id, gmail_message_id)
   │   ├── Extract all attachments (walk MIME tree, handle nested .eml files)
   │   ├── FOR EACH attachment:
   │   │   ├── Compute SHA256 of file bytes
   │   │   ├── Check bank_import_files for existing file_sha256 → "duplicate"
   │   │   ├── Check bank_import_files for (message_id, gmail_attachment_id) → "duplicate"
   │   │   ├── Even if duplicate: re-parse PDF, sync entry, upsert payment reference
   │   │   ├── If new: upload to Supabase storage, parse PDF, create entry + payment reference
   │   │   └── Mark file as parsed/unsupported/failed
   │   └── Mark message as processed
   └── Update mailbox last_synced_at

2. Drive Import (importDrivePayments)
   ├── List ALL PDFs under "Hamba Trading Bank Files" folder (recursive)
   ├── FOR EACH PDF:
   │   ├── Download file bytes from Drive
   │   ├── Upsert into bank_import_messages with gmail_message_id = "drive:{fileId}"
   │   ├── Process same as Gmail attachment (SHA256 check, parse, etc.)
   │   └── Mark message as processed

3. Drive Archive (archiveStoredFilesToDrive)
   ├── Find all bank_import_files where drive_file_id IS NULL
   ├── Download from Supabase storage
   ├── Re-parse PDF to determine billing period + building name
   ├── Upload to Drive under "Hamba Trading Bank Files / {period} / {building}"
   └── Store drive_file_id back on bank_import_files row
```

### The Feedback Loop:

```
Gmail → extract PDF → store in DB → archive to Drive
                                          ↓
Drive → list PDFs → download → re-process (duplicate!) → re-archive (already has drive_file_id, skipped)
```

### Current Deduplication Layers:

| Layer | What | Where | Problem |
|-------|-------|-------|---------|
| Message upsert | `(mailbox_id, gmail_message_id)` | `upsertBankImportMessage` L813-843 | Only prevents duplicate rows, does NOT skip processing |
| File SHA256 | `file_sha256` column | `createBankImportFile` L916-959 | Flags as duplicate but STILL re-parses PDF via `syncEntryForExistingFile` |
| File attachment ID | `(message_id, gmail_attachment_id)` | `createBankImportFile` L930-936 | Same — flags but doesn't skip |
| Entry fingerprint | `org\|type\|date\|time\|txnId\|acct\|amt\|ref` | `upsertBankImportEntry` L979-1029 | Upsert prevents duplicate rows, but all upstream work already done |
| Payment reference | `bank_import_entry_id` lookup | `upsertPaymentReferenceFromImport` L1031-1076 | Updates existing, inserts new — works correctly |

### Key Database Tables:

- `bank_import_mailboxes` — configured mailboxes (email, label/subject filters, last_synced_at)
- `bank_import_messages` — one row per Gmail message or Drive file processed. Has `import_status` and `processed_at` columns
- `bank_import_files` — one row per attachment. Has `file_sha256`, `drive_file_id`, `drive_archived_at`
- `bank_import_entries` — parsed transaction data. Has `entry_fingerprint` (unique)
- `payment_references` — the actual payment records used by the units table
- `bank_import_property_mappings` — maps account number suffix → property
- `bank_import_unit_match_hints` — match rules (reference_contains, regex, amount_equals, etc.)

---

## 3. The Fix Plan (4 Changes)

All changes are in `src/lib/bank-import.ts`. No schema changes needed — the `import_status` and `processed_at` columns already exist on `bank_import_messages`.

### Fix 1: Message-level early skip in Gmail import

**Where:** `importMailboxPayments()` function, L1451-1503
**What:** Before fetching the full Gmail message, check if we've already processed this `gmail_message_id` for this mailbox. If `import_status = 'processed'`, skip entirely.

**Implementation:**
```typescript
// Before the message loop, load all processed message IDs in one query:
const admin = getSupabaseAdmin();
const { data: processedMessages } = await admin
  .from('bank_import_messages')
  .select('gmail_message_id')
  .eq('mailbox_id', mailbox.id)
  .eq('import_status', 'processed');
const processedMessageIds = new Set(
  (processedMessages ?? []).map((m: { gmail_message_id: string }) => m.gmail_message_id)
);

// Then in the loop, before the Gmail API fetch:
if (processedMessageIds.has(listedMessage.id)) {
  continue; // Skip — already fully processed
}
```

**Impact:** Eliminates ~90% of the duplicate work. No Gmail API fetch, no attachment download, no PDF parsing. Just a Set lookup.

### Fix 2: Drive import — skip app-archived files

**Where:** `importDrivePayments()` function, L1509-1585
**What:** When listing Drive PDFs, skip any file that has `appProperties.hambaFileId` set — these were uploaded by our own `archiveStoredFilesToDrive` and are already in the DB.

**Implementation:**
```typescript
// In the Drive file loop:
if (driveFile.appProperties?.hambaFileId) {
  continue; // This file was archived by us — already in the DB
}
```

**Impact:** Breaks the feedback loop. Drive import only processes files that were NOT created by the app's archive step (i.e., manually placed files or files from other sources).

### Fix 3: Drive import — skip already-processed Drive file IDs

**Where:** `importDrivePayments()` function, same loop
**What:** Pre-load all `gmail_message_id` values starting with `drive:` for this mailbox, same pattern as Fix 1.

**Implementation:**
```typescript
// Same pre-load pattern:
const { data: processedDriveMessages } = await admin
  .from('bank_import_messages')
  .select('gmail_message_id')
  .eq('mailbox_id', mailbox.id)
  .eq('import_status', 'processed')
  .like('gmail_message_id', 'drive:%');
const processedDriveIds = new Set(
  (processedDriveMessages ?? []).map((m: { gmail_message_id: string }) => m.gmail_message_id)
);

// In the loop:
if (processedDriveIds.has(`drive:${driveFile.id}`)) {
  continue;
}
```

### Fix 4: Update summary counters for skipped messages

**Where:** `BankImportRunSummary` type and both import functions
**What:** Add a `messagesSkipped` counter so the dashboard can show "X messages skipped (already processed)" instead of inflating the duplicate count.

---

## 4. What NOT to Change

- **Entry fingerprint dedup** — keep as-is, it's the safety net
- **File SHA256 dedup** — keep as-is, catches edge cases where the same PDF arrives via different messages
- **Payment reference upsert** — keep as-is, handles re-matching correctly
- **Gmail search query** — don't add `before:` back, the comment at L366-374 explains why (forwarded messages have later received-dates)
- **The archive step** — keep archiving to Drive, just make Drive import smart enough to skip archived files

---

## 5. Files to Edit

| File | Change |
|------|--------|
| `src/lib/bank-import.ts` | All 4 fixes (functions: `importMailboxPayments`, `importDrivePayments`, `BankImportRunSummary` type) |

No other files need changes. The API route, UI components, and database schema stay the same.

---

## 6. Testing

After implementing, run a bank import and verify:
- `messagesSkipped` count appears in the response
- `duplicateFiles` count drops dramatically (should be near 0 for a second consecutive run)
- `entriesCreated` and `paymentReferencesCreated` remain correct for genuinely new messages
- No data loss — all existing entries and payment references untouched

---

## 7. Implementation Status

**UPDATE THIS SECTION after implementing:**

- [ ] Fix 1: Message-level early skip in Gmail import
- [ ] Fix 2: Drive import — skip app-archived files
- [ ] Fix 3: Drive import — skip already-processed Drive file IDs  
- [ ] Fix 4: Update summary counters for skipped messages
- [ ] Tested manually / verified

If the session ran out before completing implementation, the next session should:
1. Read this file
2. Read `src/lib/bank-import.ts` (the full 1781-line file)
3. Apply the 4 fixes as described above
4. Update the checkboxes in this section
