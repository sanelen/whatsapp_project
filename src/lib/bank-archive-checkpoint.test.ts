import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';

// This test process has no real provider credentials. All requests fail closed
// unless explicitly handled by the in-memory provider below.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://archive-test.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-test-key';
process.env.GMAIL_OAUTH_CLIENT_ID = 'test-client';
process.env.GMAIL_OAUTH_CLIENT_SECRET = 'test-secret';
process.env.GMAIL_OAUTH_REFRESH_TOKEN = 'test-refresh';
delete process.env.BANK_IMPORT_SOURCE_MAILBOX_EMAIL;

test('archive checkpoint survives an interrupted completion without creating another Drive file', async (t) => {
  const { saveImportEvidenceToDrive } = await import('./bank-import');
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  [
    'Transaction Type : Incoming Funds', 'Date Time Actioned : 22/06/2026 13:35:29',
    'Transaction ID : TEST-1', 'Account Paid To : ****0000',
    'Amount Received : R 2,200.00', 'Reference : TEST ROOM 1', 'Available Balance : R 2,200.00',
  ].forEach((line, index) => page.drawText(line, { x: 20, y: 700 - index * 25, size: 12 }));
  const bytes = Buffer.from(await pdf.save());
  const state: { drive_file_id: string | null; drive_archived_at: string | null; drive_folder_path: string | null } = {
    drive_file_id: null, drive_archived_at: null, drive_folder_path: null,
  };
  let uploads = 0;
  let filesCreated = 0;
  let checkpointFailure = true;
  let generatedIds = 0;
  const uploadIds = new Set<string>();
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'archive-test.invalid') {
      assert.equal(url.pathname, '/rest/v1/bank_import_files', 'Archive must not write financial tables');
      if (init?.method === 'PATCH') {
        const patch = JSON.parse(String(init.body));
        if (patch.drive_archived_at && checkpointFailure) {
          checkpointFailure = false;
          return Response.json({ message: 'injected checkpoint failure' }, { status: 500 });
        }
        if (url.searchParams.get('drive_file_id') !== 'is.null' || !state.drive_file_id) Object.assign(state, patch);
        return new Response(null, { status: 204 });
      }
      return Response.json(state);
    }
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'test-access' });
    if (url.hostname === 'www.googleapis.com') {
      if (url.pathname.endsWith('generateIds')) return Response.json({ ids: [++generatedIds === 1 ? 'reserved-file' : `reserved-${generatedIds}`] });
      if (url.pathname.startsWith('/upload/')) {
        uploads += 1;
        const uploadId = String(init?.body).match(/"id":"([^"]+)"/)?.[1];
        assert.equal(uploadId, state.drive_file_id);
        uploadIds.add(uploadId!);
        if (filesCreated) return new Response('', { status: 409 });
        filesCreated += 1;
        return Response.json({ id: 'reserved-file' });
      }
      if (url.searchParams.get('alt') === 'media') return new Response(bytes);
      if (url.searchParams.get('q')?.includes('appProperties')) return Response.json({ files: [] });
      if (url.pathname === '/drive/v3/files') return Response.json({ files: [{ id: 'existing-folder' }] });
    }
    throw new Error(`Unexpected external request in isolated archive test: ${url.hostname}`);
  });
  const input = { fileId: 'db-file', mailboxEmail: 'business@example.com', propertyMappings: [],
    attachment: { fileName: 'test.pdf', mimeType: 'application/pdf', data: bytes, source: 'gmail' as const, sourceId: 'attachment-1' } };
  await assert.rejects(saveImportEvidenceToDrive(input), /checkpoint could not be completed/);
  assert.equal(state.drive_archived_at, null);
  assert.equal(state.drive_file_id, 'reserved-file');
  assert.ok((await saveImportEvidenceToDrive(input)).bytes.equals(bytes));
  assert.equal(filesCreated, 1);
  assert.equal(uploads, 2);
  assert.equal(state.drive_folder_path, 'Hamba Trading Bank Files/2026-07/Unassigned property');
  await saveImportEvidenceToDrive(input);
  assert.equal(uploads, 2, 'Completed archive should only verify the existing source');
  Object.assign(state, { drive_file_id: null, drive_archived_at: null, drive_folder_path: null });
  uploads = 0;
  filesCreated = 0;
  uploadIds.clear();
  await Promise.all([saveImportEvidenceToDrive(input), saveImportEvidenceToDrive(input)]);
  assert.equal(filesCreated, 1, 'Concurrent workers must create only one source file');
  assert.equal(uploadIds.size, 1, 'Concurrent workers share the persisted identity');
});
