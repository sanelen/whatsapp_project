import { Check, CircleSlash2, Database, Mail, Settings2 } from 'lucide-react';
import type { ImportConfigurationView } from '@/lib/import-configuration';
import { MonthlyPaymentsShell } from './monthly-payments-shell';

function formatTimestamp(value: string | null) {
  if (!value) return 'Never synced';
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value));
}

function actionStyle(action: 'accept' | 'ignore' | 'review') {
  if (action === 'accept') return 'bg-emerald-50 text-emerald-800';
  if (action === 'ignore') return 'bg-slate-100 text-slate-700';
  return 'bg-amber-50 text-amber-800';
}

export function ImportConfigurationPanel({ view }: { view: ImportConfigurationView }) {
  return (
    <MonthlyPaymentsShell active="import-configuration">
      <div className="space-y-4">
        <section className="rounded-[18px] border border-white/80 bg-white/95 p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-700"><Settings2 size={15} /> Import configuration</div>
          <h2 className="mt-1.5 text-[25px] font-bold text-slate-950">How bank data becomes a payment</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-5 text-slate-600">A read-only reference for connected sources, account meanings, property mappings, and matching rules. Database-backed values are labelled separately from source-controlled parser policy.</p>
        </section>

        <section className="rounded-[14px] border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-slate-950"><Mail size={16} className="text-sky-700" /> Connected sources</h3>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {view.mailboxes.map((mailbox) => (
              <div key={mailbox.id} className="rounded-[10px] border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3"><p className="text-[13px] font-bold text-slate-950">{mailbox.emailAddress}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${mailbox.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{mailbox.active ? 'Active' : 'Inactive'}</span></div>
                <p className="mt-1 text-[11.5px] text-slate-600">{mailbox.provider.toUpperCase()} · subject: {mailbox.subjectFilter} · label: {mailbox.labelFilter}</p>
                <p className="mt-1 text-[10.5px] text-slate-400">Last sync: {formatTimestamp(mailbox.lastSyncedAt)} · source: bank_import_mailboxes</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[14px] border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-slate-950"><Database size={16} className="text-sky-700" /> Account and property map</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[12px]">
              <thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.07em] text-slate-400"><th className="pb-2">Account</th><th className="pb-2">Meaning</th><th className="pb-2">Property</th><th className="pb-2">Status</th><th className="pb-2">Source</th></tr></thead>
              <tbody>{view.accounts.map((account) => (
                <tr key={`${account.source}-${account.suffix}`} className="border-b border-slate-100 align-top last:border-0">
                  <td className="py-2.5 font-bold text-slate-950">•••• {account.suffix}</td>
                  <td className="py-2.5"><p className="font-semibold">{account.propertyName}</p>{account.notes ? <p className="mt-0.5 max-w-xl text-[10.5px] leading-4 text-slate-500">{account.notes}</p> : null}</td>
                  <td className="py-2.5">{account.mappedPropertyName ?? 'Not mapped'}</td>
                  <td className="py-2.5"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${account.state === 'active' ? 'bg-emerald-50 text-emerald-800' : account.state === 'mixed' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{account.state === 'active' ? <Check size={11} /> : <CircleSlash2 size={11} />}{account.state === 'active' ? 'Active mapping' : account.state === 'mixed' ? 'Mixed routing' : 'Excluded'}</span></td>
                  <td className="py-2.5 text-[10.5px] text-slate-500">{account.source === 'database' ? 'bank_import_property_mappings' : account.evidence}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="rounded-[14px] border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-[14px] font-bold text-slate-950"><CircleSlash2 size={16} className="text-sky-700" /> Import acceptance policy</h3>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">{view.policies.map((policy) => (
            <div key={policy.id} className="rounded-[10px] border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3"><p className="text-[12.5px] font-bold text-slate-950">{policy.input}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${actionStyle(policy.action)}`}>{policy.action}</span></div>
              <p className="mt-1 text-[11px] leading-4 text-slate-600">{policy.explanation}</p><p className="mt-1 text-[10px] text-slate-400">Source: src/config/bank-import-metadata.ts</p>
            </div>
          ))}</div>
        </section>

        <details className="group rounded-[14px] border border-slate-200 bg-white p-4">
          <summary className="flex cursor-pointer list-none flex-wrap items-end justify-between gap-2">
            <h3 className="text-[14px] font-bold text-slate-950">Unit matching rules</h3>
            <p className="text-[10.5px] text-slate-400">{view.rules.filter((rule) => rule.active).length} active · expand details · source: bank_import_unit_match_hints</p>
          </summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-[11.5px]"><thead><tr className="border-b border-slate-200 text-[10px] uppercase tracking-[0.07em] text-slate-400"><th className="pb-2">Property / unit</th><th className="pb-2">Account</th><th className="pb-2">Rule</th><th className="pb-2">Value</th><th className="pb-2">Priority</th><th className="pb-2">State</th></tr></thead><tbody>{view.rules.map((rule) => <tr key={rule.id} className="border-b border-slate-100 last:border-0"><td className="py-2">{rule.propertyName ?? 'Any property'}{rule.unitLabel ? ` · ${rule.unitLabel}` : ''}</td><td className="py-2">{rule.accountSuffix ? `•••• ${rule.accountSuffix}` : 'Any mapped account'}</td><td className="py-2 font-semibold">{rule.matcherType.replaceAll('_', ' ')}</td><td className="py-2">{rule.amountValue == null ? rule.matcherValue : `R ${rule.amountValue.toLocaleString('en-ZA')}`}</td><td className="py-2">{rule.priority}</td><td className="py-2">{rule.active ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></div>
        </details>
      </div>
    </MonthlyPaymentsShell>
  );
}
