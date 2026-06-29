'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Download, ExternalLink, Loader2, MailCheck } from 'lucide-react';

type BankImportControlsProps = {
  defaultPeriod: string;
  periods: Array<{ key: string; label: string; isCurrent: boolean }>;
};

type ImportResponse = {
  success: boolean;
  error?: string;
  data?: Array<{
    mailboxEmail: string;
    billingPeriod: string | null;
    billingWindowStart: string | null;
    billingWindowEnd: string | null;
    messagesScanned: number;
    entriesCreated: number;
    paymentReferencesCreated: number;
    ignoredEntries: number;
    duplicateFiles: number;
    failedMessages: number;
  }>;
};

type GoogleCloudIntegrationResponse = {
  success: boolean;
  authorizationUrl?: string;
  error?: string;
  status?: {
    configured: boolean;
    preferredAuthMode: 'oauth_refresh_token' | 'service_account' | null;
    hasOAuthClient: boolean;
    hasOAuthRefreshToken: boolean;
    hasServiceAccount: boolean;
  };
};

function formatWindow(period: string) {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, month - 1, 9));
  const end = new Date(Date.UTC(year, month, 8));
  const formatter = new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

export function BankImportControls({ defaultPeriod, periods }: BankImportControlsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState(defaultPeriod);
  const [pullAll, setPullAll] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [googleCloudStatus, setGoogleCloudStatus] = useState<GoogleCloudIntegrationResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isConnecting, startConnecting] = useTransition();

  const periodOptions = useMemo(() => {
    const seen = new Set<string>();
    const options = periods.filter((period) => {
      if (seen.has(period.key)) return false;
      seen.add(period.key);
      return true;
    });

    if (!seen.has(defaultPeriod)) {
      options.push({ key: defaultPeriod, label: defaultPeriod, isCurrent: true });
    }

    return options;
  }, [defaultPeriod, periods]);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/monthly-payments/import/google-cloud')
      .then((response) => response.json() as Promise<GoogleCloudIntegrationResponse>)
      .then((payload) => {
        if (isMounted) setGoogleCloudStatus(payload);
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setGoogleCloudStatus({
            success: false,
            error: error instanceof Error ? error.message : 'Could not check Google Cloud status',
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function openGoogleCloudSetup() {
    startConnecting(async () => {
      const response = await fetch('/api/monthly-payments/import/google-cloud');
      const payload = (await response.json()) as GoogleCloudIntegrationResponse;
      setGoogleCloudStatus(payload);

      if (payload.authorizationUrl) {
        window.location.assign(payload.authorizationUrl);
      }
    });
  }

  function runImport() {
    setResult(null);
    startTransition(async () => {
      const response = await fetch('/api/monthly-payments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingPeriod: selectedPeriod,
          pullAll,
          maxMessages: pullAll ? 100 : 50,
        }),
      });
      const payload = (await response.json()) as ImportResponse;
      setResult(payload);
    });
  }

  const totals = result?.data?.reduce(
    (summary, mailbox) => ({
      messagesScanned: summary.messagesScanned + mailbox.messagesScanned,
      entriesCreated: summary.entriesCreated + mailbox.entriesCreated,
      paymentReferencesCreated: summary.paymentReferencesCreated + mailbox.paymentReferencesCreated,
      ignoredEntries: summary.ignoredEntries + mailbox.ignoredEntries,
      duplicateFiles: summary.duplicateFiles + mailbox.duplicateFiles,
      failedMessages: summary.failedMessages + mailbox.failedMessages,
    }),
    {
      messagesScanned: 0,
      entriesCreated: 0,
      paymentReferencesCreated: 0,
      ignoredEntries: 0,
      duplicateFiles: 0,
      failedMessages: 0,
    }
  );

  return (
    <section className="mt-6 rounded-[24px] border border-slate-200 bg-[#fcfcfa] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Bank import
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={selectedPeriod}
              onChange={(event) => setSelectedPeriod(event.target.value)}
              disabled={pullAll || isPending}
              className="h-11 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-sky-500"
            >
              {periodOptions.map((period) => (
                <option key={period.key} value={period.key}>
                  {period.label}
                </option>
              ))}
            </select>

            <label className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm">
              <input
                type="checkbox"
                checked={pullAll}
                onChange={(event) => setPullAll(event.target.checked)}
                disabled={isPending}
                className="h-4 w-4 accent-sky-600"
              />
              Pull everything
            </label>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {pullAll ? 'All importable months' : `${selectedPeriod} window: ${formatWindow(selectedPeriod)}`}
          </p>
        </div>

        <button
          type="button"
          onClick={runImport}
          disabled={isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-500"
        >
          {isPending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Import
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
            googleCloudStatus?.status?.configured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-slate-300 bg-white text-slate-600'
          }`}
        >
          <MailCheck size={15} />
          {googleCloudStatus?.status?.configured ? 'Google Cloud ready' : 'Google Cloud not configured'}
        </span>
        {!googleCloudStatus?.status?.configured ? (
          <button
            type="button"
            onClick={openGoogleCloudSetup}
            disabled={isConnecting}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-950 shadow-sm transition hover:border-sky-400 disabled:cursor-wait disabled:text-slate-400"
          >
            {isConnecting ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
            Google Cloud setup
          </button>
        ) : null}
        {googleCloudStatus?.error ? <p className="text-sm text-rose-700">{googleCloudStatus.error}</p> : null}
      </div>

      {result ? (
        <div
          className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
            result.success
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {result.success && totals ? (
            <p>
              Imported {totals.paymentReferencesCreated} references from {totals.messagesScanned} messages.
              {totals.ignoredEntries ? ` ${totals.ignoredEntries} entries were ignored.` : ''}
              {totals.duplicateFiles ? ` ${totals.duplicateFiles} duplicate files were skipped.` : ''}
            </p>
          ) : (
            <p>{result.error ?? 'Import failed'}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
