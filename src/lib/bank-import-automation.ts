import { southAfricaDate } from './rent-collections';

export type CurrentCycleImportAudit = {
  period: string;
  sources: string[];
  checkedAt: string;
  failedOrPendingFiles: number;
  entriesMissingPaymentReference: number;
};

export function scheduledImportDue(last: { startedAt: string; status?: string; summary: { currentCycle?: CurrentCycleImportAudit; autoMatch?: { failed: number } } } | null, now = new Date(), period?: string) {
  if (!last) return true;
  // The old Gmail-only reconciliation is not a completed daily source check.
  const audit = last?.summary.currentCycle;
  if (!audit?.sources.includes('drive') || !audit.sources.includes('gmail')) return true;
  if (last?.status && (last.status !== 'completed' || last.summary.autoMatch?.failed !== 0)) return true;
  if (audit.failedOrPendingFiles || audit.entriesMissingPaymentReference || (period && audit.period !== period)) return true;
  if (!Number.isFinite(Date.parse(last.startedAt))) return true;
  return southAfricaDate(new Date(last.startedAt)) < southAfricaDate(now);
}

/** Only proven out-of-window evidence is historical. Unknown dates fail closed. */
export function countCurrentProblemFiles(files: Array<{ bank_import_entries: Array<{ transaction_date: string | null }> }>, window: { startDate: string; endDate: string }) {
  return files.filter(file => !file.bank_import_entries.length || file.bank_import_entries.some(entry =>
    !entry.transaction_date || (entry.transaction_date >= window.startDate && entry.transaction_date <= window.endDate))).length;
}

export function sourceCheckState(run: { status: string; startedAt: string; summary: { currentCycle?: CurrentCycleImportAudit } } | null, now = new Date()) {
  if (!run) return 'not_started';
  if (run.status === 'running') return now.getTime() - Date.parse(run.startedAt) > 2 * 60 * 60 * 1000 ? 'stalled' : 'running';
  if (run.status !== 'completed') return 'needs_review';
  const audit = run.summary.currentCycle;
  if (!audit || !Number.isFinite(Date.parse(audit.checkedAt)) || !audit.sources.includes('gmail') || !audit.sources.includes('drive')) return 'not_verified';
  if (audit.failedOrPendingFiles || audit.entriesMissingPaymentReference) return 'needs_review';
  return now.getTime() - Date.parse(audit.checkedAt) > 36 * 60 * 60 * 1000 ? 'stale' : 'fresh';
}
