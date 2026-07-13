import { getBillingWindowForPeriod } from './bank-import';
import { getSupabaseAdmin } from './supabase';

export type ImportAuditSource = 'gmail' | 'drive-bank' | 'drive' | 'unknown';

export type ImportAuditTransaction = {
  id: string;
  transactionDate: string;
  reference: string;
  amount: number;
  accountSuffix: string | null;
  propertyName: string | null;
  databaseStatus: 'stored' | 'missing';
  matchStatus: 'signed-off' | 'matched' | 'unmatched' | 'incomplete';
  unitLabel: string | null;
};

export type ImportAuditFile = {
  id: string;
  fileName: string;
  mimeType: string;
  source: ImportAuditSource;
  sourceLabel: string;
  sourceUrl: string | null;
  importedAt: string;
  receivedAt: string | null;
  parserStatus: string;
  importStatus: string;
  driveStatus: 'in-drive' | 'archived' | 'not-archived';
  driveFolderPath: string | null;
  hashShort: string;
  transactions: ImportAuditTransaction[];
};

export type ImportAuditView = {
  periodKey: string;
  periodLabel: string;
  billingWindowLabel: string;
  sourceFilter: 'all' | ImportAuditSource;
  files: ImportAuditFile[];
  totals: {
    files: number;
    parsedFiles: number;
    transactions: number;
    amount: number;
    stored: number;
    matched: number;
    signedOff: number;
    unmatched: number;
    incomplete: number;
  };
};

function monthKey(value: Date) {
  return value.toISOString().slice(0, 7);
}

function resolvePeriod(periodKey?: string) {
  return /^\d{4}-\d{2}$/.test(periodKey ?? '') ? (periodKey as string) : monthKey(new Date());
}

function formatPeriodLabel(periodKey: string) {
  return new Intl.DateTimeFormat('en-ZA', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${periodKey}-01T00:00:00Z`)
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${value.slice(0, 10)}T00:00:00Z`)
  );
}

function toMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function readRawSource(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const source = (value as Record<string, unknown>).source;
  return typeof source === 'string' ? source : '';
}

function classifySource(fileRaw: unknown, messageRaw: unknown): ImportAuditSource {
  const fileSource = readRawSource(fileRaw);
  const messageSource = readRawSource(messageRaw);
  if (fileSource === 'gmail') return 'gmail';
  if (fileSource === 'bank' || messageSource === 'drive-bank') return 'drive-bank';
  if (fileSource === 'drive') return 'drive';
  return 'unknown';
}

function sourceLabel(source: ImportAuditSource) {
  if (source === 'gmail') return 'Gmail PDF';
  if (source === 'drive-bank') return 'Drive bank upload';
  if (source === 'drive') return 'Google Drive';
  return 'Unknown source';
}

function sourceDriveFileId(messageRaw: unknown) {
  if (!messageRaw || typeof messageRaw !== 'object') return null;
  const id = (messageRaw as Record<string, unknown>).driveFileId;
  return typeof id === 'string' && id ? id : null;
}

