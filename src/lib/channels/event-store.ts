import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedChannelEvent } from '@/lib/channels/types';

export function toChannelEventRows(events: NormalizedChannelEvent[]) {
  return events.map((event) => {
    const isActionableInbound = event.direction === 'inbound' && event.eventType === 'message.received';
    return {
      provider: event.provider,
      channel: event.channel,
      event_id: event.eventId,
      event_type: event.eventType,
      direction: event.direction,
      external_connection_id: event.connectionExternalId,
      external_sender_id: event.senderExternalId,
      external_recipient_id: event.recipientExternalId,
      provider_message_id: event.providerMessageId,
      processing_status: isActionableInbound ? 'received' : 'processed',
      processed_at: isActionableInbound ? null : new Date().toISOString(),
      occurred_at: event.occurredAt,
      payload: {
        ...event.raw,
        normalized_message: event.message ?? null,
      },
    };
  });
}

export async function persistChannelEvents(admin: SupabaseClient, events: NormalizedChannelEvent[]) {
  if (events.length === 0) return { inserted: 0 };
  const { error } = await admin
    .from('channel_events')
    .upsert(toChannelEventRows(events), {
      onConflict: 'provider,channel,event_id',
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`Channel event persistence failed: ${error.message}`);
  return { inserted: events.length };
}
