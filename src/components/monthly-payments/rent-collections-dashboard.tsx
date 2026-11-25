'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, MessageCircle, ChevronDown } from 'lucide-react';
import type { MonthlyPaymentsDashboardSnapshot } from '@/lib/monthly-payments';
import { buildManagementSummary, managementWhatsAppUrl, rentCurrency, rentToReceive, overdueRentToReceive, sumRentBalances } from '@/lib/rent-collections';
import { MonthlyPaymentsNavigation } from './monthly-payments-navigation';

type RoomFilter = 'all' | 'outstanding' | 'overdue' | 'pending';
type Props = { dashboard: MonthlyPaymentsDashboardSnapshot; initialPeriod?: string; initialBuilding?: string; initialFilter?: string };
const control = 'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700';

export function RentCollectionsDashboard({ dashboard, initialPeriod, initialBuilding, initialFilter }: Props) {
  const currentPeriod = dashboard.recentMonths.find(month => month.isCurrent)?.key ?? '';
  const [period, setPeriod] = useState(dashboard.recentMonths.some(month => month.key === initialPeriod) ? initialPeriod! : currentPeriod);
  const [building, setBuilding] = useState(dashboard.locations.some(location => location.id === initialBuilding) ? initialBuilding! : 'all');
  const [filter, setFilter] = useState<RoomFilter>(['all', 'outstanding', 'overdue', 'pending'].includes(initialFilter ?? '') ? initialFilter as RoomFilter : 'outstanding');
  const [showSummary, setShowSummary] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [summary, setSummary] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const draftHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (showSummary) draftHeading.current?.focus(); }, [showSummary]);
  const [isRefreshing, startRefresh] = useTransition();
  const router = useRouter();
  const month = dashboard.recentMonths.find(month => month.key === period)!;
  const location = month.locations.find(item => item.id === building);
  const rooms = location?.rooms ?? month.rooms;
  const totals = sumRentBalances(rooms);
  const unmatchedCount = location?.unmatchedReferenceCount ?? month.unmatchedReferenceCount;
  const unmatchedAmount = location?.unmatchedCollectedAmount ?? month.rollingTotal.unmatchedCollectedAmount;
  const visibleRooms = rooms.filter(room => filter === 'all' || (filter === 'overdue' ? overdueRentToReceive(room) > 0 : filter === 'pending' ? room.pendingAmount > 0 : rentToReceive(room) > 0))
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.propertyName.localeCompare(b.propertyName) || a.label.localeCompare(b.label, undefined, { numeric: true }));
  const scopedQuery = `period=${encodeURIComponent(period)}${location ? `&property=${encodeURIComponent(location.id)}` : ''}`;
  const reconcileHref = `/monthly-payments/reconcile?${scopedQuery}`;
  const unitsHref = location ? `/monthly-payments/${location.id}?period=${period}` : `/monthly-payments/locations?period=${period}`;
  const whatsappUrl = managementWhatsAppUrl(recipient, summary);
  const heading = location?.name ?? 'All buildings';

  function selectScope(nextPeriod: string, nextBuilding: string, nextFilter: RoomFilter = filter) {
    if (nextFilter !== filter) document.getElementById('room-balances')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setPeriod(nextPeriod); setBuilding(nextBuilding); setFilter(nextFilter); setShowSummary(false);
    const query = new URLSearchParams({ period: nextPeriod, building: nextBuilding, filter: nextFilter });
    window.history.replaceState(null, '', `/monthly-payments/follow-up?${query}`);
  }
  function openSummary() {
    const url = new URL('/monthly-payments/follow-up', window.location.origin);
    url.search = new URLSearchParams({ period, building, filter: 'outstanding' }).toString();
    setSummary(buildManagementSummary({ building: heading, period, rooms, dashboardUrl: url.toString(), asOf: dashboard.asOf, unmatchedAmount, unmatchedCount }));
    setCopyStatus(''); setShowSummary(true);
  }

  return (
    <main className="min-h-screen bg-[#edf5fa] text-slate-900">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <MonthlyPaymentsNavigation active="collections" collectionsHref={`/monthly-payments/follow-up?period=${period}&building=${building}`} operationsHref={unitsHref} referencePoolHref={reconcileHref} importAuditHref={`/monthly-payments/import-audit?period=${period}`} />
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
          <div className="mx-auto max-w-6xl space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-sm font-semibold text-sky-800">{dashboard.organizationLabel} · Payments</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Rent Follow-up</h1><p className="mt-2 text-sm text-slate-600">Choose a building and month to see who still owes rent and what needs checking.</p></div>
              <button className={control + ' inline-flex items-center gap-2'} onClick={() => { setShowSummary(false); startRefresh(() => router.refresh()); }} disabled={isRefreshing}><RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />{isRefreshing ? 'Refreshing…' : 'Refresh balances'}</button>
            </header>

            <section aria-label="Collection scope" className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <label className="text-sm font-semibold">Building<div className="relative mt-2"><select aria-label="Building" className={control + ' w-full appearance-none pr-10'} value={building} onChange={event => selectScope(period, event.target.value)}><option value="all">All buildings</option>{month.locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5" /></div></label>
              <label className="text-sm font-semibold">Billing month<div className="relative mt-2"><select aria-label="Billing month" className={control + ' w-full appearance-none pr-10'} value={period} onChange={event => selectScope(event.target.value, building)}>{dashboard.recentMonths.map(item => <option key={item.key} value={item.key}>{item.label} {item.key.slice(0, 4)}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5" /></div></label>
              <Link className={control + ' text-center'} href={unitsHref}>{location ? 'Open units' : 'View properties'}</Link>
            </section>

            <p className="text-sm text-slate-600">Need fresh payments? <Link href="/monthly-payments" className="font-semibold text-sky-800 underline underline-offset-4">Import on Overview</Link>, then refresh these balances.</p>

            {dashboard.setupState !== 'ready' ? <p role="status" className="rounded-lg bg-white p-5">{dashboard.setupState === 'missing_tables' ? 'Payments data is not available. Complete the payments setup before reviewing balances.' : 'No buildings yet. Add rooms to begin collecting rent.'}</p> : <>
              <section aria-label="Rent totals" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Metric label="Overdue" amount={totals.overdueUnreceivedAmount} detail={`${rooms.filter(room => overdueRentToReceive(room) > 0).length} rooms past their due date · view rooms`} tone="text-red-800" onClick={() => selectScope(period, building, 'overdue')} />
                <Metric label="Still owed" amount={totals.unreceivedAmount} detail={`${rooms.filter(room => rentToReceive(room) > 0).length} rooms · rent still to receive, excluding pending payments`} onClick={() => selectScope(period, building, 'outstanding')} />
                <Link href={reconcileHref} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-sky-700"><Metric label="Payments to review" amount={unmatchedAmount} detail={`${unmatchedCount} unmatched receipts · open Reconcile`} /></Link>
              </section>
              <section aria-label="Monthly rent breakdown" className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm">
                <p>Rent due for the month <strong className="ml-2 text-base tabular-nums">{rentCurrency(totals.expectedAmount)}</strong></p>
                <p>Rent confirmed <strong className="ml-2 text-base tabular-nums text-emerald-800">{rentCurrency(totals.confirmedAmount)}</strong></p>
              </section>
              <p className="text-sm text-slate-600">Rent due for the month = rent confirmed + waiting for confirmation + still owed. Pending payments are not yet confirmed, but are excluded from tenant follow-up. Deposits, other months and excess cash do not reduce another room’s balance. As of {dashboard.asOf} (South Africa).</p>
              {(totals.chargeMissingCount > 0 || totals.unknownDueDateCount > 0) && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{totals.chargeMissingCount > 0 && <p>{totals.chargeMissingCount} rooms have no saved charge for this month. Totals are incomplete; check their units before sending a summary.</p>}{totals.unknownDueDateCount > 0 && <p>{totals.unknownDueDateCount} outstanding rooms have no due date and are excluded from overdue.</p>}</div>}
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm">
                <strong className="text-sky-950">{rentCurrency(totals.pendingAmount)} received, waiting for staff confirmation.</strong>
                <p className="mt-1 text-slate-700">These payments are matched to rooms but have not been signed off. Check them before contacting tenants. <button className="font-semibold text-sky-800 underline underline-offset-4" onClick={() => selectScope(period, building, 'pending')}>View rooms to confirm</button></p>
              </div>
              {totals.excessAmount > 0 && <p className="text-sm text-slate-600">{rentCurrency(totals.excessAmount)} excess on matched rooms needs allocation review in units.</p>}

              <section aria-labelledby="room-balances" className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4 sm:p-5"><div><h2 id="room-balances" className="text-xl font-bold">{heading} · Room balances</h2><p role="status" className="mt-1 text-sm text-slate-600">{visibleRooms.length} of {rooms.length} rooms shown</p></div><button onClick={openSummary} className={control + ' inline-flex items-center gap-2'}><MessageCircle size={18} />Draft management WhatsApp</button></div>
                <div className="flex flex-wrap gap-2 p-4" aria-label="Filter room balances">{(['outstanding', 'overdue', 'pending', 'all'] as RoomFilter[]).map(value => <button key={value} aria-pressed={filter === value} onClick={() => selectScope(period, building, value)} className={(filter === value ? control.replace('bg-white', 'bg-sky-100').replace('border-slate-300', 'border-sky-800') : control)}>{({ outstanding: 'Still owed', overdue: 'Overdue rooms', pending: 'Waiting for confirmation', all: 'All rooms' })[value]}</button>)}</div>
                <div className="hidden grid-cols-[minmax(150px,2fr)_repeat(4,minmax(90px,1fr))_100px] gap-3 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600 xl:grid"><span>Room / building</span><span>Expected</span><span>Confirmed</span><span>Still to receive</span><span>Due date</span><span>Review</span></div>
                {visibleRooms.length === 0 && <p className="p-6 text-sm text-slate-600">No rooms in this view. Choose All rooms to see every balance.</p>}
                {visibleRooms.map(room => <article key={room.unitId} className="grid gap-3 border-t border-slate-100 p-4 xl:grid-cols-[minmax(150px,2fr)_repeat(4,minmax(90px,1fr))_100px] xl:items-center xl:px-5">
                  <div><h3 className="font-bold">{room.label}</h3><p className="text-sm text-slate-600">{room.propertyName}</p>{room.chargeMissing && <p className="text-sm text-amber-800">Charge not recorded</p>}</div>
                  <Amount label="Expected" value={room.expectedAmount} /><Amount label="Confirmed" value={room.confirmedAmount} />
                  <div><Amount label="Still to receive" value={rentToReceive(room)} />{room.pendingAmount > 0 && <p className="mt-1 text-sm text-sky-800">{rentCurrency(room.pendingAmount)} awaiting confirmation{rentToReceive(room) === 0 ? ' · fully received' : ' · verify before follow-up'}</p>}</div>
                  <div className="text-sm"><span className="mr-2 text-slate-600 xl:hidden">Due</span><span>{room.dueDate ?? 'Not set'}</span>{overdueRentToReceive(room) > 0 && <strong className="mt-1 block text-red-800">Overdue</strong>}</div>
                  <Link className={control + ' text-center'} href={`/monthly-payments/${room.propertyId}?period=${period}&unitId=${room.unitId}`}>Review unit</Link>
                </article>)}
              </section>
              {location && <Link className="inline-block text-sm font-semibold text-sky-800 underline underline-offset-4" href={`/monthly-payments/locations/${location.id}?period=${period}`}>Manage {location.name} rooms</Link>}
            </>}

            {showSummary && <section aria-label="Management WhatsApp draft" className="space-y-4 rounded-xl border border-sky-300 bg-white p-5">
              <div className="flex items-center justify-between gap-3"><h2 ref={draftHeading} tabIndex={-1} className="text-xl font-bold">Management WhatsApp draft</h2><button className={control} onClick={() => setShowSummary(false)}>Close draft</button></div>
              <p className="text-sm text-slate-600">Review this summary and the recipient. WhatsApp opens with a draft; you press Send there. Scheduled alerts are configured separately.</p>
              <label className="block text-sm font-semibold">Management WhatsApp number<input aria-label="Management WhatsApp number" type="tel" autoComplete="off" placeholder="International number, e.g. +27…" className={control + ' mt-2 block w-full sm:max-w-sm'} value={recipient} onChange={event => setRecipient(event.target.value)} /></label>
              {recipient && !whatsappUrl && <p role="status" className="text-sm text-red-800">Enter a valid international number including its country code.</p>}
              <div aria-label="WhatsApp message preview" className="max-w-2xl rounded-xl border border-emerald-200 bg-[#e9f5ed] p-5 text-base leading-7 shadow-sm">
                {summary.split('\n').map((line, index) => <p key={index} className={line ? 'break-words [overflow-wrap:anywhere]' : 'h-3'}>{line.split(/(\*[^*]+\*)/g).map((part, partIndex) => part.startsWith('*') && part.endsWith('*') ? <strong key={partIndex}>{part.slice(1, -1)}</strong> : part)}</p>)}
              </div>
              <details><summary className="cursor-pointer text-sm font-semibold text-sky-800">Edit message</summary><label className="mt-3 block text-sm font-semibold">Summary<textarea aria-label="Summary" rows={12} value={summary} onChange={event => setSummary(event.target.value)} className="mt-2 block w-full rounded-lg border border-slate-300 p-3 text-sm leading-6" /></label></details>
              <div className="flex flex-wrap items-center gap-3"><button className={control} onClick={async () => { try { await navigator.clipboard.writeText(summary); setCopyStatus('Summary copied.'); } catch { setCopyStatus('Copy unavailable. Select and copy the summary above.'); } }}>Copy summary</button>{whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={control.replace('bg-white', 'bg-emerald-800').replace('text-slate-800', 'text-white')}>Open WhatsApp draft</a>}<span role="status" className="text-sm">{copyStatus}</span></div>
            </section>}
          </div>
        </div>
      </div>
    </main>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return <p className="text-sm font-semibold tabular-nums"><span className="mr-2 font-normal text-slate-600 xl:hidden">{label}</span>{rentCurrency(value)}</p>;
}
function Metric({ label, amount, detail, tone = 'text-slate-900', onClick }: { label: string; amount: number; detail: string; tone?: string; onClick?: () => void }) {
  const content = <><span className="block text-sm font-semibold text-slate-600">{label}</span><strong className={`mt-2 block text-2xl tabular-nums ${tone}`}>{rentCurrency(amount)}</strong><span className="mt-2 block text-sm text-slate-600">{detail}</span></>;
  const style = 'rounded-xl border border-slate-200 bg-white p-5 text-left';
  return onClick ? <button onClick={onClick} className={style + ' transition hover:border-sky-600 focus-visible:outline-2 focus-visible:outline-sky-700'}>{content}</button> : <div className={style}>{content}</div>;
}
