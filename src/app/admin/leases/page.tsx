'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import type { AdminBankAccount } from '@/lib/bank-account-types';
import {
  buildPaymentReference,
  createLeaseDraft,
  formatRand,
  leaseFilename,
  propertyConfigs,
  validateLeaseDraft,
  type LeaseDraft,
  type LeaseTermType,
  type ParkingOption,
  type PropertyId,
} from '@/lib/lease-generator';

const fieldClass =
  'mt-2 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 text-sm text-stone-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100';
const labelClass = 'block text-xs font-bold uppercase tracking-[0.12em] text-stone-600';
const hambaHomeUrl = '/';

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      {children}
      {hint && <span className="mt-1.5 block text-xs font-normal normal-case tracking-normal text-stone-500">{hint}</span>}
    </label>
  );
}

function termSummary(draft: LeaseDraft): string {
  if (draft.termType === 'three-month-then-monthly') return 'INITIAL 3 MONTHS, THEN MONTH-TO-MONTH';
  if (draft.termType === 'month-to-month') return 'MONTH-TO-MONTH';
  return draft.endDate ? `FIXED UNTIL ${draft.endDate}` : 'FIXED TERM';
}

function termClause(draft: LeaseDraft): string {
  if (draft.termType === 'three-month-then-monthly') {
    return 'The lease begins with an initial three-month observation period from the commencement date. After that period it continues month-to-month until ended by proper written notice or lawful cancellation.';
  }
  if (draft.termType === 'month-to-month') {
    return 'The lease continues month-to-month from the commencement date until ended by proper written notice or lawful cancellation.';
  }
  return `The lease is for a fixed term ending on ${draft.endDate || '____________________'}. Any renewal or continuation must be agreed in writing or arise in accordance with applicable law.`;
}

function LeaseClause({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="lease-clause mt-6">
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#173f35]">{number}. {title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-6 text-stone-700">{children}</div>
    </section>
  );
}

