'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { Download, ExternalLink, Loader2, MailCheck } from 'lucide-react';

type BankImportSource = 'gmail' | 'drive' | 'both';

const SOURCE_OPTIONS: Array<{ value: BankImportSource; label: string }> = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'drive', label: 'Drive' },
  { value: 'both', label: 'Both' },
];

type BankImportControlsProps = {
  defaultPeriod: string;
  periods: Array<{ key: string; label: string; isCurrent: boolean }>;
  selectedPeriod?: string;
  onSelectedPeriodChange?: (period: string) => void;
  onImported?: () => void;
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
    filesArchivedToDrive: number;
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

export function BankImportControls({
  defaultPeriod,
  periods,
  selectedPeriod,
  onSelectedPeriodChange,
  onImported,
}: BankImportControlsProps) {
  const [internalSelectedPeriod, setInternalSelectedPeriod] = useState(defaultPeriod);
  const [pullAll, setPullAll] = useState(false);
  const [source, setSource] = useState<BankImportSource>('both');
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [googleCloudStatus, setGoogleCloudStatus] = useState<GoogleCloudIntegrationResponse | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isConnecting, startConnecting] = useTransition();

  const activePeriod = selectedPeriod ?? internalSelectedPeriod;

  function updateSelectedPeriod(nextPeriod: string) {
    setInternalSelectedPeriod(nextPeriod);
    onSelectedPeriodChange?.(nextPeriod);
  }

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

  function runImport(periodOverride?: string | Event) {
    const resolvedPeriod = typeof periodOverride === 'string' ? periodOverride : undefined;
    setResult(null);
    startTransition(async () => {
      const response = await fetch('/api/monthly-payments/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingPeriod: resolvedPeriod ?? activePeriod,
          pullAll,
          source,
          maxMessages: pullAll ? 100 : 50,
        }),
      });
      const payload = (await response.json()) as ImportResponse;
      setResult(payload);
      // Pull the freshly-written rows from the database into the dashboard.
      if (payload.success) {
        onImported?.();
      }
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
      filesArchivedToDrive: summary.filesArchivedToDrive + mailbox.filesArchivedToDrive,
    }),
    {
      messagesScanned: 0,
      entriesCreated: 0,
      paymentReferencesCreated: 0,
      ignoredEntries: 0,
      duplicateFiles: 0,
      failedMessages: 0,
      filesArchivedToDrive: 0,
    }
  );

  return (
    <section className="mt-3 rounded-[14px] border border-[#e7e3d6] bg-white px-3.5 py-3">
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#a39d8d]">
            Bank import
          </p>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={activePeriod}
                onChange={(event) => updateSelectedPeriod(event.target.value)}
                disabled={pullAll || isPending}
                className="h-8 rounded-[10px] border border-[#e7e3d6] bg-white px-2.5 text-[12px] font-semibold text-[#1c1a17] outline-none disabled:cursor-wait disabled:bg-[#f1efe9]"
              >
                {periodOptions.map((period) => (
                  <option key={period.key} value={period.key}>
                    {period.label}
                  </option>
                ))}
              </select>

              <label className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#e7e3d6] bg-white px-2.5 text-[12px] font-semibold text-[#57534e]">
                <input
                  type="checkbox"
                  checked={pullAll}
                  onChange={(event) => setPullAll(event.target.checked)}
                  disabled={isPending}
                  className="h-3.5 w-3.5 accent-[#0369a1]"
                />
                Pull everything
              </label>

              <div
                role="group"
                aria-label="Import source"
                className="inline-flex h-8 items-center rounded-[10px] border border-[#e7e3d6] bg-white p-0.5"
              >
                {SOURCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSource(option.value)}
                    disabled={isPending}
                    aria-pressed={source === option.value}
                    className={`inline-flex h-7 items-center rounded-[9px] px-3 text-[12px] font-bold transition disabled:cursor-wait ${
                      source === option.value
                        ? 'bg-[#1c1a17] text-white'
                        : 'text-[#57534e] hover:text-[#1c1a17]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => runImport()}
              disabled={isPending}
              className="inline-flex h-8 min-w-[104px] items-center justify-center gap-1.5 self-start rounded-full bg-[#1c1a17] px-3.5 text-[12px] font-bold text-white disabled:cursor-wait disabled:bg-[#78716c] lg:self-auto"
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Import
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-[#a39d8d]">
            {pullAll ? 'All importable months' : `${activePeriod} window: ${formatWindow(activePeriod)}`}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${
            googleCloudStatus?.status?.configured
              ? 'border-[#a7d8c0] bg-[#e8f6ee] text-[#0f7b53]'
              : 'border-[#e7e3d6] bg-white text-[#57534e]'
          }`}
        >
          <MailCheck size={13} />
          {googleCloudStatus?.status?.configured ? 'Google Cloud ready' : 'Google Cloud not configured'}
        </span>
        {!googleCloudStatus?.status?.configured ? (
          <button
            type="button"
            onClick={openGoogleCloudSetup}
            disabled={isConnecting}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#e7e3d6] bg-white px-2.5 text-[11px] font-bold text-[#1c1a17] disabled:cursor-wait disabled:text-[#a39d8d]"
          >
            {isConnecting ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            Google Cloud setup
          </button>
        ) : null}
        {googleCloudStatus?.error ? <p className="text-[11px] text-[#b91c1c]">{googleCloudStatus.error}</p> : null}
      </div>

      {result ? (
        <div
          className={`mt-2 rounded-[10px] border px-3 py-2 text-[11px] ${
            result.success
              ? 'border-[#a7d8c0] bg-[#e8f6ee] text-[#0f7b53]'
              : 'border-[#f3b0b0] bg-[#fbe7e7] text-[#b91c1c]'
          }`}
        >
          {result.success && totals ? (
            <p>
              Imported {totals.paymentReferencesCreated} references from {totals.messagesScanned} messages.
              {totals.ignoredEntries ? ` ${totals.ignoredEntries} entries were ignored.` : ''}
              {totals.duplicateFiles ? ` ${totals.duplicateFiles} duplicate files were skipped.` : ''}
              {totals.filesArchivedToDrive ? ` ${totals.filesArchivedToDrive} files archived to Drive.` : ''}
            </p>
          ) : (
            <p>{result.error ?? 'Import failed'}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
