import { digest, HEADERS, InvalidSubmission, localDateSerial, normalizePhone, SHEET_ID, SPREADSHEET_ID, TABLE_ID, type Outcome, type Submission } from './submission';

const RECEIPT_KEY = 'hamba_waiting_list_v1';
const FIRST_RECEIPT_ID = 1000000000;
const MAX_ROWS = 5000;
type Cell = { userEnteredValue?: { stringValue?: string; numberValue?: number; formulaValue?: string }; formattedValue?: string };
type Metadata = { metadataId: number; metadataKey: string; metadataValue: string };
export type Snapshot = {
  developerMetadata?: Metadata[];
  sheets: Array<{
    properties: { sheetId: number; title: string; gridProperties: { rowCount: number } };
    tables?: Array<{ tableId: string; name: string; range: { endRowIndex: number; startRowIndex?: number; startColumnIndex?: number; endColumnIndex: number } }>;
    data?: Array<{ rowData?: Array<{ values?: Cell[] }> }>;
  }>;
};
type RequestObject = Record<string, unknown>;
export interface SheetsTransport { read(): Promise<Snapshot>; batch(requests: RequestObject[]): Promise<void> }
export class SheetsUnavailable extends Error {}

function text(cell?: Cell): string { return cell?.userEnteredValue?.stringValue ?? cell?.formattedValue ?? ''; }

// The receipt ID is also an optimistic concurrency gate. Every integration
// writer chooses max(previous receipt IDs)+1 from the SAME snapshot as the rows.
// Sheets atomically rejects a duplicate metadata ID and the entire batch.
// Never delete receipts: they protect replay, including after a tenant is housed.
export async function saveSubmission(transport: SheetsTransport, submissionId: string, input: Submission, now = new Date()): Promise<Outcome> {
  if (!submissionId || submissionId.length > 2048) throw new InvalidSubmission('Invalid submission ID.');
  const event = digest(submissionId);
  const fingerprint = digest(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await transport.read();
    const metadata = snapshot.developerMetadata ?? [];
    const receipts = metadata.filter((item) => item.metadataKey === RECEIPT_KEY);
    for (const item of receipts) {
      const receipt = JSON.parse(item.metadataValue) as { event: string; fingerprint: string; outcome: Outcome };
      if (receipt.event === event) {
        if (receipt.fingerprint !== fingerprint) throw new InvalidSubmission('This submission was already used. Reopen the form to change your details.');
        return receipt.outcome;
      }
    }
    if (receipts.length >= 10000) throw new SheetsUnavailable('Waiting list receipt capacity reached.');
    const sheet = snapshot.sheets.find((item) => item.properties.sheetId === SHEET_ID);
    const table = sheet?.tables?.find((item) => item.tableId === TABLE_ID && item.name === 'PropertyWaitingList');
    if (!sheet || sheet.properties.title !== 'Waiting list' || !table || (table.range.startRowIndex ?? 0) !== 0 || (table.range.startColumnIndex ?? 0) !== 0 || table.range.endColumnIndex !== 7) throw new SheetsUnavailable('Waiting list table changed.');
    if (sheet.properties.gridProperties.rowCount > MAX_ROWS) throw new SheetsUnavailable('Waiting list needs a larger reviewed read bound.');
    const rows = sheet.data?.[0]?.rowData ?? [];
    if (HEADERS.some((header, index) => text(rows[0]?.values?.[index]) !== header)) throw new SheetsUnavailable('Waiting list headers changed.');
    let firstEmpty = -1;
    let duplicate = false;
    for (let index = 1; index < rows.length; index++) {
      const cells = rows[index].values ?? [];
      if (firstEmpty < 0 && !cells.some((cell) => cell.userEnteredValue !== undefined)) firstEmpty = index;
      const status = text(cells[5]).trim();
      // Unknown/blank statuses fail conservatively: do not add another person.
      if (['Housed', 'Withdrawn'].includes(status) || text(cells[3]).trim() !== input.property) continue;
      try { if (normalizePhone(text(cells[4])) === input.phone) duplicate = true; } catch { /* Empty or malformed historical phone. */ }
    }
    const rowIndex = firstEmpty < 0 ? Math.max(1, rows.length) : firstEmpty;
    if (!duplicate && rowIndex >= MAX_ROWS) throw new SheetsUnavailable('Waiting list is full.');
    const nextId = Math.max(FIRST_RECEIPT_ID, ...receipts.map((item) => item.metadataId)) + 1;
    if (metadata.some((item) => item.metadataId === nextId)) throw new SheetsUnavailable('Receipt ID namespace conflict.');
    const outcome: Outcome = duplicate ? 'already_on_list' : 'saved';
    const requests: RequestObject[] = [{ createDeveloperMetadata: { developerMetadata: {
      metadataId: nextId, metadataKey: RECEIPT_KEY,
      metadataValue: JSON.stringify({ event, fingerprint, outcome }),
      location: { spreadsheet: true }, visibility: 'DOCUMENT',
    } } }];
    if (!duplicate) {
      if (rowIndex >= sheet.properties.gridProperties.rowCount) requests.push({ appendDimension: { sheetId: SHEET_ID, dimension: 'ROWS', length: 100 } });
      if (rowIndex >= table.range.endRowIndex) requests.push({ updateTable: { table: { tableId: TABLE_ID, range: { sheetId: SHEET_ID, startRowIndex: 0, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 7 } }, fields: 'range' } });
      // Fill the first empty row below the header, not below formatted blank rows.
      const values = [input.name, input.surname, input.property, input.phone, 'Waiting', ''].map((stringValue) => ({ userEnteredValue: { stringValue }, userEnteredFormat: { numberFormat: { type: 'TEXT' } } }));
      requests.push({ updateCells: { range: { sheetId: SHEET_ID, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 0, endColumnIndex: 7 }, rows: [{ values: [
        { userEnteredValue: { numberValue: localDateSerial(now) }, userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } }, ...values,
      ] }], fields: 'userEnteredValue,userEnteredFormat.numberFormat' } });
    }
    try { await transport.batch(requests); return outcome; } catch {
      // Includes an uncertain response after a successful write. Re-read the
      // receipt before deciding whether to retry; no unguarded append ever runs.
      if (attempt === 2) throw new SheetsUnavailable('Could not confirm the waiting list save.');
    }
  }
  throw new SheetsUnavailable('Could not confirm the waiting list save.');
}

