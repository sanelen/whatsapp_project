import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, CircleAlert, Database, ExternalLink, FileCheck2 } from 'lucide-react';
import type { ImportAuditFile, ImportAuditTransaction, ImportAuditView } from '@/lib/import-audit';
import { MonthlyPaymentsShell } from './monthly-payments-shell';
import { ReconciliationControl } from './reconciliation-control';

function shiftPeriod(periodKey: string, offset: number) {
  const date = new Date(`${periodKey}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function formatRand(value: number) {
  return value.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

function statusDot(ok: boolean) {
  return ok ? 'bg-emerald-500' : 'bg-rose-500';
}

function matchLabel(transaction: ImportAuditTransaction) {
  if (transaction.matchStatus === 'signed-off') return `Signed off${transaction.unitLabel ? ` · ${transaction.unitLabel}` : ''}`;
  if (transaction.matchStatus === 'matched') return `Matched${transaction.unitLabel ? ` · ${transaction.unitLabel}` : ''}`;
  if (transaction.matchStatus === 'incomplete') return 'Incomplete match';
  return 'Unmatched';
}

function fileSummary(file: ImportAuditFile) {
  const amount = file.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  return `${file.transactions.length} transactions · R ${formatRand(amount)}`;
}

export function ImportAuditViewPanel({ view }: { view: ImportAuditView }) {
  const previous = shiftPeriod(view.periodKey, -1);
  const next = shiftPeriod(view.periodKey, 1);
  const sourceOptions = [
    { key: 'all', label: 'All sources' },
    { key: 'gmail', label: 'Gmail' },
    { key: 'drive-bank', label: 'Drive bank' },
    { key: 'drive', label: 'Drive' },
  ] as const;

  return (
    <MonthlyPaymentsShell
      active="import-audit"
      referencePoolHref={`/monthly-payments/reference-pool?period=${view.periodKey}`}
      importAuditHref={`/monthly-payments/import-audit?period=${view.periodKey}`}
    >
      <section className="rounded-[18px] border border-white/80 bg-white/95 p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700">
              <FileCheck2 size={15} /> Import audit
            </div>
            <h2 className="mt-1.5 text-[25px] font-bold tracking-normal text-slate-950">Source-to-database validation</h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-600">
              Every imported file and transaction for the rent period, with source provenance, database presence, and matching status.
            </p>
          </div>
          <div className="inline-flex h-9 items-center rounded-[10px] border border-slate-200 bg-white">
            <Link href={`/monthly-payments/import-audit?period=${previous}&source=${view.sourceFilter}`} aria-label="Previous period" className="px-3 py-2 text-slate-600">
              <ChevronLeft size={16} />
            </Link>
            <span className="min-w-[130px] border-x border-slate-200 px-3 text-center text-[12.5px] font-bold text-slate-900">{view.periodLabel}</span>
            <Link href={`/monthly-payments/import-audit?period=${next}&source=${view.sourceFilter}`} aria-label="Next period" className="px-3 py-2 text-slate-600">
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>

        <p className="mt-2 text-[11.5px] text-slate-500">Rent window: {view.billingWindowLabel}</p>

        <ReconciliationControl initialRun={view.reconciliation} />

        <div className="mt-4 grid gap-px overflow-hidden rounded-[12px] border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Files', view.totals.files],
            ['Transactions', view.totals.transactions],
            ['Amount received', `R ${formatRand(view.totals.amount)}`],
            ['In database', `${view.totals.stored}/${view.totals.transactions}`],
            ['Matched / signed', `${view.totals.matched + view.totals.signedOff}/${view.totals.transactions}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-white px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</p>
              <p className="mt-1 text-[18px] font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5" role="navigation" aria-label="Import source filter">
          {sourceOptions.map((source) => (
            <Link
              key={source.key}
              href={`/monthly-payments/import-audit?period=${view.periodKey}&source=${source.key}`}
              aria-current={view.sourceFilter === source.key ? 'page' : undefined}
              className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold ${
                view.sourceFilter === source.key ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {source.label}
            </Link>
          ))}
        </div>

        {view.totals.incomplete > 0 ? (
          <div className="mt-4 flex items-center gap-2 rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-800">
            <CircleAlert size={15} /> {view.totals.incomplete} incomplete matches need attention.
          </div>
        ) : null}

        <div className="mt-4 space-y-2.5">
          {view.files.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-slate-300 px-4 py-10 text-center text-[13px] text-slate-500">
              No import files were found for this period and source.
            </div>
          ) : (
            view.files.map((file, index) => (
              <details key={file.id} open={index < 2} className="group overflow-hidden rounded-[12px] border border-slate-200 bg-white">
                <summary className="grid cursor-pointer list-none gap-2 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13px] font-bold text-slate-950">{file.fileName}</span>
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-800">{file.sourceLabel}</span>
                      <span className={`h-2 w-2 rounded-full ${statusDot(file.parserStatus === 'parsed')}`} title={`Parser: ${file.parserStatus}`} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Imported {formatTimestamp(file.importedAt)} · {fileSummary(file)} · hash {file.hashShort}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <span className={`h-2 w-2 rounded-full ${statusDot(file.driveStatus !== 'not-archived')}`} />
                    {file.driveStatus === 'archived' ? 'Archived in Drive' : file.driveStatus === 'in-drive' ? 'Source in Drive' : 'Not archived'}
                  </div>
                </summary>

                <div className="border-t border-slate-200 bg-slate-50/60 px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                    <span>Message: {file.importStatus}</span>
                    <span>Parser: {file.parserStatus}</span>
                    {file.driveFolderPath ? <span className="truncate">Folder: {file.driveFolderPath}</span> : null}
                    {file.sourceUrl ? (
                      <a href={file.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-sky-700">
                        Open source <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>

                  {file.transactions.length === 0 ? (
                    <p className="mt-3 rounded-[9px] border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                      No incoming transactions were extracted from this file for the selected period.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[780px] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-[0.07em] text-slate-400">
                            <th className="pb-2 pr-3">Date</th><th className="pb-2 pr-3">Reference</th><th className="pb-2 pr-3">Amount</th><th className="pb-2 pr-3">Property</th><th className="pb-2 pr-3">Database</th><th className="pb-2">Match</th>
                          </tr>
                        </thead>
                        <tbody>
                          {file.transactions.map((transaction) => (
                            <tr key={transaction.id} className="border-b border-slate-100 text-[12px] text-slate-700 last:border-0">
                              <td className="py-2 pr-3 whitespace-nowrap">{transaction.transactionDate}</td>
                              <td className="py-2 pr-3 font-semibold text-slate-950">{transaction.reference}</td>
                              <td className="py-2 pr-3 whitespace-nowrap">R {formatRand(transaction.amount)}</td>
                              <td className="py-2 pr-3">{transaction.propertyName ?? 'Unassigned'}</td>
                              <td className="py-2 pr-3">
                                <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${statusDot(transaction.databaseStatus === 'stored')}`} />{transaction.databaseStatus === 'stored' ? 'Stored' : 'Missing'}</span>
                              </td>
                              <td className="py-2">
                                <span className={`inline-flex items-center gap-1.5 ${transaction.matchStatus === 'unmatched' ? 'text-amber-700' : transaction.matchStatus === 'incomplete' ? 'text-rose-700' : 'text-emerald-700'}`}>
                                  {transaction.matchStatus === 'matched' || transaction.matchStatus === 'signed-off' ? <Check size={13} /> : <Database size={13} />}
                                  {matchLabel(transaction)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            ))
          )}
        </div>
      </section>
    </MonthlyPaymentsShell>
  );
}