export async function readImportAuditView(input?: {
  periodKey?: string;
  source?: string;
}): Promise<ImportAuditView> {
  const admin = getSupabaseAdmin();
  const periodKey = resolvePeriod(input?.periodKey);
  const billingWindow = getBillingWindowForPeriod(periodKey);
  const validSources = new Set(['all', 'gmail', 'drive-bank', 'drive', 'unknown']);
  const sourceFilter = validSources.has(input?.source ?? '')
    ? (input?.source as ImportAuditView['sourceFilter'])
    : 'all';
  const monthEnd = new Date(`${periodKey}-01T00:00:00Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const [entriesResult, filesResult] = await Promise.all([
    admin
      .from('bank_import_entries')
      .select('id,file_id,transaction_date,reference,amount,destination_account_suffix,property_id')
      .gte('transaction_date', billingWindow.startDate)
      .lte('transaction_date', billingWindow.endDate)
      .order('transaction_date', { ascending: false }),
    admin
      .from('bank_import_files')
      .select('id,message_id,file_name,mime_type,file_sha256,parser_status,drive_file_id,drive_folder_path,drive_archived_at,raw_metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(300),
  ]);
  if (entriesResult.error) throw new Error(`Failed to load import audit entries: ${entriesResult.error.message}`);
  if (filesResult.error) throw new Error(`Failed to load import audit files: ${filesResult.error.message}`);

  const entries = entriesResult.data ?? [];
  const entryFileIds = new Set(entries.map((entry) => entry.file_id as string));
  const files = (filesResult.data ?? []).filter((file) => {
    const metadata = file.raw_metadata as Record<string, unknown> | null;
    if (metadata?.exclusionReason === 'internal_non_rent_account') return false;
    return entryFileIds.has(file.id as string) || ((file.created_at as string) >= `${periodKey}-01` && (file.created_at as string) < monthEnd.toISOString());
  });
  const messageIds = files.map((file) => file.message_id as string).filter(Boolean);
  const entryIds = entries.map((entry) => entry.id as string);
  const propertyIds = Array.from(new Set(entries.map((entry) => entry.property_id as string | null).filter(Boolean))) as string[];

  const [messagesResult, referencesResult, propertiesResult] = await Promise.all([
    messageIds.length
      ? admin
          .from('bank_import_messages')
          .select('id,gmail_message_id,subject,received_at,import_status,processed_at,raw_metadata')
          .in('id', messageIds)
      : Promise.resolve({ data: [], error: null }),
    entryIds.length
      ? admin
          .from('payment_references')
          .select('id,bank_import_entry_id,unit_id,unit_payment_period_id,signed_off')
          .in('bank_import_entry_id', entryIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? admin.from('properties').select('id,name').in('id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (messagesResult.error) throw new Error(`Failed to load import audit messages: ${messagesResult.error.message}`);
  if (referencesResult.error) throw new Error(`Failed to load import audit references: ${referencesResult.error.message}`);
  if (propertiesResult.error) throw new Error(`Failed to load import audit properties: ${propertiesResult.error.message}`);

  const unitIds = Array.from(
    new Set((referencesResult.data ?? []).map((reference) => reference.unit_id as string | null).filter(Boolean))
  ) as string[];
  const unitsResult = unitIds.length
    ? await admin.from('property_units').select('id,label').in('id', unitIds)
    : { data: [], error: null };
  if (unitsResult.error) throw new Error(`Failed to load import audit units: ${unitsResult.error.message}`);

  const messagesById = new Map((messagesResult.data ?? []).map((message) => [message.id as string, message]));
  const referenceByEntryId = new Map(
    (referencesResult.data ?? []).map((reference) => [reference.bank_import_entry_id as string, reference])
  );
  const propertyNameById = new Map((propertiesResult.data ?? []).map((property) => [property.id as string, property.name as string]));
  const unitLabelById = new Map((unitsResult.data ?? []).map((unit) => [unit.id as string, unit.label as string]));
  const entriesByFile = new Map<string, typeof entries>();
  for (const entry of entries) {
    const fileEntries = entriesByFile.get(entry.file_id as string) ?? [];
    fileEntries.push(entry);
    entriesByFile.set(entry.file_id as string, fileEntries);
  }

  const auditFiles: ImportAuditFile[] = files.map((file) => {
    const message = messagesById.get(file.message_id as string);
    const source = classifySource(file.raw_metadata, message?.raw_metadata);
    const messageDriveId = sourceDriveFileId(message?.raw_metadata);
    const gmailMessageId = message?.gmail_message_id as string | undefined;
    const sourceUrl = messageDriveId
      ? `https://drive.google.com/open?id=${encodeURIComponent(messageDriveId)}`
      : source === 'gmail' && gmailMessageId
        ? `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(gmailMessageId)}`
        : null;
    const transactions: ImportAuditTransaction[] = (entriesByFile.get(file.id as string) ?? []).map((entry) => {
      const reference = referenceByEntryId.get(entry.id as string);
      const unitId = reference?.unit_id as string | null | undefined;
      const periodId = reference?.unit_payment_period_id as string | null | undefined;
      const matchStatus: ImportAuditTransaction['matchStatus'] = reference?.signed_off
        ? 'signed-off'
        : unitId && periodId
          ? 'matched'
          : unitId || periodId
            ? 'incomplete'
            : 'unmatched';
      return {
        id: entry.id as string,
        transactionDate: entry.transaction_date as string,
        reference: (entry.reference as string) || 'No reference',
        amount: toMoney(entry.amount as number | string),
        accountSuffix: (entry.destination_account_suffix as string) || null,
        propertyName: entry.property_id ? propertyNameById.get(entry.property_id as string) ?? null : null,
        databaseStatus: reference ? 'stored' : 'missing',
        matchStatus,
        unitLabel: unitId ? unitLabelById.get(unitId) ?? null : null,
      };
    });
    return {
      id: file.id as string,
      fileName: file.file_name as string,
      mimeType: file.mime_type as string,
      source,
      sourceLabel: sourceLabel(source),
      sourceUrl,
      importedAt: file.created_at as string,
      receivedAt: (message?.received_at as string | null | undefined) ?? null,
      parserStatus: (file.parser_status as string) || 'pending',
      importStatus: (message?.import_status as string | undefined) ?? 'unknown',
      driveStatus: source === 'drive-bank' ? 'in-drive' : file.drive_file_id ? 'archived' : 'not-archived',
      driveFolderPath: (file.drive_folder_path as string | null) ?? null,
      hashShort: String(file.file_sha256 ?? '').slice(0, 10),
      transactions,
    };
  });

  const filteredFiles = sourceFilter === 'all' ? auditFiles : auditFiles.filter((file) => file.source === sourceFilter);
  const transactions = filteredFiles.flatMap((file) => file.transactions);
  return {
    periodKey,
    periodLabel: formatPeriodLabel(periodKey),
    billingWindowLabel: `${formatDate(billingWindow.startDate)} - ${formatDate(billingWindow.endDate)}`,
    sourceFilter,
    files: filteredFiles,
    totals: {
      files: filteredFiles.length,
      parsedFiles: filteredFiles.filter((file) => file.parserStatus === 'parsed').length,
      transactions: transactions.length,
      amount: transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
      stored: transactions.filter((transaction) => transaction.databaseStatus === 'stored').length,
      matched: transactions.filter((transaction) => transaction.matchStatus === 'matched').length,
      signedOff: transactions.filter((transaction) => transaction.matchStatus === 'signed-off').length,
      unmatched: transactions.filter((transaction) => transaction.matchStatus === 'unmatched').length,
      incomplete: transactions.filter((transaction) => transaction.matchStatus === 'incomplete').length,
    },
  };
}
