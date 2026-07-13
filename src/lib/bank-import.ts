import { createHash, createSign } from 'node:crypto';
import { extractPdfText } from './pdf-text';
import { getSupabaseAdmin } from '@/lib/supabase';
import { referenceContainsMatcherToken, tokenizeMatcherValue } from '@/lib/auto-match';
import { EXCLUDED_BANK_ACCOUNT_SUFFIXES, MIXED_LEGACY_BANK_ACCOUNT_SUFFIXES, PROPERTY_LOCKED_BANK_ACCOUNT_SUFFIXES } from '@/config/bank-import-metadata';
import {
  DRIVE_ARCHIVE_ROOT_FOLDER,
  downloadFile as downloadDriveFile,
  ensureFolderPath,
  listFilesUnder,
  listPdfFilesUnder,
  uploadFile as uploadDriveFile,
} from '@/lib/google-drive';

type BankImportMailboxRow = {
  id: string;
  organization_id: string | null;
  email_address: string;
  provider: 'gmail';
  label_filter: string;
  subject_filter: string;
  is_active: boolean;
  last_synced_at: string | null;
};

type BankImportMessageRow = {
  id: string;
};

type BankImportFileRow = {
  id: string;
};

type BankImportEntryRow = {
  id: string;
  organization_id: string | null;
  property_id: string | null;
  transaction_type: string;
  transaction_date: string | null;
  transaction_time: string;
  reference: string;
  amount: number | string;
};

type BankImportPropertyMappingRow = {
  id: string;
  organization_id: string;
  property_id: string | null;
  account_number_suffix: string;
  property_name: string;
  is_active: boolean;
};

type BankImportUnitMatchHintRow = {
  id: string;
  property_id: string | null;
  unit_id: string | null;
  account_number_suffix?: string | null;
  matcher_type:
    | 'reference_contains'
    | 'reference_equals'
    | 'reference_regex'
    | 'payer_name_contains'
    | 'amount_equals';
  matcher_value: string;
  amount_value: number | string | null;
  priority: number;
  is_active: boolean;
};

type GmailListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
  resultSizeEstimate?: number;
};

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  body?: {
    attachmentId?: string;
    data?: string;
    size?: number;
  };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id: string;
  threadId?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

type GmailAttachmentResponse = {
  data?: string;
  size?: number;
};

type GoogleAuthMode = 'oauth_refresh_token' | 'service_account';

type GoogleAccessTokenResult = {
  accessToken: string;
  authMode: GoogleAuthMode;
};

type ImportedAttachment = {
  fileName: string;
  mimeType: string;
  data: Buffer;
  source: 'gmail' | 'eml' | 'drive' | 'bank';
  sourceId: string;
  nestedFrom?: string;
};

export type ParsedCapitecEntry = {
  transactionType: string;
  transactionDate: string | null;
  transactionTime: string;
  transactionId: string;
  destinationAccountSuffix: string;
  amount: number;
  reference: string;
  payerName: string;
  description: string;
  availableBalance: number | null;
  rawExtractedText: string;
};

type ResolvedImportContext = {
  propertyId: string | null;
  propertyName: string;
  matchedBy: string | null;
  unitHints: Array<{
    hintId: string;
    unitId: string | null;
    matcherType: string;
    priority: number;
  }>;
};

export type BankImportRunSummary = {
  mailboxEmail: string;
  authMode: GoogleAuthMode | null;
  billingPeriod: string | null;
  billingWindowStart: string | null;
  billingWindowEnd: string | null;
  messagesScanned: number;
  messagesImported: number;
  attachmentsProcessed: number;
  filesStored: number;
  duplicateFiles: number;
  entriesCreated: number;
  paymentReferencesCreated: number;
  ignoredEntries: number;
  failedMessages: number;
  messagesSkipped: number;
  filesArchivedToDrive: number;
  importedPeriods: string[];
};

export type BankImportSource = 'gmail' | 'drive' | 'bank' | 'both';

export type BillingWindow = {
  period: string;
  startDate: string;
  endDate: string;
  gmailAfterDate: string;
  gmailBeforeDate: string;
};

const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
// drive.file = least privilege: the app may only read/write files it creates,
// which is exactly the "Hamba Trading Bank Files" archive it builds.
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
// Needed for Bank Uploads: operators may drop statement files into Drive
// themselves, so the importer must be allowed to read user-created files too.
const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
// Scopes requested when (re-)consenting for the bank-import + Drive-archive flow.
const BANK_IMPORT_OAUTH_SCOPES = [GMAIL_READONLY_SCOPE, DRIVE_FILE_SCOPE, DRIVE_READONLY_SCOPE].join(' ');
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_BANK_UPLOADS_FOLDER = 'Bank Uploads';
const DRIVE_BANK_UPLOADS_FOLDER_ID = process.env.BANK_UPLOADS_DRIVE_FOLDER_ID?.trim();

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function sha256(input: Buffer) {
  return createHash('sha256').update(input).digest('hex');
}

function normalizeReference(value: string) {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function canonicalizeBankReference(value: string) {
  return normalizeReference(
    value.replace(/\b(?:external\s+)?(?:immediate\s+)?payment\s+received\s*:?/gi, ' ')
  ).replace(/[^A-Z0-9]/g, '');
}

export function isExcludedNonRentCredit(entry: Pick<ParsedCapitecEntry, 'reference'>) {
  return canonicalizeBankReference(entry.reference) === 'INTERESTRECEIVED';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseMoney(value: string) {
  const normalized = value.replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseSouthAfricanDateTime(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/);
  if (!match) {
    return { transactionDate: null, transactionTime: '' };
  }
  const [, day, month, year, time = ''] = match;
  return {
    transactionDate: `${year}-${month}-${day}`,
    transactionTime: time,
  };
}

function parseFlexibleDate(value: string) {
  const trimmed = value.trim();
  const southAfrican = trimmed.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (southAfrican) {
    const [, day, month, year, time = ''] = southAfrican;
    return {
      transactionDate: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      transactionTime: time.length === 5 ? `${time}:00` : time,
    };
  }

  const iso = trimmed.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?/);
  if (iso) {
    const [, year, month, day, time = ''] = iso;
    return {
      transactionDate: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
      transactionTime: time.length === 5 ? `${time}:00` : time,
    };
  }

  return { transactionDate: null, transactionTime: '' };
}

function toSouthAfricaIsoTimestamp(date: string | null, time: string) {
  if (!date) return null;
  const safeTime = /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : '00:00:00';
  return `${date}T${safeTime}+02:00`;
}

function takeLineValue(text: string, label: string) {
  const escapedLabel = escapeRegExp(label);
  const forwardMatch = text.match(new RegExp(`${escapedLabel}\\s*:\\s*([^\\n\\r]+)`, 'i'));
  if (forwardMatch?.[1]?.trim()) return forwardMatch[1].trim();

  const reverseMatch = text.match(new RegExp(`:\\s*([^\\n\\r]+?)\\s*${escapedLabel}(?:\\s|$)`, 'i'));
  return reverseMatch?.[1]?.trim() ?? '';
}

function accountSuffix(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.slice(-4);
}

export function parseCapitecTransactionText(text: string): ParsedCapitecEntry | null {
  const normalizedText = text.replace(/\r/g, '\n').replace(/\n+/g, '\n').trim();
  const transactionType = takeLineValue(normalizedText, 'Transaction Type');
  if (!transactionType) return null;

  const actioned = takeLineValue(normalizedText, 'Date Time Actioned');
  const transactionId = takeLineValue(normalizedText, 'Transaction ID');
  const accountPaidTo = takeLineValue(normalizedText, 'Account Paid To');
  const amountReceived = takeLineValue(normalizedText, 'Amount Received');
  const reference = takeLineValue(normalizedText, 'Reference');
  const availableBalance = takeLineValue(normalizedText, 'Available Balance');
  const { transactionDate, transactionTime } = parseSouthAfricanDateTime(actioned);

  return {
    transactionType,
    transactionDate,
    transactionTime,
    transactionId,
    destinationAccountSuffix: accountSuffix(accountPaidTo),
    amount: parseMoney(amountReceived),
    reference,
    payerName: reference,
    description: 'Capitec transaction notification',
    availableBalance: availableBalance ? parseMoney(availableBalance) : null,
    rawExtractedText: normalizedText,
  };
}

export function parseCapitecAccountMovementText(text: string) {
  const normalizedText = text.replace(/\r/g, '\n').replace(/\n+/g, '\n').trim();
  const paidFrom = takeLineValue(normalizedText, 'Account Paid From');
  const paidTo = takeLineValue(normalizedText, 'Account Paid To');
  const account = takeLineValue(normalizedText, 'Account');
  if (paidFrom) return { direction: 'outgoing' as const, accountSuffix: accountSuffix(paidFrom) };
  if (paidTo) return { direction: 'incoming' as const, accountSuffix: accountSuffix(paidTo) };
  if (account && /(?:Reserved Amount|Merchant)\s*:/i.test(normalizedText)) {
    return { direction: 'outgoing' as const, accountSuffix: accountSuffix(account) };
  }
  return null;
}

function detectDelimiter(headerLine: string) {
  const candidates = [',', ';', '\t'];
  return candidates
    .map((delimiter) => ({ delimiter, count: headerLine.split(delimiter).length }))
    .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ',';
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeStatementHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function pickHeader(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const exact = headers.find((header) => header === candidate);
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const partial = headers.find((header) => header.includes(candidate));
    if (partial) return partial;
  }
  return undefined;
}

function buildManualStatementEntry(input: {
  transactionDate: string | null;
  transactionTime: string;
  reference: string;
  amount: number;
  destinationAccountSuffix?: string;
  rawExtractedText: string;
  sourceIndex: number;
}) {
  const stableId = sha256(
    Buffer.from(
      [
        input.transactionDate ?? '',
        input.transactionTime,
        normalizeReference(input.reference),
        input.amount.toFixed(2),
      ].join('|')
    )
  ).slice(0, 16);

  return {
    transactionType: 'Incoming Funds',
    transactionDate: input.transactionDate,
    transactionTime: input.transactionTime,
    transactionId: `manual:${stableId}`,
    destinationAccountSuffix: input.destinationAccountSuffix ?? '',
    amount: input.amount,
    reference: input.reference.trim(),
    payerName: input.reference.trim(),
    description: 'Manual bank statement upload',
    availableBalance: null,
    rawExtractedText: input.rawExtractedText,
  };
}

export function parseBankStatementCsv(text: string): ParsedCapitecEntry[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseDelimitedLine(lines[0], delimiter);
  const headers = rawHeaders.map(normalizeStatementHeader);
  const dateHeader = pickHeader(headers, ['transactiondate', 'postingdate', 'valuedate', 'date']);
  const referenceHeader = pickHeader(headers, ['reference', 'description', 'details', 'narrative', 'beneficiary']);
  const moneyInHeader = pickHeader(headers, ['moneyin', 'credit', 'deposit', 'amountreceived', 'paidin']);
  const moneyOutHeader = pickHeader(headers, ['moneyout', 'debit', 'withdrawal', 'paidout']);
  const amountHeader = pickHeader(headers, ['amount']);
  const balanceHeader = pickHeader(headers, ['balance']);
  const accountHeader = pickHeader(headers, ['accountpaidto', 'accountnumber', 'account']);

  if (!dateHeader || !referenceHeader || (!moneyInHeader && !amountHeader)) return [];

  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const entries: ParsedCapitecEntry[] = [];

  for (const [sourceIndex, line] of lines.slice(1).entries()) {
    const cells = parseDelimitedLine(line, delimiter);
    const value = (header: string | undefined) => {
      if (!header) return '';
      const index = indexByHeader.get(header);
      return typeof index === 'number' ? cells[index] ?? '' : '';
    };

    const { transactionDate, transactionTime } = parseFlexibleDate(value(dateHeader));
    const reference = value(referenceHeader);
    const moneyOut = parseMoney(value(moneyOutHeader));
    // With a dedicated money-in column the amount is that column; with a
    // single signed amount column, negatives (debits) fail the <= 0 check.
    const amount = moneyInHeader ? parseMoney(value(moneyInHeader)) : parseMoney(value(amountHeader));
    const balanceOnly = balanceHeader && amountHeader === balanceHeader;
    const destinationAccountSuffix = accountSuffix(value(accountHeader));

    if (!transactionDate || !normalizeReference(reference) || balanceOnly) continue;
    if (moneyOut > 0 || amount <= 0) continue;
    if (
      MIXED_LEGACY_BANK_ACCOUNT_SUFFIXES.has(destinationAccountSuffix) &&
      (!/payment\s+received/i.test(reference) || /transfer/i.test(reference) || amount < 1900)
    ) continue;

    const candidate = buildManualStatementEntry({
      transactionDate,
      transactionTime,
      reference,
      amount,
      destinationAccountSuffix,
      rawExtractedText: line,
      sourceIndex,
    });
    if (isExcludedNonRentCredit(candidate)) continue;

    entries.push(candidate);
  }

  return entries;
}

export function parseBankStatementText(text: string): ParsedCapitecEntry[] {
  const entries: ParsedCapitecEntry[] = [];
  const lines = text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  for (const [sourceIndex, line] of lines.entries()) {
    const { transactionDate, transactionTime } = parseFlexibleDate(line);
    if (!transactionDate) continue;
    if (/\b(debit|fee|charge|payment\s+to|transfer\s+to|cash\s+withdrawal)\b/i.test(line)) continue;

    const moneyMatches = Array.from(
      line.matchAll(/(?:R\s*)?-?\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2})|(?:R\s*)?-?\d+\.\d{2}/g)
    )
      .map((match) => ({ raw: match[0], amount: parseMoney(match[0]) }))
      .filter((match) => Number.isFinite(match.amount) && match.amount > 0);
    if (moneyMatches.length === 0) continue;

    const amountMatch = moneyMatches.length > 1 ? moneyMatches[moneyMatches.length - 2] : moneyMatches[0];
    const amount = amountMatch.amount;
    const reference = line
      .replace(/(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})(?:\s+\d{2}:\d{2}(?::\d{2})?)?/, ' ')
      .replace(/(?:R\s*)?-?\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2})|(?:R\s*)?-?\d+\.\d{2}/g, ' ')
      .replace(/\b(credit|deposit|incoming|received|eft)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalizeReference(reference)) continue;
    entries.push(
      buildManualStatementEntry({
        transactionDate,
        transactionTime,
        reference,
        amount,
        rawExtractedText: line,
        sourceIndex,
      })
    );
  }

  return entries;
}

