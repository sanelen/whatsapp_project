import assert from 'node:assert/strict';
import test from 'node:test';
import { createCipheriv, createDecipheriv, createHmac, generateKeyPairSync, publicEncrypt, randomBytes, constants } from 'node:crypto';
import { handleFlowRequest, issueFlowToken } from './endpoint';
import { HEADERS, FLOW_ID, InvalidSubmission, localDateSerial, normalizePhone, parseSubmission, SHEET_ID, TABLE_ID } from './submission';
import { saveSubmission, type SheetsTransport, type Snapshot } from './sheets';

const fields = { name: 'Test', surname: 'Only', property: 'quarry_heights', whatsapp_number: '081 000 0000' };
const input = parseSubmission(fields);
function fakeSheet() {
  const state: Snapshot = { developerMetadata: [], sheets: [{ properties: { sheetId: SHEET_ID, title: 'Waiting list', gridProperties: { rowCount: 1000 } }, tables: [{ tableId: TABLE_ID, name: 'PropertyWaitingList', range: { endRowIndex: 101, endColumnIndex: 7 } }], data: [{ rowData: [{ values: HEADERS.map((stringValue) => ({ userEnteredValue: { stringValue } })) }, ...Array.from({ length: 100 }, () => ({ values: [] }))] }] }] };
  let loseResponse = false;
  const transport: SheetsTransport = {
    read: async () => structuredClone(state),
    batch: async (requests) => {
      const metadata = (requests[0].createDeveloperMetadata as { developerMetadata: NonNullable<Snapshot['developerMetadata']>[number] }).developerMetadata;
      if (state.developerMetadata!.some((item) => item.metadataId === metadata.metadataId)) throw new Error('Metadata ID already exists');
      for (const request of requests) if (request.updateCells) {
        const update = request.updateCells as { range: { startRowIndex: number }; rows: NonNullable<NonNullable<Snapshot['sheets'][number]['data']>[number]['rowData']> };
        state.sheets[0].data![0].rowData![update.range.startRowIndex] = update.rows[0];
      }
      state.developerMetadata!.push(metadata);
      if (loseResponse) { loseResponse = false; throw new Error('Response lost after commit'); }
    },
  };
  return { state, transport, loseNextResponse() { loseResponse = true; } };
}

test('canonical phone + property; names cannot bypass duplicate identity', () => {
  for (const phone of ['0810000000', '+27810000000', '27810000000', '0027810000000']) assert.equal(normalizePhone(phone), '+27810000000');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  for (const phone of ['', '123', '+270810000000', '+27bad123', '1234567890']) assert.throws(() => normalizePhone(phone), InvalidSubmission);
  for (const data of [{ ...fields, name: '' }, { ...fields, surname: 9 }, { ...fields, property: '__proto__' }]) assert.throws(() => parseSubmission(data), InvalidSubmission);
});

test('date rolls over in Johannesburg, not UTC', () => {
  assert.equal(localDateSerial(new Date('2026-09-14T22:30:00Z')), localDateSerial(new Date('2026-09-15T10:00:00Z')));
});

test('first actual row, retry after response loss, and event replay after status changes', async () => {
  const db = fakeSheet(); db.loseNextResponse();
  assert.equal(await saveSubmission(db.transport, 'event-1', input), 'saved');
  const rows = db.state.sheets[0].data![0].rowData!;
  assert.equal(rows[1].values![4].userEnteredValue!.stringValue, '+27810000000');
  assert.equal(rows[100].values!.length, 0);
  rows[1].values![5].userEnteredValue = { stringValue: 'Housed' };
  assert.equal(await saveSubmission(db.transport, 'event-1', input), 'saved');
  assert.equal(db.state.developerMetadata!.length, 1);
  await assert.rejects(saveSubmission(db.transport, 'event-1', { ...input, property: 'Westrich' }), InvalidSubmission);
});

test('concurrent repeated taps and changed names create one active phone/property row', async () => {
  const db = fakeSheet();
  const results = await Promise.all([saveSubmission(db.transport, 'one', input), saveSubmission(db.transport, 'two', { ...input, name: 'Different' })]);
  assert.deepEqual(results.sort(), ['already_on_list', 'saved']);
  assert.equal(db.state.sheets[0].data![0].rowData![1].values![1].userEnteredValue!.stringValue, 'Test');
  assert.equal(await saveSubmission(db.transport, 'three', { ...input, property: 'Westrich' }), 'saved');
});

