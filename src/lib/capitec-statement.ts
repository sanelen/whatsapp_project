import { createHash } from 'node:crypto';
import type { ParsedCapitecEntry } from './bank-import';

export function statementReferenceKey(reference: string) {
  return reference.replace(/^(?:(?:external\s+)?(?:immediate\s+)?payment received|(?:ATM\s+)?cash deposit)\s*:?\s*/i, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isoDate(value: string) {
  const [day, month, year] = value.split('/');
  const iso = `${year}-${month}-${day}`;
  if (new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) !== iso) throw new Error('Invalid statement date');
  return iso;
}

/** Strict Capitec Business monthly statement format. Unknown layouts fail closed. */
export function parseCapitecStatement(text: string, accountSuffix = '4079') {
  if (!/Capitec Bank/i.test(text) || !/Account Statement/.test(text)) throw new Error('Not a Capitec account statement');
  const accounts = [...text.matchAll(/Account:\s*(?:Business\s+)?Flexible Savings Account\s+(\d{10})/g)].map(match => match[1]);
  if (!accounts.length || accounts.some(account => !account.endsWith(accountSuffix))) throw new Error('Statement account does not match the scoped source');
  const from = text.match(/From Date:\s*(\d{2}\/\d{2}\/\d{4})/);
  const to = text.match(/To Date:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!from || !to) throw new Error('Statement coverage dates are missing');
  const startDate = isoDate(from[1]);
  const endDate = isoDate(to[1]);
  if (startDate > endDate) throw new Error('Invalid statement coverage');
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const entries: ParsedCapitecEntry[] = [];
  const identities = new Set<string>();
  let previousBalance: number | undefined;
  let rowCount = 0;
  let ignoredRows = 0;
  for (const line of lines) {
    const row = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
    if (!row) continue;
    // The bank stamp also contains a date and time, outside Transaction History.
    if (/^\d{2}:\d{2}$/.test(row[2])) continue;
    const transactionDate = isoDate(row[1]);
    if (transactionDate < startDate || transactionDate > endDate) throw new Error('Transaction outside statement coverage');
    const money = [...row[2].matchAll(/-?\d+(?:[ ,]\d{3})*\.\d{2}/g)];
    if (money.length < 2 || money.length > 3) throw new Error('Unsupported statement money columns');
    const values = money.map(match => Math.round(Number(match[0].replace(/[ ,]/g, '')) * 100));
    const [credit] = values;
    const balance = values.at(-1)!;
    const fee = values.length === 3 ? values[1] : 0;
    const description = row[2].slice(0, money[0].index).trim();
    const interest = /^Interest Received\s+Interest$/.test(description);
    const rent = description.match(/^(Payment Received:\s*.+?|ATM Cash Deposit:\s*.+?)\s+(Payments Received|Cash Deposit|Account Payment Received|Rental Income)$/);
    if (!interest && !rent) throw new Error('Statement contains an unsupported transaction; review before import');
    if (credit <= 0 || fee > 0) throw new Error('Invalid statement credit or fee columns');
    if (previousBalance !== undefined && previousBalance + credit + fee !== balance) throw new Error('Statement running balance does not reconcile');
    previousBalance = balance;
    rowCount++;
    if (interest) { ignoredRows++; continue; }
    const reference = rent![1].replace(/^Payment Received:\s*/i, '');
    const key = [accountSuffix, transactionDate, credit, statementReferenceKey(reference)].join('|');
    // Date-only evidence cannot safely distinguish two identical same-day credits.
    if (identities.has(key)) throw new Error('Repeated same-day statement credit needs manual review');
    identities.add(key);
    entries.push({ transactionType: /^ATM Cash Deposit/i.test(reference) ? 'Cash Deposit' : 'Incoming Funds',
      transactionDate, transactionTime: '', transactionId: `statement:${createHash('sha256').update(key).digest('hex').slice(0, 20)}`,
      destinationAccountSuffix: accountSuffix, amount: credit / 100, reference, payerName: reference,
      description: 'Capitec Business account statement', availableBalance: balance / 100, rawExtractedText: line });
  }
  if (!rowCount) throw new Error('Statement transaction history was not recognized');
  return { startDate, endDate, entries, ignoredRows };
}

export function scopedStatementQuery() {
  return 'from:noreply@capitecbank.co.za has:attachment filename:pdf subject:"Capitec Business Account Statement" 4079 after:2026/09/01';
}