function isIncomingFunds(entry: ParsedCapitecEntry) {
  return entry.transactionType.trim().toLowerCase() === 'incoming funds';
}

function buildEntryFingerprint(input: {
  organizationId: string;
  transactionType: string;
  transactionDate: string | null;
  transactionTime: string;
  transactionId: string;
  destinationAccountSuffix: string;
  amount: number;
  reference: string;
}) {
  return [
    input.organizationId,
    input.transactionType.trim().toLowerCase(),
    input.transactionDate ?? '',
    input.transactionTime,
    input.transactionId,
    input.destinationAccountSuffix,
    input.amount.toFixed(2),
    normalizeReference(input.reference),
  ].join('|');
}

export function buildCrossSourceTransactionIdentity(input: {
  organizationId: string;
  transactionDate: string | null;
  transactionTime: string;
  destinationAccountSuffix: string;
  amount: number;
}) {
  return [
    input.organizationId,
    input.transactionDate ?? '',
    input.transactionTime,
    input.destinationAccountSuffix,
    input.amount.toFixed(2),
  ].join('|');
}

function formatDateOnly(input: Date) {
  return input.toISOString().slice(0, 10);
}

function addUtcDays(input: Date, days: number) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate() + days));
}

// Inverse of getBillingWindowForPeriod: which billing period (YYYY-MM) does a
// transaction date fall into, given the Hamba 09-of-previous-month → 08 window.
// Day 1–8 belongs to that calendar month's period; day 9+ belongs to the next.
export function getBillingPeriodForDate(transactionDate: string): string {
  const match = transactionDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('Transaction date must use YYYY-MM-DD format');
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const period = new Date(Date.UTC(year, monthIndex + (day >= 9 ? 1 : 0), 1));
  return `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getBillingWindowForPeriod(period: string): BillingWindow {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error('Billing period must use YYYY-MM format');
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error('Billing period must use YYYY-MM format');
  }

  const end = new Date(Date.UTC(year, monthIndex, 8));
  const start = new Date(Date.UTC(year, monthIndex - 1, 9));

  return {
    period,
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end),
    gmailAfterDate: formatDateOnly(addUtcDays(start, -1)),
    gmailBeforeDate: formatDateOnly(addUtcDays(end, 1)),
  };
}

function isEntryInsideBillingWindow(entry: ParsedCapitecEntry, billingWindow?: BillingWindow) {
  if (!billingWindow) return true;
  if (!entry.transactionDate) return false;
  return entry.transactionDate >= billingWindow.startDate && entry.transactionDate <= billingWindow.endDate;
}

export function isExcludedBankAccount(entry: Pick<ParsedCapitecEntry, 'destinationAccountSuffix'>) {
  return EXCLUDED_BANK_ACCOUNT_SUFFIXES.has(entry.destinationAccountSuffix);
}

function isEntryOnOrBeforeToday(entry: ParsedCapitecEntry) {
  if (!entry.transactionDate) return false;
  return entry.transactionDate <= formatDateOnly(new Date());
}

export function buildGmailSearchQuery(
  mailbox: Pick<BankImportMailboxRow, 'subject_filter' | 'label_filter' | 'last_synced_at'>,
  billingWindow?: BillingWindow
) {
  const parts = ['has:attachment'];
  if (mailbox.subject_filter.trim()) {
    parts.push(`subject:"${mailbox.subject_filter.trim().replace(/"/g, '')}"`);
  }
  if (mailbox.label_filter.trim()) {
    const labelFilter = mailbox.label_filter.trim();
    parts.push(labelFilter.includes(':') ? labelFilter : `label:${labelFilter}`);
  }
  if (!billingWindow && mailbox.last_synced_at) {
    const date = new Date(mailbox.last_synced_at);
    if (!Number.isNaN(date.getTime())) {
      parts.push(`after:${date.toISOString().slice(0, 10).replace(/-/g, '/')}`);
    }
  }
  if (billingWindow) {
    // Capitec notifications are FORWARDED into the collection mailbox, so a
    // message's Gmail received-date is the forward date — typically days or weeks
    // AFTER the transaction it reports. Scoping the Gmail search by received-date
    // (a tight before:/after: around the billing window) therefore drops exactly
    // the forwarded mail we want. We instead keep only a generous `after:` floor
    // to bound API volume (a forward can never arrive before the transaction, so
    // received-date >= the window start) and let `isEntryInsideBillingWindow`
    // scope results by the parsed transaction date downstream. No `before:` guard.
    parts.push(`after:${billingWindow.gmailAfterDate.replace(/-/g, '/')}`);
  }
  return parts.join(' ');
}

function parseHeaders(headers: Array<{ name?: string; value?: string }> | undefined) {
  const map = new Map<string, string>();
  for (const header of headers ?? []) {
    if (header.name) map.set(header.name.toLowerCase(), header.value ?? '');
  }
  return map;
}

function splitMimeSections(body: string, boundary: string) {
  const sections = body.split(new RegExp(`--${escapeRegExp(boundary)}(?:--)?\\s*`, 'g'));
  return sections.map((section) => section.trim()).filter(Boolean);
}

function splitHeadersAndBody(raw: string) {
  const separator = raw.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const index = raw.indexOf(separator);
  if (index === -1) return { headerText: raw, bodyText: '' };
  return {
    headerText: raw.slice(0, index),
    bodyText: raw.slice(index + separator.length),
  };
}

function decodeMimeBody(body: string, encoding: string) {
  if (encoding === 'base64') {
    return Buffer.from(body.replace(/\s+/g, ''), 'base64');
  }
  return Buffer.from(body, 'utf8');
}

