'use client';

import { useState } from 'react';

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
};

export function ManagerBriefingAction({ propertyId, propertyName, period, recipientSuffix }: {
  propertyId: string; propertyName: string; period: string; recipientSuffix: string;
}) {
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState('');
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
    <p className="mt-1 text-slate-600">Send one briefing using current saved balances and pending receipts. This does not subscribe the building to automatic alerts.</p>
    <button type="button" disabled={attempted} onClick={send} className="mt-3 min-h-11 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">Send manager briefing</button>
    {status && <p role="status" className="mt-3 text-slate-700">{status}</p>}
  </section>;
}
