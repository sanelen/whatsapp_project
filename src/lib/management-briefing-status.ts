export type BriefingReceipt = { occurred_at: string; payload: { status?: { status?: string; recipient_id?: string; errors?: Array<{ code?: number }> }; metadata?: { phone_number_id?: string } } };
export type BriefingAttempt = { id: string; status: string; provider_message_id: string | null; content_hash: string | null; created_at: string };

/** The ledger records submission; only signed provider webhooks prove delivery. */
export function managementBriefingOutcome(attempt: BriefingAttempt | null, receipts: BriefingReceipt[], recipient: string, sender: string) {
  if (!attempt) return { state: 'not_sent', occurredAt: null, errorCode: null };
  const rank: Record<string, number> = { sent: 1, failed: 2, delivered: 3, read: 4 };
  const receipt = receipts.filter(event => event.payload.status?.recipient_id === recipient && event.payload.metadata?.phone_number_id === sender && rank[event.payload.status?.status ?? ''])
    .sort((a, b) => rank[b.payload.status!.status!] - rank[a.payload.status!.status!] || Date.parse(b.occurred_at) - Date.parse(a.occurred_at))[0];
  if (receipt) return { state: receipt.payload.status!.status!, occurredAt: receipt.occurred_at, errorCode: receipt.payload.status!.errors?.[0]?.code ?? null };
  return { state: attempt.status === 'sent' ? 'accepted' : 'delivery_needs_review', occurredAt: attempt.created_at, errorCode: null };
}

export function managementBriefingClaimDecision(previous: BriefingAttempt | null, key: string, contentHash: string, scheduled: boolean, outcome: ReturnType<typeof managementBriefingOutcome>, now: Date) {
  if (previous?.id === key) return 'already_claimed';
  if (previous?.status === 'claimed' || previous?.status === 'unknown') return 'delivery_needs_review';
  if (outcome.state === 'failed' && outcome.errorCode === 131049 && now.getTime() - Date.parse(outcome.occurredAt ?? '') < 24 * 60 * 60 * 1000) return 'provider_cooldown';
  // A fresh scheduled date is a requested briefing even when the figures match.
  if (!scheduled && previous?.content_hash === contentHash && outcome.state !== 'failed') return 'unchanged';
  return 'claim';
}