export function extractAttachmentsFromEml(raw: Buffer, nestedFrom = 'message.eml'): ImportedAttachment[] {
  const text = raw.toString('utf8');
  const { headerText, bodyText } = splitHeadersAndBody(text);
  const headers = parseHeaders(
    headerText.split(/\r?\n/).map((line) => {
      const index = line.indexOf(':');
      return index === -1
        ? {}
        : {
            name: line.slice(0, index).trim(),
            value: line.slice(index + 1).trim(),
          };
    })
  );
  const contentType = headers.get('content-type') ?? '';
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (!boundaryMatch) return [];

  const boundary = boundaryMatch[1];
  const attachments: ImportedAttachment[] = [];

  for (const section of splitMimeSections(bodyText, boundary)) {
    const sectionParts = splitHeadersAndBody(section);
    const sectionHeaders = parseHeaders(
      sectionParts.headerText.split(/\r?\n/).map((line) => {
        const index = line.indexOf(':');
        return index === -1
          ? {}
          : {
              name: line.slice(0, index).trim(),
              value: line.slice(index + 1).trim(),
            };
      })
    );
    const sectionType = sectionHeaders.get('content-type') ?? '';
    const transferEncoding = (sectionHeaders.get('content-transfer-encoding') ?? '').toLowerCase();
    const disposition = sectionHeaders.get('content-disposition') ?? '';
    const filename =
      disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
      sectionType.match(/name="?([^";]+)"?/i)?.[1] ??
      '';

    if (sectionType.toLowerCase().startsWith('multipart/')) {
      attachments.push(...extractAttachmentsFromEml(Buffer.from(section, 'utf8'), nestedFrom));
      continue;
    }

    if (sectionType.toLowerCase().includes('message/rfc822')) {
      const nestedBuffer = decodeMimeBody(sectionParts.bodyText.trim(), transferEncoding);
      attachments.push(...extractAttachmentsFromEml(nestedBuffer, filename || nestedFrom));
      continue;
    }

    if (filename) {
      const sourceId = `eml:${nestedFrom}:${filename}:${sha256(decodeMimeBody(sectionParts.bodyText.trim(), transferEncoding)).slice(0, 16)}`;
      attachments.push({
        fileName: filename,
        mimeType: sectionType.split(';')[0].trim() || 'application/octet-stream',
        data: decodeMimeBody(sectionParts.bodyText.trim(), transferEncoding),
        source: 'eml',
        sourceId,
        nestedFrom,
      });
    }
  }

  return attachments;
}

function signJwtWithServiceAccount(input: {
  clientEmail: string;
  privateKey: string;
  subject: string;
  scopes: string[];
}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: input.clientEmail,
      sub: input.subject,
      scope: input.scopes.join(' '),
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claimSet}`);
  signer.end();
  const signature = signer
    .sign(input.privateKey.replace(/\\n/g, '\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${header}.${claimSet}.${signature}`;
}

export function getGmailIntegrationStatus() {
  const oauthClientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const oauthClientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const oauthRefreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN?.trim();
  const serviceAccountClientEmail = process.env.GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim();
  const serviceAccountPrivateKey = process.env.GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();

  const hasOAuthClient = Boolean(oauthClientId && oauthClientSecret);
  const hasOAuthRefreshToken = Boolean(oauthRefreshToken);
  const hasServiceAccount = Boolean(serviceAccountClientEmail && serviceAccountPrivateKey);

  return {
    configured: (hasOAuthClient && hasOAuthRefreshToken) || hasServiceAccount,
    preferredAuthMode: hasOAuthClient && hasOAuthRefreshToken ? 'oauth_refresh_token' : hasServiceAccount ? 'service_account' : null,
    hasOAuthClient,
    hasOAuthRefreshToken,
    hasServiceAccount,
    missing: {
      oauthClientId: !oauthClientId,
      oauthClientSecret: !oauthClientSecret,
      oauthRefreshToken: !oauthRefreshToken,
      serviceAccountClientEmail: !serviceAccountClientEmail,
      serviceAccountPrivateKey: !serviceAccountPrivateKey,
    },
  };
}

export function buildGmailOAuthConsentUrl(input: { redirectUri: string; state?: string }) {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error('Missing GMAIL_OAUTH_CLIENT_ID.');
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', BANK_IMPORT_OAUTH_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  if (input.state) {
    url.searchParams.set('state', input.state);
  }
  return url.toString();
}

export async function exchangeGmailOAuthCode(input: { code: string; redirectUri: string }) {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Missing Gmail OAuth env. Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET.');
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to exchange Gmail OAuth code (${response.status})`);
  }

  return (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

async function getGoogleOAuthRefreshAccessToken(): Promise<GoogleAccessTokenResult | null> {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_OAUTH_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    let googleError = '';
    let googleErrorDescription = '';
    try {
      const body = (await response.json()) as { error?: string; error_description?: string };
      googleError = body.error ?? '';
      googleErrorDescription = body.error_description ?? '';
    } catch {
      // Non-JSON error body; fall through with the bare status.
    }
    const detail = [googleError, googleErrorDescription].filter(Boolean).join(': ');
    const hint =
      googleError === 'invalid_grant'
        ? ' The stored refresh token has expired or been revoked — re-connect Gmail via /api/monthly-payments/import/google-cloud and update GMAIL_OAUTH_REFRESH_TOKEN. (If the Google Cloud OAuth consent screen is still in "Testing" mode, refresh tokens expire every 7 days; publish the app to Production to stop this.)'
        : '';
    throw new Error(
      `Failed to refresh Gmail OAuth access token (${response.status}${detail ? ` ${detail}` : ''}).${hint}`
    );
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('Gmail OAuth access token missing from refresh response');
  }
  return { accessToken: payload.access_token, authMode: 'oauth_refresh_token' };
}

async function getGoogleServiceAccountAccessToken(userEmail: string): Promise<GoogleAccessTokenResult | null> {
  const clientEmail = process.env.GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) {
    return null;
  }

  const assertion = signJwtWithServiceAccount({
    clientEmail,
    privateKey,
    subject: userEmail,
    scopes: [GMAIL_READONLY_SCOPE, DRIVE_FILE_SCOPE],
  });

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google access token (${response.status})`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error('Google access token missing from OAuth response');
  }
  return { accessToken: payload.access_token, authMode: 'service_account' };
}

async function getGoogleAccessToken(userEmail: string) {
  let oauthRefreshError: Error | null = null;
  try {
    const oauthToken = await getGoogleOAuthRefreshAccessToken();
    if (oauthToken) return oauthToken;
  } catch (error) {
    // Don't die yet — a configured service account can still serve the import.
    oauthRefreshError = error instanceof Error ? error : new Error(String(error));
  }

  const serviceAccountToken = await getGoogleServiceAccountAccessToken(userEmail);
  if (serviceAccountToken) return serviceAccountToken;

  if (oauthRefreshError) {
    throw oauthRefreshError;
  }

  throw new Error(
    'Missing Gmail auth env. Set either GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and GMAIL_OAUTH_REFRESH_TOKEN, or set GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL and GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY.'
  );
}

async function gmailRequest<T>(
  accessToken: string,
  path: string,
  searchParams?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/${path}`);
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Gmail request failed (${response.status}) for ${path}`);
  }
  return (await response.json()) as T;
}

async function loadGmailAttachment(
  accessToken: string,
  userEmail: string,
  messageId: string,
  attachmentId: string
) {
  const payload = await gmailRequest<GmailAttachmentResponse>(
    accessToken,
    `users/${encodeURIComponent(userEmail)}/messages/${messageId}/attachments/${attachmentId}`
  );
  if (!payload.data) throw new Error(`Attachment ${attachmentId} for message ${messageId} had no data`);
  return decodeBase64Url(payload.data);
}

async function collectGmailAttachments(accessToken: string, userEmail: string, message: GmailMessage) {
  const attachments: ImportedAttachment[] = [];

  async function walk(part: GmailMessagePart | undefined): Promise<void> {
    if (!part) return;

    for (const child of part.parts ?? []) {
      await walk(child);
    }

    const fileName = part.filename?.trim() ?? '';
    if (!fileName) return;

    let data: Buffer | null = null;
    if (part.body?.data) {
      data = decodeBase64Url(part.body.data);
    } else if (part.body?.attachmentId) {
      data = await loadGmailAttachment(accessToken, userEmail, message.id, part.body.attachmentId);
    }
    if (!data) return;

    const mimeType = part.mimeType?.trim() || 'application/octet-stream';
    if (mimeType === 'message/rfc822' || fileName.toLowerCase().endsWith('.eml')) {
      attachments.push(...extractAttachmentsFromEml(data, fileName));
      return;
    }

    attachments.push({
      fileName,
      mimeType,
      data,
      source: 'gmail',
      sourceId: part.body?.attachmentId?.trim() || `gmail-inline:${fileName}:${sha256(data).slice(0, 16)}`,
    });
  }

  await walk(message.payload);
  return attachments;
}

function matchesUnitMatchHint(entry: ParsedCapitecEntry, hint: BankImportUnitMatchHintRow) {
  const normalizedReference = normalizeReference(entry.reference);

  if (hint.matcher_type === 'reference_contains') {
    // Rule values are comma/space separated token lists (see
    // tokenizeMatcherValue in auto-match.ts) — any token hit counts.
    return tokenizeMatcherValue(hint.matcher_value).some((token) => referenceContainsMatcherToken(entry.reference, token));
  }
  if (hint.matcher_type === 'reference_equals') {
    return normalizedReference === normalizeReference(hint.matcher_value);
  }
  if (hint.matcher_type === 'reference_regex') {
    try {
      return new RegExp(hint.matcher_value, 'i').test(entry.reference);
    } catch {
      return false;
    }
  }
  if (hint.matcher_type === 'payer_name_contains') {
    return normalizeReference(entry.payerName).includes(normalizeReference(hint.matcher_value));
  }
  if (hint.matcher_type === 'amount_equals') {
    return Number(hint.amount_value ?? NaN) === entry.amount;
  }
  return false;
}

