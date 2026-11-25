import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://recovery-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-test-key';
process.env.GMAIL_OAUTH_CLIENT_ID = 'test-client';
process.env.GMAIL_OAUTH_CLIENT_SECRET = 'test-secret';
process.env.GMAIL_OAUTH_REFRESH_TOKEN = 'test-refresh';
delete process.env.BANK_IMPORT_SOURCE_MAILBOX_EMAIL;

test('duplicate recovery completes a pending checkpoint only after receipt verification, preserving operator decisions', async (t) => {
  const { importMailboxPayments } = await import('./bank-import');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  [
    'Transaction Type : Incoming Funds', 'Date Time Actioned : 22/06/2026 13:35:29',
    'Transaction ID : TEST-RECOVERY', 'Account Paid To : ****0000',
    'Amount Received : R 2,200.00', 'Reference : TEST ROOM 1', 'Available Balance : R 2,200.00',
  ].forEach((line, index) => page.drawText(line, { x: 20, y: 700 - index * 25, size: 12 }));
  const bytes = Buffer.from(await pdf.save());
  const file = { id: 'file-1', parser_status: 'pending', drive_file_id: 'drive-1',
    drive_archived_at: '2026-06-22T12:00:00Z', drive_folder_path: 'Existing archive' };
  const entry = { id: 'entry-1', file_id: file.id, organization_id: 'org-1', property_id: 'property-1',
    transaction_type: 'Incoming Funds', transaction_date: '2026-06-22', transaction_time: '13:35:29',
    reference: 'TEST ROOM 1', amount: 2200, destination_account_suffix: '0000' };
  const reference = { id: 'reference-1', signed_off: true, unit_id: 'operator-unit', amount: 2200 };
  let failReferenceRead = true;
  let messageStatus = '';
  let archiveDownloads = 0;
  let storageWrites = 0;
  let directAttachment = false;
  let storedAttachmentId = 'attachment-known';
  let archiveMissing = false;
  let financialInserts = 0;
  let receiptWrites = 0;
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'test-access' });
    if (url.hostname === 'gmail.googleapis.com') {
      if (url.pathname.endsWith('/profile')) return Response.json({ emailAddress: 'business@example.com' });
      if (url.pathname.endsWith('/messages/message-1')) return Response.json({ id: 'message-1',
        internalDate: '1782133200000', payload: { mimeType: 'application/pdf', filename: 'sample.pdf',
          body: directAttachment ? { attachmentId: 'attachment-known' } : { data: bytes.toString('base64url') } } });
    }
    if (url.hostname === 'www.googleapis.com' && url.searchParams.has('fields')) return archiveMissing ? new Response('', { status: 404 }) : Response.json({ id: 'drive-1', trashed: false });
    if (url.hostname === 'www.googleapis.com' && url.searchParams.get('alt') === 'media') { archiveDownloads++; return archiveMissing ? new Response('', { status: 404 }) : new Response(bytes); }
    if (url.hostname === 'recovery-test.invalid') {
      if (url.pathname.startsWith('/storage/v1/object/uploads/')) { storageWrites++; return Response.json({ Key: 'stored' }); }
      const table = url.pathname.split('/').at(-1);
      if (table === 'bank_import_property_mappings' || table === 'bank_import_unit_match_hints') return Response.json([]);
      if (table === 'bank_import_messages') {
        if (method === 'POST') return Response.json({ id: 'message-row' });
        messageStatus = JSON.parse(String(init?.body)).import_status;
        return new Response(null, { status: 204 });
      }
      if (table === 'bank_import_file_occurrences' || table === 'bank_import_mailboxes') return new Response(null, { status: 204 });
      if (table === 'bank_import_files') {
        if (method === 'PATCH') { Object.assign(file, JSON.parse(String(init?.body))); return new Response(null, { status: 204 }); }
        assert.equal(method, 'GET');
        if (url.searchParams.get('select')?.includes('bank_import_entries')) {
          assert.ok(url.searchParams.get('select')?.includes('payment_references!payment_references_bank_import_entry_id_fkey(id)'), 'Disambiguate the receipt backlink from the entry pointer');
          const checkpoint = { ...file, gmail_attachment_id: storedAttachmentId, bank_import_entries: [{ id: entry.id, payment_references: failReferenceRead ? [] : [{ id: reference.id }] }] };
          return Response.json(url.searchParams.has('message_id') ? (file.parser_status === 'parsed' ? [checkpoint] : []) : checkpoint);
        }
        return Response.json(file);
      }
      if (table === 'bank_import_entries') {
        if (method === 'POST') financialInserts++;
        if (method === 'PATCH') return new Response(null, { status: 204 });
        return Response.json(entry);
      }
      if (table === 'payment_references') {
        if (method !== 'GET') receiptWrites++;
        if (failReferenceRead) return Response.json({ message: 'injected reference read failure' }, { status: 500 });
        return Response.json(reference);
      }
    }
    throw new Error(`Unexpected request in isolated recovery test: ${url.hostname}${url.pathname}`);
  });
  const mailbox = { id: 'mailbox-1', organization_id: 'org-1', email_address: 'business@example.com',
    provider: 'gmail' as const, label_filter: '', subject_filter: '', is_active: true, last_synced_at: null };
  const run = () => importMailboxPayments(mailbox, { messageIds: ['message-1'] });
  const failed = await run();
  assert.equal(failed.failedMessages, 1);
  assert.equal(file.parser_status, 'pending', 'Incomplete receipt recovery must not clear the checkpoint');
  assert.equal(messageStatus, 'failed');
  failReferenceRead = false;
  const recovered = await run();
  assert.equal(recovered.failedMessages, 0);
  assert.equal(recovered.duplicateFiles, 1);
  assert.equal(recovered.paymentReferencesCreated, 0);
  assert.equal(file.parser_status, 'parsed');
  assert.equal(messageStatus, 'processed');
  const savedWork = { archiveDownloads, storageWrites };
  const replay = await run();
  assert.equal(replay.failedMessages, 0);
  assert.equal(replay.duplicateFiles, 1, 'Unrelated checkpoint IDs must not count as a second duplicate');
  assert.equal(replay.paymentReferencesCreated, 0);
  assert.deepEqual({ archiveDownloads, storageWrites }, savedWork, 'Hash replay must not download or upload completed evidence');
  directAttachment = true;
  const metadataReplay = await run();
  assert.equal(metadataReplay.failedMessages, 0);
  assert.equal(metadataReplay.duplicateFiles, 1, 'A metadata skip counts the actual attachment once');
  assert.equal(metadataReplay.attachmentsProcessed, 0, 'Known Gmail attachment must be skipped before downloading');
  assert.deepEqual({ archiveDownloads, storageWrites }, savedWork);
  directAttachment = false;
  storedAttachmentId = `gmail-inline:sample.pdf:${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}`;
  const inlineReplay = await run();
  assert.equal(inlineReplay.duplicateFiles, 1);
  assert.equal(inlineReplay.attachmentsProcessed, 0, 'Inline evidence skips processing after its stable hash is recognized');
  assert.deepEqual({ archiveDownloads, storageWrites }, savedWork);
  archiveMissing = true;
  assert.equal((await run()).failedMessages, 1, 'A missing archived original cannot be reported as a successful duplicate');
  assert.equal(financialInserts, 0);
  assert.equal(receiptWrites, 0, 'Signed-off money and room decisions must remain untouched');
});
