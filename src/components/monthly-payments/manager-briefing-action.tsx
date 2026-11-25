'use client';

import { useCallback, useEffect, useState } from 'react';

const messages: Record<string, string> = {
  sent: 'Briefing accepted by WhatsApp. Delivery confirmation is tracked separately.',
  already_claimed: 'A briefing was already attempted for this building today. Check its delivery status.',
  unchanged: 'The briefing is unchanged since the previous send.',
  delivery_needs_review: 'Delivery needs review. Do not send again until the previous attempt is checked.',
  import_not_ready: 'Run a successful current-month Gmail + Drive import before sending.',
  period_not_refreshed: 'Refresh the current billing month before sending.',
  balances_incomplete: 'Complete the saved charges and due dates before sending.',
  property_not_authorized: 'This building is not available for the configured manager.',
  disabled: 'Management delivery is not configured.',
  transport_unconfigured: 'The management sender is not configured.',
  template_too_long: 'This briefing needs review before it can be sent.',
  provider_cooldown: 'WhatsApp blocked the previous delivery. Wait for the next scheduled date; do not retry now.',
};

export function ManagerBriefingAction({ propertyId, propertyName, period, recipientSuffix }: {
  propertyId: string; propertyName: string; period: string; recipientSuffix: string;
}) {
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState('');
  const [delivery, setDelivery] = useState('');
  const [schedule, setSchedule] = useState('');
  const checkStatus = useCallback((signal?: AbortSignal) => {
    return fetch(`/api/monthly-payments/management-briefing?propertyId=${encodeURIComponent(propertyId)}`, { signal })
      .then(response => { if (!response.ok) throw new Error('status unavailable'); return response.json(); })
      .then(result => {
      if (signal?.aborted) return;
      const property = result.data?.properties?.[0];
      if (!property) { setDelivery('No delivery record is available.'); return; }
      if (property.attemptedToday || property.state === 'delivery_needs_review') setAttempted(true);
      setSchedule(property.scheduled ? `Automatic briefings: 1st and 7th each month, after the clean daily import and matching. Import starts 07:00–08:00 SAST. Next scheduled date: ${property.nextScheduledDate ?? result.data.nextScheduledDate}.` : 'This building is not subscribed to automatic briefings.');
      const labels: Record<string, string> = { not_sent: 'No briefing submitted yet', accepted: 'Accepted by WhatsApp; delivery not confirmed', sent: 'Sent by WhatsApp; delivery not confirmed', delivered: 'Delivered by WhatsApp', read: 'Read on WhatsApp', failed: 'Not delivered by WhatsApp', delivery_needs_review: 'Delivery outcome needs review' };
      const when = property.occurredAt ? ` · ${new Date(property.occurredAt).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST` : '';
      setDelivery(`${labels[property.state] ?? 'Delivery needs review'}${when}${property.errorCode ? ` · Error ${property.errorCode}` : ''}${property.errorCode === 131049 ? '. Meta limits this delivery. No automatic retry; next attempt is on a scheduled date.' : ''}`);
    }).catch(() => { if (!signal?.aborted) setDelivery('Delivery status could not be verified. Do not resend based on this status.'); });
  }, [propertyId]);
  useEffect(() => {
    const controller = new AbortController();
    void checkStatus(controller.signal);
    return () => controller.abort();
  }, [checkStatus]);
  async function send() {
    setAttempted(true); setStatus('Sending briefing…');
    try {
      const response = await fetch('/api/monthly-payments/management-briefing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId, period }),
      });
      const result = await response.json() as { data?: { state: string }; error?: string };
      setStatus(result.data ? messages[result.data.state] ?? 'Briefing needs operator review.' : result.error ?? 'Delivery needs review before another attempt.');
    } catch { setStatus('Delivery outcome needs review. Do not send again until checked.'); }
  }
  return <section aria-label="Connected management briefing" className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <p className="font-semibold">{propertyName} · {period} · manager ending {recipientSuffix}</p>
    <p className="mt-1 text-slate-600">{schedule || 'Checking the automatic briefing schedule…'}</p>
    <p className="mt-1 text-slate-600">A one-off briefing uses current saved balances and pending receipts. It does not change the schedule.</p>
    <button type="button" disabled={attempted} onClick={send} className="mt-3 min-h-11 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Send manager briefing</button>
    {status && <p role="status" className="mt-3 text-slate-700">{status}</p>}
    {delivery && <p role="status" className="mt-3 text-slate-700">{delivery}</p>}
    <button type="button" onClick={() => { void checkStatus(); }} className="mt-2 min-h-11 rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-sky-700">Check delivery status</button>
  </section>;
}