export function resolveImportContext(input: {
  entry: ParsedCapitecEntry;
  organizationId: string;
  propertyMappings: BankImportPropertyMappingRow[];
  unitMatchHints: BankImportUnitMatchHintRow[];
}) {
  const propertyMapping = input.propertyMappings.find(
    (mapping) =>
      mapping.organization_id === input.organizationId &&
      mapping.is_active &&
      mapping.account_number_suffix === input.entry.destinationAccountSuffix
  );

  const propertyLocked =
    Boolean(propertyMapping?.property_id) &&
    PROPERTY_LOCKED_BANK_ACCOUNT_SUFFIXES.has(input.entry.destinationAccountSuffix);
  const matchingHints = input.unitMatchHints
    .filter((hint) => hint.is_active)
    .filter((hint) => !propertyLocked || !hint.property_id || hint.property_id === propertyMapping?.property_id)
    .filter(
      (hint) =>
        (!hint.account_number_suffix || hint.account_number_suffix === input.entry.destinationAccountSuffix) &&
        matchesUnitMatchHint(input.entry, hint)
    );

  const hintRank = (hint: BankImportUnitMatchHintRow) => {
    if (hint.matcher_type.startsWith('reference_')) return 0;
    if (hint.matcher_type === 'payer_name_contains') return 1;
    return 2;
  };
  matchingHints.sort((left, right) => hintRank(left) - hintRank(right) || left.priority - right.priority);

  const propertyDecisionHints = matchingHints.filter(
    (hint) => hint.matcher_type !== 'amount_equals' || Boolean(hint.account_number_suffix)
  );
  const strongestRank = propertyDecisionHints[0] ? hintRank(propertyDecisionHints[0]) : null;
  const strongestPriority = propertyDecisionHints[0]?.priority ?? null;
  const strongestHints = propertyDecisionHints.filter(
    (hint) => hintRank(hint) === strongestRank && hint.priority === strongestPriority
  );
  const hintedPropertyIds = Array.from(
    new Set(strongestHints.map((hint) => hint.property_id).filter((propertyId): propertyId is string => Boolean(propertyId)))
  );
  const accountScopedAmountHints = matchingHints.filter(
    (hint) => hint.matcher_type === 'amount_equals' && hint.account_number_suffix === input.entry.destinationAccountSuffix
  );
  const amountPropertyIds = Array.from(
    new Set(accountScopedAmountHints.map((hint) => hint.property_id).filter((propertyId): propertyId is string => Boolean(propertyId)))
  );
  const fallbackAmountPropertyId = hintedPropertyIds.length > 1 && amountPropertyIds.length === 1 ? amountPropertyIds[0] : null;
  const hintedPropertyId = hintedPropertyIds.length === 1 ? hintedPropertyIds[0] : fallbackAmountPropertyId;
  const hasHintConflict = hintedPropertyIds.length > 1 && !fallbackAmountPropertyId;
  const propertyId = propertyLocked
    ? propertyMapping?.property_id ?? null
    : hasHintConflict
      ? null
      : hintedPropertyId ?? propertyMapping?.property_id ?? null;
  const propertyName = hintedPropertyId
    ? input.propertyMappings.find((mapping) => mapping.property_id === hintedPropertyId)?.property_name ?? ''
    : propertyMapping?.property_name ?? '';
  const decidingHint = hintedPropertyId
    ? strongestHints.find((hint) => hint.property_id === hintedPropertyId) ?? null
    : null;

  const context: ResolvedImportContext = {
    propertyId,
    propertyName,
    matchedBy: propertyLocked && propertyMapping
      ? `account_suffix:${propertyMapping.account_number_suffix}`
      : hasHintConflict
      ? null
      : decidingHint
      ? `${decidingHint.matcher_type}:${decidingHint.id}`
      : propertyMapping
        ? `account_suffix:${propertyMapping.account_number_suffix}`
        : null,
    unitHints: matchingHints.filter((hint) => !propertyId || !hint.property_id || hint.property_id === propertyId).map((hint) => ({
      hintId: hint.id,
      unitId: hint.unit_id,
      matcherType: hint.matcher_type,
      priority: hint.priority,
    })),
  };

  return context;
}

async function upsertBankImportMessage(input: {
  mailbox: BankImportMailboxRow;
  message: GmailMessage;
  messageFrom: string;
  subject: string;
  receivedAt: string | null;
}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('bank_import_messages')
    .upsert(
      {
        mailbox_id: input.mailbox.id,
        gmail_message_id: input.message.id,
        gmail_thread_id: input.message.threadId ?? '',
        gmail_history_id: input.message.historyId ?? '',
        message_from: input.messageFrom,
        subject: input.subject,
        received_at: input.receivedAt,
        raw_metadata: {
          internalDate: input.message.internalDate ?? '',
        },
      },
      { onConflict: 'mailbox_id,gmail_message_id' }
    )
    .select('id')
    .single<BankImportMessageRow>();

  if (error) throw new Error(`Failed to upsert bank import message: ${error.message}`);
  return data;
}

async function upsertDriveImportMessage(input: {
  mailbox: BankImportMailboxRow;
  driveFile: {
    id: string;
    name: string;
    appProperties?: Record<string, string>;
  };
}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('bank_import_messages')
    .upsert(
      {
        mailbox_id: input.mailbox.id,
        gmail_message_id: `drive:${input.driveFile.id}`,
        gmail_thread_id: '',
        gmail_history_id: '',
        message_from: 'google-drive',
        subject: input.driveFile.name,
        received_at: null,
        raw_metadata: {
          source: 'drive',
          driveFileId: input.driveFile.id,
          driveName: input.driveFile.name,
          appProperties: input.driveFile.appProperties ?? {},
        },
      },
      { onConflict: 'mailbox_id,gmail_message_id' }
    )
    .select('id')
    .single<BankImportMessageRow>();

  if (error) throw new Error(`Failed to upsert drive import message: ${error.message}`);
  return data;
}

async function upsertDriveBankImportMessage(input: {
  mailbox: BankImportMailboxRow;
  driveFile: {
    id: string;
    name: string;
    appProperties?: Record<string, string>;
  };
}) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('bank_import_messages')
    .upsert(
      {
        mailbox_id: input.mailbox.id,
        gmail_message_id: `drive-bank:${input.driveFile.id}`,
        gmail_thread_id: '',
        gmail_history_id: '',
        message_from: 'google-drive-bank-uploads',
        subject: input.driveFile.name,
        received_at: null,
        raw_metadata: {
          source: 'drive-bank',
          driveFileId: input.driveFile.id,
          driveName: input.driveFile.name,
          appProperties: input.driveFile.appProperties ?? {},
        },
      },
      { onConflict: 'mailbox_id,gmail_message_id' }
    )
    .select('id')
    .single<BankImportMessageRow>();

  if (error) throw new Error(`Failed to upsert Drive bank import message: ${error.message}`);
  return data;
}

async function uploadImportFile(storagePath: string, data: Buffer, mimeType: string) {
  const admin = getSupabaseAdmin();
  const result = await admin.storage.from('uploads').upload(storagePath, data, {
    contentType: mimeType,
    upsert: false,
  });

  if (result.error && !/already exists/i.test(result.error.message)) {
    throw new Error(`Failed to upload bank import file: ${result.error.message}`);
  }
}

function sanitizeStorageSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function buildImportStoragePath(input: {
  organizationId: string;
  mailboxId: string;
  sourceFolder: 'gmail' | 'drive' | 'bank';
  messageSourceId: string;
  fileSha256: string;
  fileName: string;
}) {
  return [
    'bank-imports',
    input.organizationId,
    input.mailboxId,
    input.sourceFolder,
    sanitizeStorageSegment(input.messageSourceId),
    input.fileSha256,
    sanitizeStorageSegment(input.fileName),
  ].join('/');
}

async function createBankImportFile(input: {
  messageId: string;
  attachment: ImportedAttachment;
  fileSha256: string;
  storagePath: string;
}) {
  const admin = getSupabaseAdmin();
  const { data: existingFile } = await admin
    .from('bank_import_files')
    .select('id')
    .eq('file_sha256', input.fileSha256)
    .maybeSingle<BankImportFileRow>();
  if (existingFile) return { file: existingFile, duplicate: true };

  const { data: existingAttachmentFile } = await admin
    .from('bank_import_files')
    .select('id')
    .eq('message_id', input.messageId)
    .eq('gmail_attachment_id', input.attachment.sourceId)
    .maybeSingle<BankImportFileRow>();
  if (existingAttachmentFile) return { file: existingAttachmentFile, duplicate: true };

  const { data, error } = await admin
    .from('bank_import_files')
    .insert({
      message_id: input.messageId,
      gmail_attachment_id: input.attachment.sourceId,
      file_name: input.attachment.fileName,
      mime_type: input.attachment.mimeType,
      file_size_bytes: input.attachment.data.byteLength,
      file_sha256: input.fileSha256,
      storage_path: input.storagePath,
      parser_status: 'pending',
      raw_metadata: {
        source: input.attachment.source,
        nestedFrom: input.attachment.nestedFrom ?? '',
      },
    })
    .select('id')
    .single<BankImportFileRow>();

  if (error) throw new Error(`Failed to insert bank import file: ${error.message}`);
  return { file: data, duplicate: false };
}

async function markBankImportFile(input: {
  fileId: string;
  parserStatus: 'parsed' | 'unsupported' | 'failed';
  parserError?: string;
}) {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('bank_import_files')
    .update({
      parser_status: input.parserStatus,
      parsed_at: new Date().toISOString(),
      parser_error: input.parserError ?? '',
    })
    .eq('id', input.fileId);

  if (error) throw new Error(`Failed to update bank import file ${input.fileId}: ${error.message}`);
}

async function markExcludedBankImportFile(fileId: string, accountSuffixValue: string) {
  const admin = getSupabaseAdmin();
  const { data: file, error: readError } = await admin
    .from('bank_import_files')
    .select('raw_metadata')
    .eq('id', fileId)
    .single();
  if (readError) throw new Error(`Failed to load excluded bank import file ${fileId}: ${readError.message}`);
  const { error } = await admin
    .from('bank_import_files')
    .update({
      parser_status: 'unsupported',
      storage_path: '',
      parsed_at: new Date().toISOString(),
      raw_metadata: {
        ...((file?.raw_metadata as Record<string, unknown> | null) ?? {}),
        excludedAccountSuffix: accountSuffixValue,
        exclusionReason: 'internal_non_rent_account',
      },
    })
    .eq('id', fileId);
  if (error) throw new Error(`Failed to exclude bank import file ${fileId}: ${error.message}`);
}