export default function LeaseGeneratorPage() {
  const [draft, setDraft] = useState<LeaseDraft>(() => createLeaseDraft('quarry-heights'));
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [bankAccounts, setBankAccounts] = useState<AdminBankAccount[]>([]);
  const [bankLoadError, setBankLoadError] = useState('');
  const deferredDraft = useDeferredValue(draft);
  const property = propertyConfigs[deferredDraft.propertyId];
  const errors = validateLeaseDraft(deferredDraft);
  const reference = buildPaymentReference(deferredDraft);
  const selectedBankAccount = bankAccounts.find((account) => account.id === deferredDraft.bankAccountId);
  const propertyBankAccounts = bankAccounts.filter((account) => account.propertyId === deferredDraft.propertyId);
  const handoffMessage = [
    `Lease draft prepared: ${property.name}, Unit ${deferredDraft.unit || '[unit]'}`,
    `Tenant: ${deferredDraft.tenantName || '[name pending]'}`,
    `Rent: ${formatRand(deferredDraft.rent)} | Deposit: ${formatRand(deferredDraft.deposit)}`,
    `Payment reference: ${buildPaymentReference(deferredDraft) || '[reference pending]'}`,
    ...(selectedBankAccount?.status === 'approved'
      ? [
          `Bank: ${selectedBankAccount.bankName}`,
          `Account name: ${selectedBankAccount.beneficiaryName}`,
          `Account number: ${selectedBankAccount.accountNumber}`,
          `Branch: ${selectedBankAccount.branchCode} | Type: ${selectedBankAccount.accountType}`,
        ]
      : []),
    'Please review the attached draft before it is sent for signature.',
  ].join('\n');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(handoffMessage)}`;

  useEffect(() => {
    let active = true;
    fetch('/api/admin/bank-accounts', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Protected banking metadata could not be loaded.');
        return response.json() as Promise<{ accounts: AdminBankAccount[] }>;
      })
      .then((payload) => {
        if (active) setBankAccounts(payload.accounts);
      })
      .catch((error: unknown) => {
        if (active) setBankLoadError(error instanceof Error ? error.message : 'Banking metadata could not be loaded.');
      });
    return () => { active = false; };
  }, []);

  const update = <K extends keyof LeaseDraft>(field: K, value: LeaseDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const changeProperty = (propertyId: PropertyId) => {
    setDraft((current) => {
      const next = createLeaseDraft(propertyId);
      return {
        ...next,
        tenantName: current.tenantName,
        tenantId: current.tenantId,
        tenantPhone: current.tenantPhone,
        tenantEmail: current.tenantEmail,
        commencementDate: current.commencementDate,
        endDate: current.endDate,
        emergencyName: current.emergencyName,
        emergencyPhone: current.emergencyPhone,
        signLocation: current.signLocation,
        bankAccountId: '',
      };
    });
  };

  const copyHandoff = async () => {
    try {
      await navigator.clipboard.writeText(handoffMessage);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
    window.setTimeout(() => setCopyStatus('idle'), 2500);
  };

  const printLease = () => {
    document.title = leaseFilename(draft);
    window.print();
    window.setTimeout(() => {
      document.title = 'Lease Agreement Generator';
    }, 500);
  };

  return (
    <main className="min-h-screen bg-[#f4f0e7] text-stone-900 print:bg-white">
      <div className="pointer-events-none fixed inset-0 opacity-35 print:hidden" aria-hidden="true">
        <div className="absolute -left-28 top-16 h-80 w-80 rounded-full bg-amber-300/40 blur-3xl" />
        <div className="absolute -right-24 bottom-8 h-96 w-96 rounded-full bg-emerald-800/20 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-[1500px] gap-7 px-4 py-6 lg:grid-cols-[minmax(360px,0.78fr)_minmax(620px,1.22fr)] lg:px-7 lg:py-8">
        <section className="space-y-5 print:hidden">
          <header className="overflow-hidden rounded-[28px] bg-[#173f35] p-6 text-white shadow-xl shadow-emerald-950/10">
            <div className="flex items-center justify-between gap-4">
              <a href={hambaHomeUrl} className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100 hover:text-white">
                &larr; Back to Hamba home
              </a>
              <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-emerald-50">Internal tool</span>
            </div>
            <p className="mt-10 text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Lease desk</p>
            <h1 className="mt-2 max-w-md text-4xl font-black leading-[0.98] tracking-tight sm:text-5xl">
              One clean draft. No copied mistakes.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-emerald-50/80">
              Select the property, complete the tenant fields, review the rules, then print a controlled lease draft to PDF.
            </p>
          </header>

          <div className="rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Property">
                <select
                  className={fieldClass}
                  value={draft.propertyId}
                  onChange={(event) => changeProperty(event.target.value as PropertyId)}
                >
                  {Object.values(propertyConfigs).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - {item.area}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Room / unit">
                <input className={fieldClass} value={draft.unit} onChange={(event) => update('unit', event.target.value)} placeholder="e.g. 6" />
              </Field>
              <Field label="Tenant full name" hint="Required for signature-ready PDF. Leave blank only for an internal working draft.">
                <input className={fieldClass} value={draft.tenantName} onChange={(event) => update('tenantName', event.target.value)} placeholder="Full legal name" />
              </Field>
              <Field label="ID / passport">
                <input className={fieldClass} value={draft.tenantId} onChange={(event) => update('tenantId', event.target.value)} placeholder="Optional at draft stage" />
              </Field>
              <Field label="Contact number">
                <input className={fieldClass} value={draft.tenantPhone} onChange={(event) => update('tenantPhone', event.target.value)} placeholder="e.g. 082 000 0000" />
              </Field>
              <Field label="Email address">
                <input className={fieldClass} type="email" value={draft.tenantEmail} onChange={(event) => update('tenantEmail', event.target.value)} placeholder="Optional at draft stage" />
              </Field>
              <Field label="Number of occupants">
                <input className={fieldClass} type="number" min="1" max="4" value={draft.occupants} onChange={(event) => update('occupants', event.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <p className={labelClass}>Lease term</p>
                <div className="mt-2 grid grid-cols-1 gap-2 rounded-xl bg-stone-100 p-1.5 sm:grid-cols-3">
                  {([
                    ['three-month-then-monthly', '3 months, then monthly'],
                    ['month-to-month', 'Month-to-month'],
                    ['fixed-term', 'Fixed term / expiry'],
                  ] as [LeaseTermType, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update('termType', value)}
                      className={`rounded-lg px-3 py-3 text-sm font-black transition ${
                        draft.termType === value
                          ? 'bg-[#173f35] text-white shadow-sm'
                          : 'bg-transparent text-stone-600 hover:text-emerald-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-stone-500">
                  The source leases use an initial three-month period followed by month-to-month occupation. A fixed term requires an expiry date.
                </p>
              </div>
              <Field label="Commencement date">
                <input className={fieldClass} type="date" value={draft.commencementDate} onChange={(event) => update('commencementDate', event.target.value)} />
              </Field>
              {draft.termType === 'fixed-term' ? (
                <Field label="Lease expiry date">
                  <input className={fieldClass} type="date" value={draft.endDate} onChange={(event) => update('endDate', event.target.value)} />
                </Field>
              ) : draft.termType === 'three-month-then-monthly' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-amber-800">Initial 3 months</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/70">Then continues month-to-month until lawfully ended.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-800">No expiry date</p>
                  <p className="mt-1 text-xs leading-5 text-emerald-900/70">Continues month-to-month until lawfully ended by notice.</p>
                </div>
              )}
              <Field label="Monthly rent" hint={property.pricingNote}>
                <div className="relative">
                  <span className="absolute left-3.5 top-[21px] text-sm font-bold text-stone-500">R</span>
                  <input className={`${fieldClass} pl-8`} type="number" min="0" value={draft.rent} onChange={(event) => update('rent', event.target.value)} />
                </div>
              </Field>
              <Field label="Refundable deposit">
                <div className="relative">
                  <span className="absolute left-3.5 top-[21px] text-sm font-bold text-stone-500">R</span>
                  <input className={`${fieldClass} pl-8`} type="number" min="0" value={draft.deposit} onChange={(event) => update('deposit', event.target.value)} />
                </div>
              </Field>
            </div>
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black">Parking decision</h2>
                <p className="mt-1 text-sm leading-5 text-stone-600">{property.parkingNote}</p>
              </div>
              {property.parkingLocked && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Locked: none</span>}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {([
                ['none', 'Not included'],
                ['pending', 'Still pending'],
                ['allocated', 'Bay allocated'],
              ] as [ParkingOption, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={property.parkingLocked && value !== 'none'}
                  onClick={() => update('parking', value)}
                  className={`rounded-xl border px-3 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                    draft.parking === value ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-emerald-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {draft.parking === 'allocated' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Parking bay">
                  <input className={fieldClass} value={draft.parkingBay} onChange={(event) => update('parkingBay', event.target.value)} placeholder="Bay number or description" />
                </Field>
                <Field label="Monthly parking fee">
                  <input className={fieldClass} type="number" min="0" value={draft.parkingFee} onChange={(event) => update('parkingFee', event.target.value)} placeholder="Enter 0 if free" />
                </Field>
              </div>
            )}
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black">Payment destination</h2>
                <p className="mt-1 text-sm leading-5 text-stone-600">Only an approved account can be inserted into a lease or copied into a handoff.</p>
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800">Protected metadata</span>
            </div>
            <label className={`${labelClass} mt-4`}>
              Property bank account
              <select className={fieldClass} value={draft.bankAccountId} onChange={(event) => update('bankAccountId', event.target.value)}>
                <option value="">Do not include banking details</option>
                {propertyBankAccounts.map((account) => (
                  <option key={account.id} value={account.id} disabled={account.status !== 'approved'}>
                    {account.bankName} - ending {account.accountNumber.slice(-4)} ({account.status === 'approved' ? 'approved' : 'verification required'})
                  </option>
                ))}
              </select>
            </label>
            {bankLoadError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{bankLoadError}</p>}
            {!bankLoadError && propertyBankAccounts.length > 0 && propertyBankAccounts.every((account) => account.status !== 'approved') && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">The recorded account is visible in the metadata portal but remains locked here until its evidence conflict is resolved.</p>
            )}
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Emergency contact / next of kin">
                <input className={fieldClass} value={draft.emergencyName} onChange={(event) => update('emergencyName', event.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Emergency contact number">
                <input className={fieldClass} value={draft.emergencyPhone} onChange={(event) => update('emergencyPhone', event.target.value)} placeholder="e.g. 082 000 0000" />
              </Field>
              <Field label="Place of signature">
                <input className={fieldClass} value={draft.signLocation} onChange={(event) => update('signLocation', event.target.value)} placeholder="e.g. Durban" />
              </Field>
            </div>
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white/90 p-5 shadow-sm">
            <Field label="Special conditions / agreed works" hint="Use this for approved repairs, meter installation or other unit-specific commitments.">
              <textarea className={`${fieldClass} min-h-28 resize-y`} value={draft.specialConditions} onChange={(event) => update('specialConditions', event.target.value)} placeholder="Leave blank when there are no special conditions." />
            </Field>
          </div>

          <div className="rounded-[24px] border border-stone-200 bg-white/95 p-4 shadow-2xl backdrop-blur lg:sticky lg:bottom-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={errors.length > 0}
                onClick={printLease}
                className="rounded-xl bg-[#d88b22] px-5 py-3 text-sm font-black text-stone-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-500"
              >
                Print / save as PDF
              </button>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-[#1f7a5a] px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
              >
                Open WhatsApp
              </a>
              <button type="button" onClick={copyHandoff} className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold text-stone-800 hover:border-emerald-700">
                {copyStatus === 'copied' ? 'Copied to clipboard' : copyStatus === 'failed' ? 'Copy failed - try again' : 'Copy message'}
              </button>
              <span className={`ml-auto rounded-full px-3 py-1.5 text-xs font-black ${errors.length ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
                {errors.length ? `${errors.length} item${errors.length === 1 ? '' : 's'} to fix` : 'Ready to print'}
              </span>
            </div>
            {errors.length > 0 && (
              <ul className="mt-3 grid gap-1 text-xs text-red-700 sm:grid-cols-2">
                {errors.map((error) => <li key={error}>- {error}</li>)}
              </ul>
            )}
            <p className="mt-3 text-xs leading-5 text-stone-600">
              On a phone, Open WhatsApp launches the app with this handoff prefilled. On a computer it opens WhatsApp Web. Save the lease as a PDF first, then attach that PDF in the selected chat.
            </p>
          </div>
        </section>

        <section className="self-start rounded-[28px] bg-white shadow-2xl shadow-stone-900/10 print:rounded-none print:shadow-none" aria-label="Lease preview">
          <article className="lease-document mx-auto min-h-[1120px] max-w-[850px] p-8 sm:p-12 print:min-h-0 print:max-w-none print:p-0">
            <div className="flex items-start justify-between gap-6 border-b-4 border-[#173f35] pb-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b66f14]">Hamba Trading Properties</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-[#173f35]">Residential lease agreement</h2>
                <p className="mt-2 text-sm text-stone-600">Controlled draft for review before signature</p>
              </div>
              <div className="rounded-2xl bg-[#173f35] px-4 py-3 text-right text-white">
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100">Property</p>
                <p className="mt-1 font-black">{property.name}</p>
                <p className="text-xs text-emerald-50/80">Unit {deferredDraft.unit}</p>
              </div>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                ['Tenant', deferredDraft.tenantName],
                ['ID / passport', deferredDraft.tenantId],
                ['Contact', deferredDraft.tenantPhone],
                ['Email', deferredDraft.tenantEmail],
                ['Occupants', deferredDraft.occupants],
                ['Commencement', deferredDraft.commencementDate],
                ['Lease term', termSummary(deferredDraft)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">{label}</p>
                  <p className={`mt-1 min-h-5 text-sm font-bold text-stone-900 ${value ? '' : 'border-b border-stone-400'}`}>{value || '\u00A0'}</p>
                </div>
              ))}
            </div>

            <LeaseClause number={1} title="Parties, purpose and premises">
              <p>
                This agreement is between <strong>Hamba Trading (Property Management Company) (Pty) Ltd</strong>, represented by Sanele Ngcobo (the landlord or management), and <strong className={deferredDraft.tenantName ? '' : 'inline-block min-w-48 border-b border-stone-500'}>{deferredDraft.tenantName || '\u00A0'}</strong> (the tenant).
              </p>
              <p>
                The premises are Unit <strong className={deferredDraft.unit ? '' : 'inline-block min-w-16 border-b border-stone-500'}>{deferredDraft.unit || '\u00A0'}</strong> at <strong>{property.address}</strong>. They are let solely as a studio or en-suite residential unit for the approved occupants recorded in this agreement. Management may be contacted on 081 267 4647 or info.hambatrading@gmail.com.
              </p>
            </LeaseClause>

            <LeaseClause number={2} title="Term">
              <p>{termClause(deferredDraft)}</p>
              <p>The tenant may occupy only from the commencement date after all required upfront amounts and onboarding requirements have been satisfied.</p>
            </LeaseClause>

            <LeaseClause number={3} title="Rent, payment and tenant responsibility">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Monthly rent</p>
                  <p className="mt-1 font-black">{formatRand(deferredDraft.rent)}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Deposit</p>
                  <p className="mt-1 font-black">{formatRand(deferredDraft.deposit)}</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Reference</p>
                  <p className="mt-1 break-all text-sm font-black">{reference}</p>
                </div>
              </div>
              {selectedBankAccount?.status === 'approved' ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-800">Approved payment destination</p>
                  <p className="mt-2 font-bold">{selectedBankAccount.bankName} | {selectedBankAccount.beneficiaryName}</p>
                  <p className="mt-1 font-mono font-black">Account {selectedBankAccount.accountNumber} | Branch {selectedBankAccount.branchCode}</p>
                  <p className="mt-1">{selectedBankAccount.accountType}</p>
                </div>
              ) : (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
                  Banking details are issued separately by management after account verification. No payment should be made to details copied from an older lease.
                </p>
              )}
              <p>Rent and approved charges are payable in advance by electronic transfer no later than the first day of each month, using the exact reference shown above. The tenant must send proof of payment when requested.</p>
              <p>The tenant remains fully responsible for payment even if a relative, employer or other person pays on the tenant&apos;s behalf. A third-party payment does not transfer the tenant&apos;s obligations.</p>
            </LeaseClause>

            <LeaseClause number={4} title="Deposit, inspections and refund">
              <p>The deposit is security and may not be used as the final month&apos;s rent. Before occupation, the parties should complete an incoming condition record. The tenant must report visible defects within seven days and latent or maintenance issues promptly when discovered.</p>
              <p>After the tenant vacates, management may inspect the premises and deduct lawful, reasonable and documented amounts for unpaid rent, missing items, cleaning beyond ordinary use, or damage beyond fair wear and tear. The balance and an accounting must be handled within the time required by applicable law.</p>
            </LeaseClause>

            <LeaseClause number={5} title="Utilities and services">
              <ul className="space-y-1">
                {property.utilities.map((item) => <li key={item}>- {item}</li>)}
              </ul>
              {property.wifi === 'included' ? (
                <p>Complimentary Wi-Fi is provided on a best-effort, fair-use basis and may be affected by supplier outages, maintenance, signal conditions or abuse. It is not a guaranteed business-critical service.</p>
              ) : (
                <p>Wi-Fi is not included unless management confirms it in writing for this unit.</p>
              )}
              <p>The tenant must use water, electricity and shared services reasonably and must not tamper with meters, wiring, routers or building equipment.</p>
            </LeaseClause>

            <LeaseClause number={6} title="Occupancy and permitted use">
              <p>{property.occupancyNote}</p>
              <p>The premises may be used only as the tenant&apos;s residence. No subletting, assignment, overcrowding, business, trading, unlawful activity or paid guest accommodation is allowed without prior written management approval.</p>
              {property.id === 'quarry-heights' && <p>Residents under 12 are not permitted. Any proposed resident aged 12 to 15 requires written management confirmation before occupation.</p>}
              {property.id === '33-essex' && <p>Any arrangement involving child residents or regular child visitors must be disclosed and approved in writing before signature.</p>}
            </LeaseClause>

            <LeaseClause number={7} title="Conduct, guests, noise and gatherings">
              <p>The tenant is responsible for the conduct of all occupants and visitors. Everyone must remain sober, peaceful and respectful, and must not threaten safety, cause a nuisance, interfere with other residents, or engage in unlawful activity.</p>
              <p>No parties, disruptive gatherings, shouting or loud music are permitted. Any proposed external entertainment or larger gathering requires advance written permission stating the date, times and expected number of visitors.</p>
              {property.id === 'quarry-heights' && <p>Visitors must be met at the gate and escorted by the tenant while on the property. Visitors have no parking rights.</p>}
            </LeaseClause>

            <LeaseClause number={8} title="Common areas, laundry and waste">
              <p>Corridors, entrances, kitchens, washing areas, washing lines, basins and other shared spaces must be used at the posted or agreed times and left clean, safe and unobstructed. Personal items may not be stored in common areas.</p>
              <p>Waste must be placed in the allocated bins or collection area. Littering, dumping, vandalism and damage to common facilities are prohibited.</p>
            </LeaseClause>

            <LeaseClause number={9} title="Parking">
              <p>
                {deferredDraft.parking === 'none' && (
                  property.id === 'quarry-heights'
                    ? 'No tenant or guest parking is available at Quarry Heights.'
                    : property.id === '33-essex'
                      ? 'Parking is not included in this lease. Parking at 33 Essex is very limited and may be allocated separately by the landlord on a first-come, first-served basis.'
                      : 'No parking is included in this lease.'
                )}
                {deferredDraft.parking === 'pending' && (
                  property.id === '33-essex'
                    ? 'Parking at 33 Essex is very limited and is allocated by the landlord on a first-come, first-served basis. No bay is included unless it is recorded in this agreement.'
                    : 'Parking is not included. Because availability is limited, it may only be added later by a separate written allocation from management.'
                )}
                {deferredDraft.parking === 'allocated' && `Parking bay ${deferredDraft.parkingBay || '[bay]'} is allocated to this unit at ${formatRand(deferredDraft.parkingFee || '0')} per month. The allocation is personal to the tenant and does not create visitor parking rights.`}
              </p>
              <p>Vehicles and goods are parked or stored at the user&apos;s risk, except to the extent that liability may not lawfully be excluded.</p>
            </LeaseClause>

            <LeaseClause number={10} title="Maintenance, defects and access">
              <p>The tenant must notify management promptly by WhatsApp or another recorded channel of leaks, electrical faults, damage, safety risks or repairs, with photographs and details where possible. Delay that causes additional damage may make the tenant responsible for the additional reasonable cost.</p>
              <p>Management may enter after reasonable written notice, ordinarily 12 to 24 hours, for inspection, maintenance, repairs, compliance checks or viewings. Immediate entry is allowed where reasonably necessary for an emergency or to prevent serious damage.</p>
            </LeaseClause>

            <LeaseClause number={11} title="Damage, alterations, keys and security">
              <p>The tenant may not paint, drill, alter locks, make structural or electrical changes, install fixtures, duplicate controlled keys or interfere with security systems without prior written approval.</p>
              <p>The tenant is liable for reasonable, documented repair, cleaning or replacement costs caused by the tenant, occupants or visitors, excluding fair wear and tear. Arbitrary fines do not apply; any charge must relate to an agreed fee or actual loss and remain subject to applicable law.</p>
            </LeaseClause>

            <LeaseClause number={12} title="Non-payment, breach and lawful remedies">
              <p>Failure to pay rent by the due date, repeated serious rule violations, unlawful use, material misrepresentation, unauthorised occupation or serious damage may constitute a breach.</p>
              <p>Management may give written notice requiring the breach to be remedied within the period required by this agreement and applicable law. If it is not remedied, management may cancel the lease and pursue outstanding amounts and recovery of the premises through lawful process. Nothing permits an unlawful lockout, removal of possessions, disconnection intended to force departure, or eviction without lawful authority.</p>
            </LeaseClause>

            <LeaseClause number={13} title="Notice, termination and vacating">
              <p>Unless a different lawful period applies, the tenant must give at least one full calendar month&apos;s written notice to end a month-to-month lease. Fixed-term cancellation, expiry and renewal remain subject to the agreement and applicable consumer and rental-housing law.</p>
              <p>On departure the tenant must remove belongings, return all keys and access devices, leave the unit reasonably clean, settle amounts due, provide a forwarding address, and participate in the outgoing inspection.</p>
            </LeaseClause>

            <LeaseClause number={14} title="Emergency contact and next of kin">
              <p>
                Emergency contact:{' '}
                <strong className={deferredDraft.emergencyName ? '' : 'inline-block min-w-48 border-b border-stone-500'}>{deferredDraft.emergencyName || '\u00A0'}</strong>, telephone{' '}
                <strong className={deferredDraft.emergencyPhone ? '' : 'inline-block min-w-40 border-b border-stone-500'}>{deferredDraft.emergencyPhone || '\u00A0'}</strong>.
              </p>
              <p>The tenant authorises management to contact this person in a genuine emergency or where the tenant cannot reasonably be reached. The tenant must tell management of an absence longer than three days when this is relevant to safety, access or a known maintenance issue.</p>
            </LeaseClause>

            <LeaseClause number={15} title="Notices, disputes and personal information">
              <p>Routine notices may be delivered to the physical address, phone number, WhatsApp number or email recorded in this agreement, provided the sender keeps reasonable proof. Each party must promptly update changed contact details.</p>
              <p>The parties will first try to resolve disputes in good faith and may use mediation. If unresolved, either party may approach the appropriate Rental Housing Tribunal or court. Tenant information may be used only for tenancy administration, payment, safety, compliance and lawful property management.</p>
            </LeaseClause>

            <LeaseClause number={16} title="Special conditions and complete agreement">
              <p className="min-h-16 whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 p-3">{deferredDraft.specialConditions || 'None recorded.'}</p>
              <p>The property schedule, written special conditions and approved house rules form part of this agreement. A change is valid only when recorded in writing by authorised management, subject to applicable law. If a term is unlawful or unenforceable, the remaining terms continue as far as legally permitted.</p>
            </LeaseClause>

            <section className="mt-6 rounded-xl border border-stone-300 p-4 text-xs leading-5 text-stone-600">
              <strong className="text-stone-900">Review status:</strong> This full operational draft incorporates the current Quarry Heights and 33 Essex source leases plus the verified Westridge schedule. It should receive South African property-law review before adoption as the final master template. Banking details remain separate until the property account is verified.
            </section>

            <section className="lease-signature-block mt-8">
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#173f35]">17. Acceptance and signatures</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">Signed at <strong className={deferredDraft.signLocation ? '' : 'inline-block min-w-32 border-b border-stone-500'}>{deferredDraft.signLocation || '\u00A0'}</strong>. Each signer confirms that they have read, understood and accepted this agreement and received or retained a copy.</p>
              <div className="mt-12 grid gap-x-8 gap-y-12 sm:grid-cols-2">
                <div className="border-t border-stone-500 pt-2 text-xs text-stone-600">Tenant signature, full name and date</div>
                <div className="border-t border-stone-500 pt-2 text-xs text-stone-600">Authorised representative signature and date</div>
                <div className="border-t border-stone-500 pt-2 text-xs text-stone-600">Witness signature, full name and date</div>
                <div className="border-t border-stone-500 pt-2 text-xs text-stone-600">Tenant initials</div>
              </div>
            </section>
          </article>
        </section>
      </div>
    </main>
  );
}
