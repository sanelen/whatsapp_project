import { createHash, createSign } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';

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
  matcher_type: 'reference_contains' | 'reference_equals' | 'payer_name_contains' | 'amount_equals';
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

type ImportedAttachment = {
  fileName: string;
  mimeType: string;
  data: Buffer;
  source: 'gmail' | 'eml';
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
};

export type BillingWindow = {
  period: string;
  startDate: string;
  endDate: string;
  gmailAfterDate: string;
  gmailBeforeDate: string;
};

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

function takeLineValue(text: string, label: string) {
  const regex = new RegExp(`${escapeRegExp(label)}\\s*:\\s*([^\\n\\r]+)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? '';
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

function formatDateOnly(input: Date) {
  return input.toISOString().slice(0, 10);
}

function addUtcDays(input: Date, days: number) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate() + days));
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
    parts.push(`after:${billingWindow.gmailAfterDate.replace(/-/g, '/')}`);
    parts.push(`before:${billingWindow.gmailBeforeDate.replace(/-/g, '/')}`);
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
      attachments.push({
        fileName: filename,
        mimeType: sectionType.split(';')[0].trim() || 'application/octet-stream',
        data: decodeMimeBody(sectionParts.bodyText.trim(), transferEncoding),
        source: 'eml',
        nestedFrom,
      });
    }
  }

  return attachments;
}

async function extractPdfText(buffer: Buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text.trim();
  } finally {
    await parser.destroy();
  }
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
      aud: 'https://oauth2.googleapis.com/token',
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

async function getGoogleAccessToken(userEmail: string) {
  const clientEmail = process.env.GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!clientEmail || !privateKey) {
    throw new Error(
      'Missing Gmail service-account env. Set GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL and GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY.'
    );
  }

  const assertion = signJwtWithServiceAccount({
    clientEmail,
    privateKey,
    subject: userEmail,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
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
  return payload.access_token;
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
    });
  }

  await walk(message.payload);
  return attachments;
}

function resolveImportContext(input: {
  entry: ParsedCapitecEntry;
  organizationId: string;
  propertyMappings: BankImportPropertyMappingRow[];
  unitMatchHints: BankImportUnitMatchHintRow[];
}) {
  const normalizedReference = normalizeReference(input.entry.reference);
  const propertyMapping = input.propertyMappings.find(
    (mapping) =>
      mapping.organization_id === input.organizationId &&
      mapping.is_active &&
      mapping.account_number_suffix === input.entry.destinationAccountSuffix
  );

  const matchingHints = input.unitMatchHints
    .filter((hint) => hint.is_active)
    .filter((hint) => {
      if (propertyMapping?.property_id && hint.property_id && hint.property_id !== propertyMapping.property_id) {
        return false;
      }

      if (hint.matcher_type === 'reference_contains') {
        return normalizedReference.includes(normalizeReference(hint.matcher_value));
      }
      if (hint.matcher_type === 'reference_equals') {
        return normalizedReference === normalizeReference(hint.matcher_value);
      }
      if (hint.matcher_type === 'payer_name_contains') {
        return normalizeReference(input.entry.payerName).includes(normalizeReference(hint.matcher_value));
      }
      if (hint.matcher_type === 'amount_equals') {
        return Number(hint.amount_value ?? NaN) === input.entry.amount;
      }
      return false;
    })
    .sort((left, right) => left.priority - right.priority);

  const context: ResolvedImportContext = {
    propertyId: propertyMapping?.property_id ?? null,
    propertyName: propertyMapping?.property_name ?? '',
    matchedBy: propertyMapping ? `account_suffix:${propertyMapping.account_number_suffix}` : null,
    unitHints: matchingHints.map((hint) => ({
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

  const { data, error } = await admin
    .from('bank_import_files')
    .insert({
      message_id: input.messageId,
      gmail_attachment_id: '',
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

async function upsertBankImportEntry(input: {
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
  entry: ParsedCapitecEntry;
}) {
  const admin = getSupabaseAdmin();
  const receivedAt = input.entry.transactionDate ?? new Date().toISOString().slice(0, 10);
  const { error } = await admin.from('payment_references').upsert(
    {
      organization_id: input.organizationId,
      property_id: input.propertyId,
      reference: input.entry.reference,
      amount: input.entry.amount,
      received_at: receivedAt,
      bank: 'Capitec',
      signed_off: false,
      bank_import_entry_id: input.bankImportEntryId,
    },
    { onConflict: 'bank_import_entry_id' }
  );

  if (error) throw new Error(`Failed to upsert payment reference from import: ${error.message}`);
}

async function markBankImportMessageStatus(messageId: string, status: 'processed' | 'failed', errorMessage = '') {
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
      .select('id,property_id,unit_id,matcher_type,matcher_value,amount_value,priority,is_active')
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

  const accessToken = await getGoogleAccessToken(mailbox.email_address);
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

  const summary: BankImportRunSummary = {
    mailboxEmail: mailbox.email_address,
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
  };

  for (const listedMessage of listResponse.messages ?? []) {
    summary.messagesScanned += 1;

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
        const fileSha256 = sha256(attachment.data);
        const storagePath = [
          'bank-imports',
          mailbox.organization_id,
          mailbox.id,
          message.id,
          fileSha256,
          attachment.fileName.replace(/[^a-zA-Z0-9._-]+/g, '-'),
        ].join('/');

        const { file, duplicate } = await createBankImportFile({
          messageId: messageRow.id,
          attachment,
          fileSha256,
          storagePath,
        });

        if (duplicate) {
          summary.duplicateFiles += 1;
          continue;
        }

        await uploadImportFile(storagePath, attachment.data, attachment.mimeType);
        summary.filesStored += 1;

        const isPdf = attachment.mimeType === 'application/pdf' || attachment.fileName.toLowerCase().endsWith('.pdf');
        if (!isPdf) {
          await markBankImportFile({ fileId: file.id, parserStatus: 'unsupported' });
          continue;
        }

        try {
          const extractedText = await extractPdfText(attachment.data);
          const parsedEntry = parseCapitecTransactionText(extractedText);
          if (!parsedEntry) {
            await markBankImportFile({ fileId: file.id, parserStatus: 'unsupported' });
            continue;
          }
          if (!isEntryInsideBillingWindow(parsedEntry, options?.billingWindow)) {
            summary.ignoredEntries += 1;
            await markBankImportFile({ fileId: file.id, parserStatus: 'parsed' });
            continue;
          }

          const resolved = resolveImportContext({
            entry: parsedEntry,
            organizationId: mailbox.organization_id,
            propertyMappings,
            unitMatchHints,
          });
          const entryId = await upsertBankImportEntry({
            fileId: file.id,
            organizationId: mailbox.organization_id,
            entry: parsedEntry,
            resolved,
          });
          summary.entriesCreated += 1;

          if (isIncomingFunds(parsedEntry)) {
            await upsertPaymentReferenceFromImport({
              organizationId: mailbox.organization_id,
              propertyId: resolved.propertyId,
              bankImportEntryId: entryId,
              entry: parsedEntry,
            });
            summary.paymentReferencesCreated += 1;
          } else {
            summary.ignoredEntries += 1;
          }

          await markBankImportFile({ fileId: file.id, parserStatus: 'parsed' });
        } catch (error) {
          await markBankImportFile({
            fileId: file.id,
            parserStatus: 'failed',
            parserError: error instanceof Error ? error.message : 'Failed to parse attachment',
          });
          throw error;
        }
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

export async function runBankImport(input?: {
  mailboxEmail?: string;
  mailboxId?: string;
  maxMessages?: number;
  billingPeriod?: string;
  pullAll?: boolean;
}) {
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
  for (const mailbox of targetMailboxes) {
    results.push(await importMailboxPayments(mailbox, { maxMessages: input?.maxMessages, billingWindow }));
  }
  return results;
}
