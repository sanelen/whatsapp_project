import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFileId, uploadFile } from './google-drive';

test('Drive upload retries reuse the reserved ID and verify existing contents', async (t) => {
  const data = Buffer.from('isolated-bank-evidence');
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const address = String(url);
    requests.push(address);
    if (address.includes('generateIds')) return Response.json({ ids: ['reserved-file'] });
    if (address.includes('uploadType')) {
      assert.match(String(init?.body), /"id":"reserved-file"/);
      return new Response('', { status: 409 });
    }
    assert.match(address, /files\/reserved-file\?alt=media$/);
    return new Response(data);
  });
  const fileId = await generateFileId('test-token');
  const actual = await uploadFile({ accessToken: 'test-token', fileId, parentId: 'test-folder', name: 'evidence.pdf', mimeType: 'application/pdf', data });
  assert.equal(actual, fileId);
  assert.equal(requests.length, 3);
});

test('a conflicting Drive file with different contents stops processing', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => String(url).includes('uploadType')
    ? new Response('', { status: 409 }) : new Response('wrong-evidence'));
  await assert.rejects(uploadFile({ accessToken: 'test-token', fileId: 'reserved', parentId: 'test-folder', name: 'file.pdf', mimeType: 'application/pdf', data: Buffer.from('expected') }), /different file contents/);
});

test('Drive upload failure remains an error rather than an archived file', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(uploadFile({ accessToken: 'test-token', fileId: 'reserved', parentId: 'test-folder', name: 'file.pdf', mimeType: 'application/pdf', data: Buffer.from('expected') }), /Drive upload failed/);
});