test('active statuses dedupe; withdrawn/housed permit a new distinct submission', async () => {
  const db = fakeSheet(); await saveSubmission(db.transport, 'first', input);
  const row = db.state.sheets[0].data![0].rowData![1];
  for (const status of ['Waiting', 'Contacted', 'Viewing arranged', '']) {
    row.values![5].userEnteredValue = { stringValue: status };
    assert.equal(await saveSubmission(db.transport, 'status-' + status, input), 'already_on_list');
  }
  row.values![5].userEnteredValue = { stringValue: 'Withdrawn' };
  assert.equal(await saveSubmission(db.transport, 'new-interest', input), 'saved');
});

test('concurrent identical event replay adds one row and one receipt', async () => {
  const db = fakeSheet();
  assert.deepEqual(await Promise.all([saveSubmission(db.transport, 'same', input), saveSubmission(db.transport, 'same', input)]), ['saved', 'saved']);
  assert.equal(db.state.developerMetadata!.length, 1);
  assert.equal(db.state.sheets[0].data![0].rowData!.filter(row => row.values?.[4]?.userEnteredValue?.stringValue === input.phone).length, 1);
});

test('fills an empty gap while preserving later rows', async () => {
  const db = fakeSheet();
  await saveSubmission(db.transport, 'later', input);
  const rows = db.state.sheets[0].data![0].rowData!;
  rows[3] = structuredClone(rows[1]); rows[1] = { values: [] };
  await saveSubmission(db.transport, 'gap', { ...input, property: 'Westrich' });
  assert.equal(rows[1].values![3].userEnteredValue!.stringValue, 'Westrich');
  assert.equal(rows[3].values![3].userEnteredValue!.stringValue, 'Quarry Heights');
});

test('failed persistence never returns saved', async () => {
  const db = fakeSheet(); db.transport.batch = async () => { throw new Error('No access'); };
  await assert.rejects(saveSubmission(db.transport, 'fail', input), /Could not confirm/);
});

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const secret = 'a'.repeat(32);
const env = { WAITING_LIST_ENABLED: 'true', WAITING_LIST_META_APP_SECRET: 'meta-secret', WAITING_LIST_PRIVATE_KEY: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), WAITING_LIST_TOKEN_SECRET: secret, WAITING_LIST_PRIMARY_PHONE_NUMBER_ID: '12345' };
function envelope(body: unknown, signature = true) {
  const key = randomBytes(16), iv = randomBytes(16);
  const cipher = createCipheriv('aes-128-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(body)), cipher.final(), cipher.getAuthTag()]);
  const raw = JSON.stringify({ encrypted_aes_key: publicEncrypt({ key: pair.publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key).toString('base64'), encrypted_flow_data: encrypted.toString('base64'), initial_vector: iv.toString('base64') });
  const request = new Request('https://example.com/api/whatsapp/flows/waiting-list', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=' + (signature ? createHmac('sha256', 'meta-secret').update(raw).digest('hex') : '0'.repeat(64)) } });
  const decode = async (response: Response) => {
    const bytes = Buffer.from(await response.text(), 'base64');
    const decipher = createDecipheriv('aes-128-gcm', key, Buffer.from(iv.map((byte) => byte ^ 255)));
    decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString());
  };
  return { request, decode };
}

test('signed encrypted exchange confirms only after save; failure stays on form', async () => {
  const body = { action: 'data_exchange', screen: 'WAITING_LIST', flow_token: issueFlowToken(secret, '12345'), data: { ...fields, form_id: FLOW_ID } };
  const success = envelope(body);
  let saved = false;
  const response = await handleFlowRequest(success.request, async () => { saved = true; return 'saved'; }, env);
  assert.equal(saved, true); assert.equal((await success.decode(response)).screen, 'CONFIRMATION');
  const failure = envelope(body);
  const failed = await failure.decode(await handleFlowRequest(failure.request, async () => { throw new Error('Failed'); }, env));
  assert.equal(failed.screen, 'WAITING_LIST'); assert.match(failed.data.error_message, /could not confirm/);
  assert.equal(failed.data.has_error, true); assert.deepEqual(failed.data.form_values, fields);
  const bad = envelope(body, false);
  assert.equal((await handleFlowRequest(bad.request, async () => { assert.fail('must not save'); }, env)).status, 432);
  const other = envelope({ ...body, flow_token: issueFlowToken(secret, '99999') });
  assert.equal((await handleFlowRequest(other.request, async () => { assert.fail('wrong number must not save'); }, env)).status, 427);
});
