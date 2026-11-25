import type { BankImportSource } from './bank-import';

export type BankImportRequest = {
  billingPeriod?: string;
  pullAll?: boolean;
  source: BankImportSource;
  mailboxId?: string;
  mailboxEmail?: string;
};

export function parseBankImportRequest(value: unknown): BankImportRequest {
  if (!value || typeof value !== 'object') throw new Error('Import options are required');
  const body = value as Record<string, unknown>;
  const source = body.source ?? 'both';
  if (!['gmail', 'drive', 'bank', 'both'].includes(String(source))) throw new Error('Unsupported import source');
  const period = typeof body.billingPeriod === 'string' ? body.billingPeriod.trim() : undefined;
  if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Invalid billing period');
  if (!period && body.pullAll !== true) throw new Error('Select a billing period or explicitly select Pull everything');
  return { source: source as BankImportSource, billingPeriod: period, pullAll: body.pullAll === true,
    mailboxId: typeof body.mailboxId === 'string' ? body.mailboxId.trim() || undefined : undefined,
    mailboxEmail: typeof body.mailboxEmail === 'string' ? body.mailboxEmail.trim() || undefined : undefined };
}
