'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ReconciliationRunView } from '@/lib/bank-import-reconciliation';

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg',
  }).format(new Date(value));
}

export function ReconciliationControl({ initialRun }: { initialRun: ReconciliationRunView | null }) {
  const [run, setRun] = useState(initialRun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function checkNow() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/monthly-payments/import/reconcile', { method: 'POST' });
      const payload = (await response.json()) as { success?: boolean; queued?: boolean; run?: ReconciliationRunView; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Reconciliation failed');
      if (payload.run) {
        setRun(payload.run);
        return;
      }
      if (!payload.queued) throw new Error('Reconciliation did not start');

      const previousRunId = run?.id ?? null;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const statusResponse = await fetch('/api/monthly-payments/import/reconcile?status=true', { cache: 'no-store' });
        const statusPayload = (await statusResponse.json()) as { success?: boolean; data?: ReconciliationRunView; error?: string };
        if (!statusResponse.ok || !statusPayload.success) {
          throw new Error(statusPayload.error || 'Failed to read reconciliation status');
        }
        if (!statusPayload.data || statusPayload.data.id === previousRunId) continue;
        setRun(statusPayload.data);
        if (statusPayload.data.status !== 'running') return;
      }
      throw new Error('Reconciliation is still running. Refresh this page to check its latest status.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reconciliation failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-[12px] border border-sky-200 bg-sky-50/70 p-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-sky-800">
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Three-day reconciliation
          </p>
          {run ? (
            <p className="mt-1 text-[12px] text-slate-700">
              Last run {formatTimestamp(run.startedAt)} · <span className="font-bold">{run.status}</span>
              {run.summary.comparisonReady
                ? ` · ${run.summary.missingFromDestination} source files missing from the destination inbox`
                : ' · second mailbox connection still required for inbox-to-inbox comparison'}
            </p>
          ) : (
            <p className="mt-1 text-[12px] text-slate-700">No reconciliation run has been recorded yet.</p>
          )}
        </div>
        <button type="button" disabled={busy} onClick={checkNow} className="h-9 rounded-[9px] bg-slate-950 px-3.5 text-[11.5px] font-bold text-white disabled:cursor-wait disabled:opacity-60">
          {busy ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {error || run?.errorMessage ? (
        <p className="mt-2 rounded-[8px] border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
          {error || run?.errorMessage}
        </p>
      ) : null}
    </div>
  );
}
