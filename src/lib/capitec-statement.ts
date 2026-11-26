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
  if (/Account type\s+Flexible Savings Account/.test(text)) return parseLegacyStatement(text, accountSuffix);
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

/** The observed legacy monthly layout has signed amounts and separate posting dates. */
function parseLegacyStatement(text: string, accountSuffix: string) {
  const accounts = [...text.matchAll(/Account No\.\s*(\d{10})/g)].map(match => match[1]);
  if (!accounts.length || accounts.some(account => !account.endsWith(accountSuffix))) throw new Error('Statement account does not match the scoped source');
  const issued = text.match(/^Date\s+(01\/\d{2}\/\d{4})$/m);
  if (!issued || !/Statement No\./.test(text) || !/Description\s+Reference\s+Fees\s+Amount\s+Balance/.test(text)) {
    throw new Error('Unsupported legacy monthly statement layout');
  }
  // Coverage comes from the monthly statement header, never the filename or stamp.
  const end = new Date(`${isoDate(issued[1])}T12:00:00Z`);
  end.setUTCDate(0);
  const endDate = end.toISOString().slice(0, 10);
  const startDate = `${endDate.slice(0, 7)}-01`;
  const cents = (value: string) => Math.round(Number(value.replace(/[ ,]/g, '')) * 100);
  const opening = text.match(/Balance brought forward\s+([+-]\d+(?:[ ,]\d{3})*\.\d{2})/);
  if (!opening) throw new Error('Legacy statement opening balance is missing');
  let previousBalance = cents(opening[1]);
  let rowCount = 0;
  let ignoredRows = 0;
  const entries: ParsedCapitecEntry[] = [];
  const identities = new Set<string>();
  for (const line of text.split(/\r?\n/).map(line => line.trim())) {
    const row = line.match(/^(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.+)$/);
    if (!row) continue;
    if (row[1] !== row[2]) throw new Error('Different legacy posting and transaction dates need review');
    const transactionDate = isoDate(row[2].replace(/\/(\d{2})$/, '/20$1'));
    if (transactionDate < startDate || transactionDate > endDate) throw new Error('Transaction outside statement coverage');
    const money = [...row[3].matchAll(/[+-]\d+(?:[ ,]\d{3})*\.\d{2}/g)];
    if (money.length < 2 || money.length > 3) throw new Error('Unsupported legacy statement money columns');
    const values = money.map(match => cents(match[0]));
    const amount = values.at(-2)!;
    const balance = values.at(-1)!;
    const fee = values.length === 3 ? values[0] : 0;
    if (fee > 0 || previousBalance + amount + fee !== balance) throw new Error('Statement running balance does not reconcile');
    previousBalance = balance;
    rowCount++;
    const description = row[3].slice(0, money[0].index).trim();
    if ((/^Credit Interest$/.test(description) && amount > 0) || (/^Deposit Transfer\s+/.test(description) && amount < 0)) {
      ignoredRows++; continue;
    }
    const rent = description.match(/^(CASH DEPOSIT \(ATM\)|Ret Cr Transfer|Inward EFT Credit)\s+(.+)$/);
    if (!rent || amount <= 0) throw new Error('Statement contains an unsupported transaction; review before import');
    const cash = rent[1] === 'CASH DEPOSIT (ATM)';
    const reference = cash ? `ATM Cash Deposit: ${rent[2]}` : rent[2];
    const key = [accountSuffix, transactionDate, amount, statementReferenceKey(reference)].join('|');
    if (identities.has(key)) throw new Error('Repeated same-day statement credit needs manual review');
    identities.add(key);
    entries.push({ transactionType: cash ? 'Cash Deposit' : 'Incoming Funds', transactionDate, transactionTime: '',
      transactionId: `statement:${createHash('sha256').update(key).digest('hex').slice(0, 20)}`,
      destinationAccountSuffix: accountSuffix, amount: amount / 100, reference, payerName: reference,
      description: 'Capitec Business account statement', availableBalance: balance / 100, rawExtractedText: line });
  }
  if (!rowCount) throw new Error('Statement transaction history was not recognized');
  return { startDate, endDate, entries, ignoredRows };
}

export function isScopedStatementMessage(sender: string, subject: string) {
  const address = (sender.match(/<([^<>]+)>/)?.[1] ?? sender).trim().toLowerCase();
  return ['noreply@capitecbank.co.za', 'donotreply@capitecbank.co.za', 'connect@capitecbank.co.za'].includes(address)
    && /^(?:Capitec Business Account Statement(?:\s.*)?|Stamped Bank Statement)$/i.test(subject.trim());
}

export function scopedStatementQuery() {
  return 'in:anywhere {from:noreply@capitecbank.co.za from:donotreply@capitecbank.co.za from:connect@capitecbank.co.za} has:attachment filename:pdf {subject:"Capitec Business Account Statement" subject:"Stamped Bank Statement"} 4079 after:2026/05/01';
}