async function upsertBankImportEntry(input: {
  fileId: string;
  organizationId: string;
  entry: ParsedCapitecEntry;
  resolved: ResolvedImportContext;
}) {
  const admin = getSupabaseAdmin();
  if (input.entry.transactionDate && input.entry.transactionTime && input.entry.destinationAccountSuffix) {
    const { data: crossSourceCandidates, error: crossSourceError } = await admin
      .from('bank_import_entries')
      .select('id,transaction_time,reference')
      .eq('organization_id', input.organizationId)
      .eq('transaction_date', input.entry.transactionDate)
      .eq('destination_account_suffix', input.entry.destinationAccountSuffix)
      .eq('amount', input.entry.amount);
    if (crossSourceError) throw new Error(`Failed to check cross-source bank duplicate: ${crossSourceError.message}`);
    const incomingMinute = input.entry.transactionTime.slice(0, 5);
    const incomingReference = canonicalizeBankReference(input.entry.reference);
    const existingCrossSource = (crossSourceCandidates ?? []).find((candidate) =>
      (candidate.transaction_time as string).slice(0, 5) === incomingMinute &&
      canonicalizeBankReference(candidate.reference as string) === incomingReference
    );
    if (existingCrossSource) return existingCrossSource.id as string;
  }
  const fingerprint = buildEntryFingerprint({
    organizationId: input.organizationId,
    transactionType: input.entry.transactionType,
    transactionDate: input.entry.transactionDate,
    transactionTime: input.entry.transactionTime,
    transactionId: input.entry.transactionId,
    destinationAccountSuffix: input.entry.destinationAccountSuffix,
    amount: input.entry.amount,
    reference: input.entry.reference,
  });

  const { data, error } = await admin
    .from('bank_import_entries')
    .upsert(
      {
        file_id: input.fileId,
        organization_id: input.organizationId,
        property_id: input.resolved.propertyId,
        entry_fingerprint: fingerprint,
        transaction_type: input.entry.transactionType,
        transaction_date: input.entry.transactionDate,
        transaction_time: input.entry.transactionTime,
        reference: input.entry.reference,
        description: input.entry.description,
        payer_name: input.entry.payerName,
        amount: input.entry.amount,
        destination_account_suffix: input.entry.destinationAccountSuffix,
        available_balance: input.entry.availableBalance,
        raw_extracted_text: input.entry.rawExtractedText,
        raw_metadata: {
          transactionId: input.entry.transactionId,
          propertyName: input.resolved.propertyName,
          matchedBy: input.resolved.matchedBy,
          unitHints: input.resolved.unitHints,
        },
      },
      { onConflict: 'entry_fingerprint' }
    )
    .select('id')
    .single<{ id: string }>();

  if (error) throw new Error(`Failed to upsert bank import entry: ${error.message}`);
  return data.id;
}

async function upsertPaymentReferenceFromImport(input: {
  organizationId: string;
  propertyId: string | null;
  bankImportEntryId: string;
  entry: Pick<ParsedCapitecEntry, 'transactionDate' | 'transactionTime' | 'reference' | 'amount'>;
}) {
  const admin = getSupabaseAdmin();
  const receivedAt = input.entry.transactionDate ?? new Date().toISOString().slice(0, 10);
  const transactionAt = toSouthAfricaIsoTimestamp(input.entry.transactionDate, input.entry.transactionTime);
  const payload = {
    organization_id: input.organizationId,
    property_id: input.propertyId,
    reference: input.entry.reference,
    amount: input.entry.amount,
    received_at: receivedAt,
    transaction_at: transactionAt,
    bank: 'Capitec',
    bank_import_entry_id: input.bankImportEntryId,
  };

  const { data: existingReference, error: existingReferenceError } = await admin
    .from('payment_references')
    .select('id')
    .eq('bank_import_entry_id', input.bankImportEntryId)
    .maybeSingle<{ id: string }>();

  if (existingReferenceError) {
    throw new Error(`Failed to load payment reference from import: ${existingReferenceError.message}`);
  }

  if (existingReference) {
    const { error } = await admin.from('payment_references').update(payload).eq('id', existingReference.id);
    if (error) throw new Error(`Failed to update payment reference from import: ${error.message}`);
    return 'updated' as const;
  }

  const { error } = await admin.from('payment_references').insert({
    ...payload,
    signed_off: false,
    unit_id: null,
    matched_at: null,
    matched_by: '',
    match_method: 'manual',
  });
  if (error) throw new Error(`Failed to insert payment reference from import: ${error.message}`);
  return 'inserted' as const;
}

function validateParsedImportEntry(entry: ParsedCapitecEntry) {
  const missing: string[] = [];
  if (!entry.transactionId.trim()) missing.push('transaction ID');
  if (!entry.transactionDate) missing.push('transaction date');
  if (!normalizeReference(entry.reference)) missing.push('payment reference');
  if (!Number.isFinite(entry.amount) || entry.amount <= 0) missing.push('positive amount');

  return missing.length > 0 ? `Integrity check failed: missing ${missing.join(', ')}` : null;
}

async function syncEntryForExistingFile(input: {
  fileId: string;
  organizationId: string;
  entry: ParsedCapitecEntry;
  resolved: ResolvedImportContext;
}) {
  const admin = getSupabaseAdmin();
  const fingerprint = buildEntryFingerprint({
    organizationId: input.organizationId,
    transactionType: input.entry.transactionType,
    transactionDate: input.entry.transactionDate,
    transactionTime: input.entry.transactionTime,
    transactionId: input.entry.transactionId,
    destinationAccountSuffix: input.entry.destinationAccountSuffix,
    amount: input.entry.amount,
    reference: input.entry.reference,
  });

  const payload = {
    organization_id: input.organizationId,
    property_id: input.resolved.propertyId,
    entry_fingerprint: fingerprint,
    transaction_type: input.entry.transactionType,
    transaction_date: input.entry.transactionDate,
    transaction_time: input.entry.transactionTime,
    reference: input.entry.reference,
    description: input.entry.description,
    payer_name: input.entry.payerName,
    amount: input.entry.amount,
    destination_account_suffix: input.entry.destinationAccountSuffix,
    available_balance: input.entry.availableBalance,
    raw_extracted_text: input.entry.rawExtractedText,
    raw_metadata: {
      transactionId: input.entry.transactionId,
      propertyName: input.resolved.propertyName,
      matchedBy: input.resolved.matchedBy,
      unitHints: input.resolved.unitHints,
    },
  };

  const { data: existingEntry, error: existingEntryError } = await admin
    .from('bank_import_entries')
    .select('id')
    .eq('file_id', input.fileId)
    .maybeSingle<{ id: string }>();
  if (existingEntryError) {
    throw new Error(`Failed to load existing bank import entry for duplicate file: ${existingEntryError.message}`);
  }

  if (!existingEntry) {
    return upsertBankImportEntry(input);
  }

  const { error } = await admin.from('bank_import_entries').update(payload).eq('id', existingEntry.id);
  if (error) {
    throw new Error(`Failed to refresh duplicate bank import entry: ${error.message}`);
  }
  return existingEntry.id;
}

async function processImportedAttachment(input: {
  mailbox: BankImportMailboxRow;
  messageRowId: string;
  messageSourceId: string;
  sourceFolder: 'gmail' | 'drive';
  attachment: ImportedAttachment;
  organizationId: string;
  billingWindow?: BillingWindow;
  propertyMappings: BankImportPropertyMappingRow[];
  unitMatchHints: BankImportUnitMatchHintRow[];
}) {
  const fileSha256 = sha256(input.attachment.data);
  const storagePath = buildImportStoragePath({
    organizationId: input.organizationId,
    mailboxId: input.mailbox.id,
    sourceFolder: input.sourceFolder,
    messageSourceId: input.messageSourceId,
    fileSha256,
    fileName: input.attachment.fileName,
  });

  const isPdf =
    input.attachment.mimeType === 'application/pdf' || input.attachment.fileName.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const extractedText = await extractPdfText(input.attachment.data);
    const movement = parseCapitecAccountMovementText(extractedText);
    if (
      movement?.direction === 'outgoing' &&
      EXCLUDED_BANK_ACCOUNT_SUFFIXES.has(movement.accountSuffix)
    ) {
      const excludedFile = await createBankImportFile({
        messageId: input.messageRowId,
        attachment: input.attachment,
        fileSha256,
        storagePath,
      });
      await markExcludedBankImportFile(excludedFile.file.id, movement.accountSuffix);
      return {
        duplicate: excludedFile.duplicate,
        fileStored: false,
        entryCreated: false,
        paymentReferenceCreated: false,
        ignored: true,
      };
    }
  }

  const { file, duplicate } = await createBankImportFile({
    messageId: input.messageRowId,
    attachment: input.attachment,
    fileSha256,
    storagePath,
  });

  if (duplicate) {
    let paymentReferenceCreated = false;

    if (isPdf) {
      const extractedText = await extractPdfText(input.attachment.data);
      const parsedEntry = parseCapitecTransactionText(extractedText);
      const integrityError = parsedEntry ? validateParsedImportEntry(parsedEntry) : 'Unsupported PDF payload';

      if (parsedEntry && (isExcludedBankAccount(parsedEntry) || isExcludedNonRentCredit(parsedEntry))) {
        return {
          duplicate: true,
          fileStored: false,
          entryCreated: false,
          paymentReferenceCreated: false,
          ignored: true,
        };
      }

      if (parsedEntry && !integrityError && !isExcludedBankAccount(parsedEntry) && !isExcludedNonRentCredit(parsedEntry) && isEntryInsideBillingWindow(parsedEntry, input.billingWindow)) {
        const resolved = resolveImportContext({
          entry: parsedEntry,
          organizationId: input.organizationId,
          propertyMappings: input.propertyMappings,
          unitMatchHints: input.unitMatchHints,
        });
        const entryId = await syncEntryForExistingFile({
          fileId: file.id,
          organizationId: input.organizationId,
          entry: parsedEntry,
          resolved,
        });

        if (isIncomingFunds(parsedEntry)) {
          await upsertPaymentReferenceFromImport({
            organizationId: input.organizationId,
            propertyId: resolved.propertyId,
            bankImportEntryId: entryId,
            entry: parsedEntry,
          });
          paymentReferenceCreated = true;
        }
      }
    }

    return {
      duplicate: true,
      fileStored: false,
      entryCreated: false,
      paymentReferenceCreated: paymentReferenceCreated || (await backfillPaymentReferenceForExistingFile(file.id)),
      ignored: false,
    };
  }

  await uploadImportFile(storagePath, input.attachment.data, input.attachment.mimeType);

  if (!isPdf) {
    await markBankImportFile({ fileId: file.id, parserStatus: 'unsupported' });
    return {
      duplicate: false,
      fileStored: true,
      entryCreated: false,
      paymentReferenceCreated: false,
      ignored: true,
    };
  }

  try {
    const extractedText = await extractPdfText(input.attachment.data);
    const parsedEntry = parseCapitecTransactionText(extractedText);
    if (!parsedEntry) {
      await markBankImportFile({ fileId: file.id, parserStatus: 'unsupported' });
      return {
        duplicate: false,
        fileStored: true,
        entryCreated: false,
        paymentReferenceCreated: false,
        ignored: true,
      };
    }

    const integrityError = validateParsedImportEntry(parsedEntry);
    if (integrityError) {
      await markBankImportFile({
        fileId: file.id,
        parserStatus: 'failed',
        parserError: integrityError,
      });
      return {
        duplicate: false,
        fileStored: true,
        entryCreated: false,
        paymentReferenceCreated: false,
        ignored: true,
      };
    }

    if (isExcludedBankAccount(parsedEntry)) {
      await markBankImportFile({ fileId: file.id, parserStatus: 'unsupported' });
      return {
        duplicate: false,
        fileStored: true,
        entryCreated: false,
        paymentReferenceCreated: false,
        ignored: true,
      };
    }

    if (isExcludedNonRentCredit(parsedEntry)) {
      await markBankImportFile({ fileId: file.id, parserStatus: 'parsed' });
      return {
        duplicate: false,
        fileStored: true,
        entryCreated: false,
        paymentReferenceCreated: false,
        ignored: true,
      };
    }

    if (!isEntryInsideBillingWindow(parsedEntry, input.billingWindow)) {
      await markBankImportFile({ fileId: file.id, parserStatus: 'parsed' });
      return {
        duplicate: false,
        fileStored: true,
        entryCreated: false,
        paymentReferenceCreated: false,
        ignored: true,
      };
    }

    const resolved = resolveImportContext({
      entry: parsedEntry,
      organizationId: input.organizationId,
      propertyMappings: input.propertyMappings,
      unitMatchHints: input.unitMatchHints,
    });
    const entryId = await upsertBankImportEntry({
      fileId: file.id,
      organizationId: input.organizationId,
      entry: parsedEntry,
      resolved,
    });

    let paymentReferenceCreated = false;
    if (isIncomingFunds(parsedEntry)) {
      await upsertPaymentReferenceFromImport({
        organizationId: input.organizationId,
        propertyId: resolved.propertyId,
        bankImportEntryId: entryId,
        entry: parsedEntry,
      });
      paymentReferenceCreated = true;
    }

    await markBankImportFile({ fileId: file.id, parserStatus: 'parsed' });

    return {
      duplicate: false,
      fileStored: true,
      entryCreated: true,
      paymentReferenceCreated,
      ignored: !paymentReferenceCreated,
    };
  } catch (error) {
    await markBankImportFile({
      fileId: file.id,
      parserStatus: 'failed',
      parserError: error instanceof Error ? error.message : 'Failed to parse attachment',
    });
    throw error;
  }
}