export async function createSheetsTransport(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<SheetsTransport> {
  // One budget covers OAuth, reads, writes and collision retries. Leave time
  // for the encrypted failure response before the Flow client's timeout.
  const deadline = AbortSignal.timeout(8000);
  const clientId = env.WAITING_LIST_GOOGLE_CLIENT_ID;
  const clientSecret = env.WAITING_LIST_GOOGLE_CLIENT_SECRET;
  const refreshToken = env.WAITING_LIST_GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new SheetsUnavailable('Waiting list Google credentials are not configured.');
  const tokenResponse = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }), signal: deadline });
  if (!tokenResponse.ok) throw new SheetsUnavailable(`Google authorization failed (${tokenResponse.status}).`);
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new SheetsUnavailable('Google authorization returned no token.');
  async function request(path: string, init: RequestInit = {}) {
    deadline.throwIfAborted();
    const response = await fetcher(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`, { ...init, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, cache: 'no-store', signal: deadline });
    if (!response.ok) throw new SheetsUnavailable(`Google Sheets request failed (${response.status}).`);
    return response;
  }
  return {
    read: async () => {
      const info = await (await request('?fields=sheets.properties')).json() as Snapshot;
      const count = info.sheets.find((item) => item.properties.sheetId === SHEET_ID)?.properties.gridProperties.rowCount;
      if (!count || count > MAX_ROWS) throw new SheetsUnavailable('Waiting list grid exceeds reviewed bounds.');
      const query = new URLSearchParams({ ranges: `'Waiting list'!A1:G${count}`, fields: 'developerMetadata,sheets(properties,tables,data(rowData(values(userEnteredValue,formattedValue))))' });
      return (await request(`?${query}`)).json() as Promise<Snapshot>;
    },
    batch: async (requests) => { await request(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) }); },
  };
}