async function backfillPaymentReferenceForExistingFile(fileId: string) {
  const admin = getSupabaseAdmin();
  const { data: entry, error } = await admin
    .from('bank_import_entries')
    .select('id,organization_id,property_id,transaction_type,transaction_date,transaction_time,reference,amount,destination_account_suffix')
    .eq('file_id', fileId)
    .maybeSingle<BankImportEntryRow>();

  if (error) {
    throw new Error(`Failed to load existing bank import entry: ${error.message}`);
  }
  if (!entry || !entry.organization_id) return false;
  if (entry.transaction_type.trim().toLowerCase() !== 'incoming funds') return false;
  if (isExcludedNonRentCredit(entry)) return false;
  if (EXCLUDED_BANK_ACCOUNT_SUFFIXES.has((entry as BankImportEntryRow & { destination_account_suffix: string }).destination_account_suffix)) return false;

  await upsertPaymentReferenceFromImport({
    organizationId: entry.organization_id,
    propertyId: entry.property_id,
    bankImportEntryId: entry.id,
    entry: {
      transactionDate: entry.transaction_date,
      transactionTime: entry.transaction_time,
      reference: entry.reference,
      amount: Number(entry.amount),
    },
  });
  return true;
}

async function markBankImportMessageStatus(messageId: string, status: 'processed' | 'failed' | 'ignored', errorMessage = '') {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('bank_import_messages')
    .update({
      import_status: status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('id', messageId);
  if (error) throw new Error(`Failed to update bank import message status: ${error.message}`);
}

async function updateMailboxSyncState(mailboxId: string) {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from('bank_import_mailboxes')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', mailboxId);
  if (error) throw new Error(`Failed to update bank import mailbox sync state: ${error.message}`);
}

function isBankStatementFile(fileName: string, mimeType: string) {
  const lowerName = fileName.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  return (
    lowerMime.includes('pdf') ||
    lowerMime.includes('csv') ||
    lowerMime.includes('text/plain') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.txt')
  );
}

async function parseBankStatementAttachment(attachment: ImportedAttachment) {
  const lowerName = attachment.fileName.toLowerCase();
  const lowerMime = attachment.mimeType.toLowerCase();
  if (lowerMime.includes('pdf') || lowerName.endsWith('.pdf')) {
    return parseBankStatementText(await extractPdfText(attachment.data));
  }
  if (
    lowerMime.includes('csv') ||
    lowerMime.includes('text/plain') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.txt')
  ) {
    return parseBankStatementCsv(attachment.data.toString('utf8'));
  }
  return null;
}

async function processBankStatementAttachment(input: {
  mailbox: BankImportMailboxRow;
  messageRowId: string;
  messageSourceId: string;
  sourceFolder: 'bank';
  attachment: ImportedAttachment;
  organizationId: string;
  billingWindow?: BillingWindow;
  propertyMappings: BankImportPropertyMappingRow[];
  unitMatchHints: BankImportUnitMatchHintRow[];
}) {
  const fileSha256 = sha256(input.attachment.data);
  const storagePath = buildImportStoragePath({
    organizationId: input.organizationId,
    mailboxId: input.mailbox.id,
    sourceFolder: input.sourceFolder,
    messageSourceId: input.messageSourceId,
    fileSha256,
    fileName: input.attachment.fileName,
  });
  const { file, duplicate } = await createBankImportFile({
    messageId: input.messageRowId,
    attachment: input.attachment,
    fileSha256,
    storagePath,
  });

  if (duplicate) {
    return {
      duplicate: true,
      fileId: file.id,
      fileStored: false,
      rowsParsed: 0,
      rowsInsideWindow: 0,
      entriesCreated: 0,
      paymentReferencesCreated: 0,
      ignoredEntries: 0,
      importedPeriods: [] as string[],
    };
  }

  await uploadImportFile(storagePath, input.attachment.data, input.attachment.mimeType || 'application/octet-stream');
  const entries = await parseBankStatementAttachment(input.attachment);
  if (!entries) {
    await markBankImportFile({ fileId: file.id, parserStatus: 'unsupported' });
    return {
      duplicate: false,
      fileId: file.id,
      fileStored: true,
      rowsParsed: 0,
      rowsInsideWindow: 0,
      entriesCreated: 0,
      paymentReferencesCreated: 0,
      ignoredEntries: 1,
      importedPeriods: [] as string[],
    };
  }

  const resolvedFor = (entry: ParsedCapitecEntry): ResolvedImportContext => {
    return resolveImportContext({
      entry,
      organizationId: input.organizationId,
      propertyMappings: input.propertyMappings,
      unitMatchHints: input.unitMatchHints,
    });
  };

  let rowsInsideWindow = 0;
  let entriesCreated = 0;
  let paymentReferencesCreated = 0;
  let ignoredEntries = 0;
  const importedPeriods = new Set<string>();

  for (const entry of entries) {
    const integrityError = validateParsedImportEntry(entry);
    if (integrityError || isExcludedBankAccount(entry) || isExcludedNonRentCredit(entry) || !isEntryInsideBillingWindow(entry, input.billingWindow) || !isEntryOnOrBeforeToday(entry)) {
      ignoredEntries += 1;
      continue;
    }
    rowsInsideWindow += 1;
    if (entry.transactionDate) importedPeriods.add(getBillingPeriodForDate(entry.transactionDate));

    const resolved = resolvedFor(entry);
    const entryId = await upsertBankImportEntry({
      fileId: file.id,
      organizationId: input.organizationId,
      entry,
      resolved,
    });
    entriesCreated += 1;
    await upsertPaymentReferenceFromImport({
      organizationId: input.organizationId,
      propertyId: resolved.propertyId,
      bankImportEntryId: entryId,
      entry,
    });
    paymentReferencesCreated += 1;
  }

  await markBankImportFile({ fileId: file.id, parserStatus: entries.length > 0 ? 'parsed' : 'unsupported' });

  return {
    duplicate: false,
    fileId: file.id,
    fileStored: true,
    rowsParsed: entries.length,
    rowsInsideWindow,
    entriesCreated,
    paymentReferencesCreated,
    ignoredEntries,
    importedPeriods: Array.from(importedPeriods).sort(),
  };
}

async function loadImportLookups(organizationId: string) {
  const admin = getSupabaseAdmin();
  const [propertyMappingsResult, unitHintsResult] = await Promise.all([
    admin
      .from('bank_import_property_mappings')
      .select('id,organization_id,property_id,account_number_suffix,property_name,is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true),
    admin
      .from('bank_import_unit_match_hints')
      .select('id,property_id,unit_id,account_number_suffix,matcher_type,matcher_value,amount_value,priority,is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true),
  ]);
  if (propertyMappingsResult.error) {
    throw new Error(`Failed to load bank import property mappings: ${propertyMappingsResult.error.message}`);
  }
  if (unitHintsResult.error) {
    throw new Error(`Failed to load bank import unit match hints: ${unitHintsResult.error.message}`);
  }

  return {
    propertyMappings: (propertyMappingsResult.data ?? []) as BankImportPropertyMappingRow[],
    unitMatchHints: (unitHintsResult.data ?? []) as BankImportUnitMatchHintRow[],
  };
}

export async function listActiveBankImportMailboxes() {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('bank_import_mailboxes')
    .select('id,organization_id,email_address,provider,label_filter,subject_filter,is_active,last_synced_at')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to load bank import mailboxes: ${error.message}`);
  return (data ?? []) as BankImportMailboxRow[];
}

export async function importMailboxPayments(
  mailbox: BankImportMailboxRow,
  options?: { maxMessages?: number; billingWindow?: BillingWindow }
): Promise<BankImportRunSummary> {
  if (!mailbox.organization_id) {
    throw new Error(`Mailbox ${mailbox.email_address} is missing organization_id`);
  }

  const googleAuth = await getGoogleAccessToken(mailbox.email_address);
  const accessToken = googleAuth.accessToken;
  const searchQuery = buildGmailSearchQuery(mailbox, options?.billingWindow);
  const { propertyMappings, unitMatchHints } = await loadImportLookups(mailbox.organization_id);
  const listResponse = await gmailRequest<GmailListResponse>(
    accessToken,
    `users/${encodeURIComponent(mailbox.email_address)}/messages`,
    {
      q: searchQuery,
      maxResults: options?.maxMessages ?? 25,
    }
  );

  // Pre-load message IDs that are safe to skip. A message is only safe to skip
  // when it is marked "processed" AND its files have produced at least one entry.
  // Messages processed under a different billing window may have parsed files but
  // no entries for the current window — those must be re-processed.
  const admin = getSupabaseAdmin();
  const { data: processedMessages } = await admin
    .from('bank_import_messages')
    .select('id, gmail_message_id')
    .eq('mailbox_id', mailbox.id)
    .eq('import_status', 'processed');
  const processedRows = processedMessages ?? [];
  const processedMessageIds = new Set<string>();

  if (processedRows.length > 0) {
    const msgDbIds = processedRows.map((m) => m.id);

    // Get all files belonging to these messages
    const { data: msgFiles } = await admin
      .from('bank_import_files')
      .select('id, message_id')
      .in('message_id', msgDbIds);

    // Get all file IDs that have entries
    const { data: entryRows } = await admin
      .from('bank_import_entries')
      .select('file_id');
    const fileIdsWithEntries = new Set(
      (entryRows ?? []).map((e: { file_id: string }) => e.file_id)
    );

    // A message is safe to skip if ANY of its files has an entry
    const msgDbIdsWithEntries = new Set<string>();
    for (const f of msgFiles ?? []) {
      if (fileIdsWithEntries.has(f.id)) {
        msgDbIdsWithEntries.add(f.message_id);
      }
    }
    for (const row of processedRows) {
      if (msgDbIdsWithEntries.has(row.id)) {
        processedMessageIds.add(row.gmail_message_id);
      }
    }
  }

  const summary: BankImportRunSummary = {
    mailboxEmail: mailbox.email_address,
    authMode: googleAuth.authMode,
    billingPeriod: options?.billingWindow?.period ?? null,
    billingWindowStart: options?.billingWindow?.startDate ?? null,
    billingWindowEnd: options?.billingWindow?.endDate ?? null,
    messagesScanned: 0,
    messagesImported: 0,
    attachmentsProcessed: 0,
    filesStored: 0,
    duplicateFiles: 0,
    entriesCreated: 0,
    paymentReferencesCreated: 0,
    ignoredEntries: 0,
    failedMessages: 0,
    messagesSkipped: 0,
    filesArchivedToDrive: 0,
    importedPeriods: [],
  };

  for (const listedMessage of listResponse.messages ?? []) {
    summary.messagesScanned += 1;

    // Fix 1: Skip messages already fully processed — no Gmail API fetch needed
    if (processedMessageIds.has(listedMessage.id)) {
      summary.messagesSkipped += 1;
      continue;
    }

    try {
      const message = await gmailRequest<GmailMessage>(
        accessToken,
        `users/${encodeURIComponent(mailbox.email_address)}/messages/${listedMessage.id}`,
        { format: 'full' }
      );
      const headers = parseHeaders(message.payload?.headers);
      const subject = headers.get('subject') ?? '';
      const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : null;
      const messageRow = await upsertBankImportMessage({
        mailbox,
        message,
        messageFrom: headers.get('from') ?? '',
        subject,
        receivedAt,
      });
      summary.messagesImported += 1;

      const attachments = await collectGmailAttachments(accessToken, mailbox.email_address, message);
      for (const attachment of attachments) {
        summary.attachmentsProcessed += 1;
        const result = await processImportedAttachment({
          mailbox,
          messageRowId: messageRow.id,
          messageSourceId: message.id,
          sourceFolder: 'gmail',
          attachment,
          organizationId: mailbox.organization_id,
          billingWindow: options?.billingWindow,
          propertyMappings,
          unitMatchHints,
        });

        if (result.duplicate) summary.duplicateFiles += 1;
        if (result.fileStored) summary.filesStored += 1;
        if (result.entryCreated) summary.entriesCreated += 1;
        if (result.paymentReferenceCreated) summary.paymentReferencesCreated += 1;
        if (result.ignored) summary.ignoredEntries += 1;
      }

      await markBankImportMessageStatus(messageRow.id, 'processed');
    } catch (error) {
      summary.failedMessages += 1;
      if (error instanceof Error) {
        console.error(`Bank import failed for ${mailbox.email_address}:`, error.message);
      } else {
        console.error(`Bank import failed for ${mailbox.email_address}:`, error);
      }
    }
  }

  await updateMailboxSyncState(mailbox.id);
  return summary;
}

export async function importDrivePayments(
  mailbox: BankImportMailboxRow,
  options?: { billingWindow?: BillingWindow }
): Promise<BankImportRunSummary> {
  if (!mailbox.organization_id) {
    throw new Error(`Mailbox ${mailbox.email_address} is missing organization_id`);
  }

  const googleAuth = await getGoogleAccessToken(mailbox.email_address);
  const accessToken = googleAuth.accessToken;
  const { propertyMappings, unitMatchHints } = await loadImportLookups(mailbox.organization_id);
  const rootId = await ensureFolderPath(accessToken, [DRIVE_ARCHIVE_ROOT_FOLDER]);
  const driveFiles = await listPdfFilesUnder(accessToken, rootId);

  // Pre-load processed Drive file IDs to skip already-handled files
  const admin = getSupabaseAdmin();
  const { data: processedDriveMessages } = await admin
    .from('bank_import_messages')
    .select('gmail_message_id')
    .eq('mailbox_id', mailbox.id)
    .eq('import_status', 'processed')
    .like('gmail_message_id', 'drive:%');
  const processedDriveIds = new Set(
    (processedDriveMessages ?? []).map((m: { gmail_message_id: string }) => m.gmail_message_id)
  );

  const summary: BankImportRunSummary = {
    mailboxEmail: mailbox.email_address,
    authMode: googleAuth.authMode,
    billingPeriod: options?.billingWindow?.period ?? null,
    billingWindowStart: options?.billingWindow?.startDate ?? null,
    billingWindowEnd: options?.billingWindow?.endDate ?? null,
    messagesScanned: driveFiles.length,
    messagesImported: 0,
    attachmentsProcessed: 0,
    filesStored: 0,
    duplicateFiles: 0,
    entriesCreated: 0,
    paymentReferencesCreated: 0,
    ignoredEntries: 0,
    failedMessages: 0,
    messagesSkipped: 0,
    filesArchivedToDrive: 0,
    importedPeriods: [],
  };

  for (const driveFile of driveFiles) {
    // Fix 2: Skip files archived by our own app — they're already in the DB
    if (driveFile.appProperties?.hambaFileId) {
      summary.messagesSkipped += 1;
      continue;
    }

    // Fix 3: Skip Drive files already fully processed
    if (processedDriveIds.has(`drive:${driveFile.id}`)) {
      summary.messagesSkipped += 1;
      continue;
    }

    summary.attachmentsProcessed += 1;

    try {
      const bytes = await downloadDriveFile(accessToken, driveFile.id);
      const messageRow = await upsertDriveImportMessage({ mailbox, driveFile });
      summary.messagesImported += 1;

      const result = await processImportedAttachment({
        mailbox,
        messageRowId: messageRow.id,
        messageSourceId: driveFile.id,
        sourceFolder: 'drive',
        attachment: {
          fileName: driveFile.name,
          mimeType: driveFile.mimeType || 'application/pdf',
          data: bytes,
          source: 'drive',
          sourceId: driveFile.id,
        },
        organizationId: mailbox.organization_id,
        billingWindow: options?.billingWindow,
        propertyMappings,
        unitMatchHints,
      });

      if (result.duplicate) summary.duplicateFiles += 1;
      if (result.fileStored) summary.filesStored += 1;
      if (result.entryCreated) summary.entriesCreated += 1;
      if (result.paymentReferenceCreated) summary.paymentReferencesCreated += 1;
      if (result.ignored) summary.ignoredEntries += 1;

      await markBankImportMessageStatus(messageRow.id, 'processed');
    } catch (error) {
      summary.failedMessages += 1;
      console.error(
        `Drive import failed for ${driveFile.name}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  await updateMailboxSyncState(mailbox.id);
  return summary;
}

export async function importDriveBankStatements(
  mailbox: BankImportMailboxRow,
  options?: { billingWindow?: BillingWindow }
): Promise<BankImportRunSummary> {
  if (!mailbox.organization_id) {
    throw new Error(`Mailbox ${mailbox.email_address} is missing organization_id`);
  }

  const googleAuth = await getGoogleAccessToken(mailbox.email_address);
  const accessToken = googleAuth.accessToken;
  const { propertyMappings, unitMatchHints } = await loadImportLookups(mailbox.organization_id);
  const bankUploadsRootId =
    DRIVE_BANK_UPLOADS_FOLDER_ID ??
    (await ensureFolderPath(accessToken, [DRIVE_ARCHIVE_ROOT_FOLDER, DRIVE_BANK_UPLOADS_FOLDER]));
  const driveFiles = await listFilesUnder(accessToken, bankUploadsRootId, {
    extensions: ['.pdf', '.csv', '.txt'],
    mimeTypes: ['application/pdf', 'text/csv', 'text/plain', 'application/vnd.ms-excel'],
  });

  const admin = getSupabaseAdmin();
  const { data: processedDriveMessages } = await admin
    .from('bank_import_messages')
    .select('gmail_message_id')
    .eq('mailbox_id', mailbox.id)
    .eq('import_status', 'processed')
    .like('gmail_message_id', 'drive-bank:%');
  const processedDriveIds = new Set(
    (processedDriveMessages ?? []).map((message: { gmail_message_id: string }) => message.gmail_message_id)
  );

  const summary: BankImportRunSummary = {
    mailboxEmail: mailbox.email_address,
    authMode: googleAuth.authMode,
    billingPeriod: options?.billingWindow?.period ?? null,
    billingWindowStart: options?.billingWindow?.startDate ?? null,
    billingWindowEnd: options?.billingWindow?.endDate ?? null,
    messagesScanned: driveFiles.length,
    messagesImported: 0,
    attachmentsProcessed: 0,
    filesStored: 0,
    duplicateFiles: 0,
    entriesCreated: 0,
    paymentReferencesCreated: 0,
    ignoredEntries: 0,
    failedMessages: 0,
    messagesSkipped: 0,
    filesArchivedToDrive: 0,
    importedPeriods: [],
  };
  const importedPeriods = new Set<string>();

  for (const driveFile of driveFiles) {
    if (driveFile.appProperties?.hambaFileId || processedDriveIds.has(`drive-bank:${driveFile.id}`)) {
      summary.messagesSkipped += 1;
      continue;
    }
    if (!isBankStatementFile(driveFile.name, driveFile.mimeType)) {
      summary.ignoredEntries += 1;
      continue;
    }

    summary.attachmentsProcessed += 1;
    try {
      const bytes = await downloadDriveFile(accessToken, driveFile.id);
      const messageRow = await upsertDriveBankImportMessage({ mailbox, driveFile });
      summary.messagesImported += 1;
      const result = await processBankStatementAttachment({
        mailbox,
        messageRowId: messageRow.id,
        messageSourceId: driveFile.id,
        sourceFolder: 'bank',
        attachment: {
          fileName: driveFile.name,
          mimeType: driveFile.mimeType || 'application/octet-stream',
          data: bytes,
          source: 'bank',
          sourceId: driveFile.id,
        },
        organizationId: mailbox.organization_id,
        billingWindow: options?.billingWindow,
        propertyMappings,
        unitMatchHints,
      });

      if (result.duplicate) summary.duplicateFiles += 1;
      if (result.fileStored) summary.filesStored += 1;
      summary.entriesCreated += result.entriesCreated;
      summary.paymentReferencesCreated += result.paymentReferencesCreated;
      summary.ignoredEntries += result.ignoredEntries;
      for (const period of result.importedPeriods) importedPeriods.add(period);

      if (!result.duplicate && result.rowsParsed > 0) {
        const uploadedAt = getDriveUploadTimestampParts(new Date());
        const versionFolderId = await ensureFolderPath(
          accessToken,
          [uploadedAt.date, uploadedAt.time],
          bankUploadsRootId
        );
        await uploadDriveFile({
          accessToken,
          parentId: versionFolderId,
          name: driveFile.name,
          mimeType: driveFile.mimeType || 'application/octet-stream',
          data: bytes,
          appProperties: {
            hambaFileId: result.fileId,
            hambaSourceDriveFileId: driveFile.id,
          },
        });
        summary.filesArchivedToDrive += 1;
      }

      await markBankImportMessageStatus(messageRow.id, result.rowsParsed > 0 ? 'processed' : 'ignored');
    } catch (error) {
      summary.failedMessages += 1;
      console.error(
        `Drive bank statement import failed for ${driveFile.name}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  summary.importedPeriods = Array.from(importedPeriods).sort();
  await updateMailboxSyncState(mailbox.id);
  return summary;
}

function getDriveUploadTimestampParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '00';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}-${part('minute')}-${part('second')}`,
  };
}

function sanitizeDriveFolderName(value: string) {
  const cleaned = value.replace(/[\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || 'Uncategorized';
}

async function downloadStoredFile(storagePath: string): Promise<Buffer | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.storage.from('uploads').download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export type DriveArchiveSummary = {
  filesArchived: number;
  filesSkipped: number;
  foldersTouched: string[];
};

// Mirror every stored bank-import PDF that is not yet on Drive into
// `Hamba Trading Bank Files / <billing-period> / <building>`. Each file is
// re-parsed for its own transaction date + account (the entry↔file link is
// lossy), so foldering is robust. Idempotent: a file with drive_file_id set is
// skipped, so re-running never re-uploads.
export async function archiveStoredFilesToDrive(options?: {
  mailboxEmail?: string;
}): Promise<DriveArchiveSummary> {
  const mailboxes = await listActiveBankImportMailboxes();
  const mailbox =
    mailboxes.find((m) =>
      options?.mailboxEmail ? m.email_address.toLowerCase() === options.mailboxEmail.toLowerCase() : true
    ) ?? mailboxes[0];
  if (!mailbox?.organization_id) {
    return { filesArchived: 0, filesSkipped: 0, foldersTouched: [] };
  }

  const { accessToken } = await getGoogleAccessToken(mailbox.email_address);
  const { propertyMappings } = await loadImportLookups(mailbox.organization_id);
  const suffixToBuilding = new Map<string, string>();
  for (const mapping of propertyMappings) {
    suffixToBuilding.set(mapping.account_number_suffix, mapping.property_name);
  }

  const admin = getSupabaseAdmin();
  const { data: files, error } = await admin
    .from('bank_import_files')
    .select('id,file_name,mime_type,storage_path,parser_status,raw_metadata')
    .is('drive_file_id', null);
  if (error) throw new Error(`Failed to load files for Drive archive: ${error.message}`);

  await ensureFolderPath(accessToken, [DRIVE_ARCHIVE_ROOT_FOLDER]);
  const folderCache = new Map<string, string>();
  const foldersTouched = new Set<string>();
  let filesArchived = 0;
  let filesSkipped = 0;

  for (const file of (files ?? []) as Array<{
    id: string;
    file_name: string;
    mime_type: string;
    storage_path: string;
    parser_status: string | null;
    raw_metadata?: { source?: string; exclusionReason?: string } | null;
  }>) {
    try {
      if (file.raw_metadata?.exclusionReason === 'internal_non_rent_account') {
        filesSkipped += 1;
        continue;
      }
      if (file.raw_metadata?.source === 'manual' || file.raw_metadata?.source === 'bank') {
        filesSkipped += 1;
        continue;
      }
      const bytes = await downloadStoredFile(file.storage_path);
      if (!bytes) {
        filesSkipped += 1;
        continue;
      }

      let period = 'Uncategorized';
      let building = 'Uncategorized';
      const isUnsupported = file.parser_status === 'unsupported' || file.parser_status === 'failed';
      const isPdf =
        file.mime_type === 'application/pdf' || file.file_name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        try {
          const extractedText = await extractPdfText(bytes);
          const parsed = parseCapitecTransactionText(extractedText);
          if (parsed && isExcludedBankAccount(parsed)) {
            filesSkipped += 1;
            continue;
          }
          if (parsed?.transactionDate) period = getBillingPeriodForDate(parsed.transactionDate);
          if (isUnsupported) {
            // Unsupported/failed files go to a dedicated folder for human review.
            // We still try to extract a date for period grouping, but the building
            // is always "Unsupported" so they're easy to find.
            building = 'Unsupported';
            // If the parser couldn't get a date, try a raw date extraction as fallback
            if (period === 'Uncategorized' && !parsed?.transactionDate) {
              const rawDate = extractedText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
              if (rawDate) {
                const { transactionDate } = parseSouthAfricanDateTime(`${rawDate[0]} 00:00:00`);
                if (transactionDate) period = getBillingPeriodForDate(transactionDate);
              }
            }
          } else if (parsed?.destinationAccountSuffix) {
            building = sanitizeDriveFolderName(
              suffixToBuilding.get(parsed.destinationAccountSuffix) ?? 'Uncategorized'
            );
          }
        } catch {
          // unparseable -> use Unsupported if status says so, otherwise Uncategorized
          if (isUnsupported) building = 'Unsupported';
        }
      } else if (isUnsupported) {
        building = 'Unsupported';
      }

      const folderPath = `${DRIVE_ARCHIVE_ROOT_FOLDER}/${period}/${building}`;
      let folderId = folderCache.get(folderPath);
      if (!folderId) {
        folderId = await ensureFolderPath(accessToken, [DRIVE_ARCHIVE_ROOT_FOLDER, period, building]);
        folderCache.set(folderPath, folderId);
      }
      foldersTouched.add(`${period}/${building}`);

      const driveFileId = await uploadDriveFile({
        accessToken,
        parentId: folderId,
        name: file.file_name,
        mimeType: file.mime_type || 'application/pdf',
        data: bytes,
        appProperties: { hambaFileId: file.id },
      });

      await admin
        .from('bank_import_files')
        .update({
          drive_file_id: driveFileId,
          drive_folder_path: folderPath,
          drive_archived_at: new Date().toISOString(),
        })
        .eq('id', file.id);
      filesArchived += 1;
    } catch (archiveError) {
      filesSkipped += 1;
      console.error(
        `Drive archive failed for file ${file.id}:`,
        archiveError instanceof Error ? archiveError.message : archiveError
      );
    }
  }

  return { filesArchived, filesSkipped, foldersTouched: Array.from(foldersTouched) };
}

function emptyRunSummary(mailboxEmail: string, billingWindow?: BillingWindow): BankImportRunSummary {
  return {
    mailboxEmail,
    authMode: null,
    billingPeriod: billingWindow?.period ?? null,
    billingWindowStart: billingWindow?.startDate ?? null,
    billingWindowEnd: billingWindow?.endDate ?? null,
    messagesScanned: 0,
    messagesImported: 0,
    attachmentsProcessed: 0,
    filesStored: 0,
    duplicateFiles: 0,
    entriesCreated: 0,
    paymentReferencesCreated: 0,
    ignoredEntries: 0,
    failedMessages: 0,
    messagesSkipped: 0,
    filesArchivedToDrive: 0,
    importedPeriods: [],
  };
}

export async function runBankImport(input?: {
  mailboxEmail?: string;
  mailboxId?: string;
  maxMessages?: number;
  billingPeriod?: string;
  pullAll?: boolean;
  source?: BankImportSource;
}) {
  const source = input?.source ?? 'both';
  const billingWindow =
    input?.billingPeriod && !input.pullAll ? getBillingWindowForPeriod(input.billingPeriod) : undefined;
  const mailboxes = await listActiveBankImportMailboxes();
  const targetMailboxes = mailboxes.filter((mailbox) => {
    if (input?.mailboxId) return mailbox.id === input.mailboxId;
    if (input?.mailboxEmail) return mailbox.email_address.toLowerCase() === input.mailboxEmail.toLowerCase();
    return true;
  });

  if (targetMailboxes.length === 0) {
    throw new Error('No active bank import mailboxes matched the request');
  }

  const results: BankImportRunSummary[] = [];
  if (source === 'gmail' || source === 'both') {
    for (const mailbox of targetMailboxes) {
      results.push(await importMailboxPayments(mailbox, { maxMessages: input?.maxMessages, billingWindow }));
    }
  }

  // Drive can import archived PDFs back into the canonical bank-import pipeline,
  // then mirror any newly stored files into the same folder tree.
  if (source === 'drive' || source === 'both') {
    for (const mailbox of targetMailboxes) {
      results.push(await importDrivePayments(mailbox, { billingWindow }));
    }

    const archive = await archiveStoredFilesToDrive({ mailboxEmail: input?.mailboxEmail });
    if (results.length === 0) {
      const summary = emptyRunSummary(targetMailboxes[0].email_address, billingWindow);
      summary.filesArchivedToDrive = archive.filesArchived;
      results.push(summary);
    } else {
      for (const result of results) {
        result.filesArchivedToDrive += archive.filesArchived;
      }
    }
  }

  if (source === 'bank') {
    for (const mailbox of targetMailboxes) {
      results.push(await importDriveBankStatements(mailbox, { billingWindow }));
    }
  }

  return results;
}
