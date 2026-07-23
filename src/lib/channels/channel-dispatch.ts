import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAssistantRuntimeConfig } from '@/lib/assistant/config';
import { generatePropertyAssistantReply, type AssistantMessage, type PropertyAssistantReply } from '@/lib/assistant/property-assistant';
import { advanceNaturalHambaFlow } from '@/lib/channels/hamba-harness';
import { loadHambaCatalog } from '@/lib/channels/hamba-catalog';
import { resumeHambaFlowState, type HambaFlowCatalog, type HambaFlowState } from '@/lib/channels/hamba-flow';
import { persistChannelEvents } from '@/lib/channels/event-store';
import { sendMetaTextMessage } from '@/lib/channels/meta';
import type { NormalizedChannelEvent } from '@/lib/channels/types';

type ConversationStateRow = {
  flow_state: HambaFlowState;
  bot_paused: boolean;
  pilot_enabled: boolean;
};

type PendingConversationEvent = {
  event_id: string;
  occurred_at: string;
  processing_status: 'received' | 'processing';
  updated_at: string;
};

type EnhancedPilotTurn = ReturnType<typeof resolveHambaPilotTurn> & {
  assistant?: PropertyAssistantReply;
};

const STALE_PROCESSING_MS = 15 * 60 * 1000;

function providerMessageId(response: Record<string, unknown>) {
  const messages = Array.isArray(response.messages) ? response.messages : [];
  const first = messages[0];
  return first && typeof first === 'object' && typeof (first as { id?: unknown }).id === 'string'
    ? (first as { id: string }).id
    : '';
}

export function resolveHambaPilotTurn(state: HambaFlowState, message: string, catalog: HambaFlowCatalog, greeting?: string) {
  const result = advanceNaturalHambaFlow(state, message, catalog, { greeting });
  if (result.action?.type !== 'answer_property_question') return result;
  const locations = catalog.locations.map((location) => `• ${location.name}${location.area ? ` — ${location.area}` : ''}`);
  return {
    ...result,
    reply: [
      'I can help with verified property information, but I do not want to guess.',
      locations.length > 0 ? 'Which property are you asking about?' : 'A Hamba staff member needs to confirm that information.',
      ...locations,
      '',
      'You can also type MENU or HUMAN.',
    ].join('\n'),
  };
}

async function updateEventStatus(
  admin: SupabaseClient,
  event: NormalizedChannelEvent,
  status: 'received' | 'processing' | 'processed' | 'ignored' | 'failed',
  errorMessage = ''
) {
  const { error } = await admin
    .from('channel_events')
    .update({
      processing_status: status,
      error_message: errorMessage.slice(0, 500),
      processed_at: ['processed', 'ignored', 'failed'].includes(status) ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('event_id', event.eventId);
  if (error) throw new Error(`Channel event status update failed: ${error.message}`);
}

async function claimEvent(admin: SupabaseClient, event: NormalizedChannelEvent) {
  const claimedAt = new Date().toISOString();
  const { data, error } = await admin
    .from('channel_events')
    .update({ processing_status: 'processing', error_message: '', updated_at: claimedAt })
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('event_id', event.eventId)
    .eq('processing_status', 'received')
    .select('id');
  if (error) throw new Error(`Channel event claim failed: ${error.message}`);
  if ((data ?? []).length === 1) return 'claimed' as const;

  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  const { data: failed, error: failError } = await admin
    .from('channel_events')
    .update({
      processing_status: 'failed',
      error_message: 'Stale processing event requires operator review.',
      processed_at: claimedAt,
      updated_at: claimedAt,
    })
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('event_id', event.eventId)
    .eq('processing_status', 'processing')
    .lt('updated_at', staleBefore)
    .select('id');
  if (failError) throw new Error(`Stale channel event quarantine failed: ${failError.message}`);
  if ((failed ?? []).length === 1) {
    console.error('[whatsapp-dispatch] Stale processing event quarantined for operator review');
    return 'terminal' as const;
  }

  const { data: existing, error: existingError } = await admin
    .from('channel_events')
    .select('processing_status')
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('event_id', event.eventId)
    .maybeSingle();
  if (existingError) throw new Error(`Channel event status load failed: ${existingError.message}`);
  return existing?.processing_status === 'processing' ? 'busy' as const : 'terminal' as const;
}

export function isFirstPendingConversationEvent(
  eventId: string,
  rows: PendingConversationEvent[],
  now = Date.now()
) {
  const staleBefore = now - STALE_PROCESSING_MS;
  const active = rows
    .filter((row) => row.processing_status === 'received' || Date.parse(row.updated_at) >= staleBefore)
    .sort((left, right) =>
      Date.parse(left.occurred_at) - Date.parse(right.occurred_at)
      || left.event_id.localeCompare(right.event_id)
    );
  return active[0]?.event_id === eventId;
}

async function acquireConversationTurn(admin: SupabaseClient, event: NormalizedChannelEvent) {
  const { data, error } = await admin
    .from('channel_events')
    .select('event_id,occurred_at,processing_status,updated_at')
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('event_type', 'message.received')
    .eq('direction', 'inbound')
    .eq('external_connection_id', event.connectionExternalId)
    .eq('external_sender_id', event.senderExternalId)
    .in('processing_status', ['received', 'processing'])
    .limit(100);
  if (error) throw new Error(`Conversation turn load failed: ${error.message}`);
  return isFirstPendingConversationEvent(event.eventId, (data ?? []) as PendingConversationEvent[]);
}

async function loadConversationState(admin: SupabaseClient, event: NormalizedChannelEvent) {
  const { data, error } = await admin
    .from('channel_conversation_states')
    .select('flow_state,bot_paused,pilot_enabled')
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('external_connection_id', event.connectionExternalId)
    .eq('external_user_id', event.senderExternalId)
    .maybeSingle();
  if (error) throw new Error(`Conversation state load failed: ${error.message}`);
  return data as ConversationStateRow | null;
}

async function saveConversationState(
  admin: SupabaseClient,
  event: NormalizedChannelEvent,
  state: HambaFlowState,
  botPaused: boolean,
  outboundMessageId: string
) {
  const { error } = await admin.from('channel_conversation_states').upsert({
    provider: event.provider,
    channel: event.channel,
    external_connection_id: event.connectionExternalId,
    external_user_id: event.senderExternalId,
    flow_state: state,
    bot_paused: botPaused,
    pilot_enabled: true,
    last_inbound_event_id: event.eventId,
    last_outbound_message_id: outboundMessageId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'provider,channel,external_connection_id,external_user_id' });
  if (error) throw new Error(`Conversation state save failed: ${error.message}`);
}

async function recordAction(admin: SupabaseClient, event: NormalizedChannelEvent, action: unknown) {
  if (!action) return;
  await persistChannelEvents(admin, [{
    provider: event.provider,
    channel: event.channel,
    eventId: `${event.eventId}:action`,
    eventType: 'action.recorded',
    direction: 'system',
    connectionExternalId: event.connectionExternalId,
    senderExternalId: event.senderExternalId,
    recipientExternalId: event.recipientExternalId,
    providerMessageId: event.providerMessageId,
    occurredAt: new Date().toISOString(),
    raw: { action },
  }]);
}

async function loadConversationHistory(admin: SupabaseClient, event: NormalizedChannelEvent): Promise<AssistantMessage[]> {
  const { data, error } = await admin
    .from('channel_events')
    .select('direction,payload,occurred_at')
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('external_connection_id', event.connectionExternalId)
    .or(`external_sender_id.eq.${event.senderExternalId},external_recipient_id.eq.${event.senderExternalId}`)
    .in('direction', ['inbound', 'outbound'])
    .order('occurred_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`Conversation history load failed: ${error.message}`);

  return (data ?? []).reverse().flatMap((row): AssistantMessage[] => {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {};
    const normalizedMessage = payload.normalized_message && typeof payload.normalized_message === 'object'
      ? payload.normalized_message as { text?: unknown }
      : undefined;
    const rawMessage = payload.message && typeof payload.message === 'object'
      ? payload.message as { text?: { body?: unknown } }
      : undefined;
    const content = typeof normalizedMessage?.text === 'string'
      ? normalizedMessage.text
      : typeof rawMessage?.text?.body === 'string'
        ? rawMessage.text.body
        : '';
    if (!content.trim()) return [];
    return [{ role: row.direction === 'outbound' ? 'assistant' : 'user', content }];
  });
}

async function enhancePilotTurn(
  admin: SupabaseClient,
  event: NormalizedChannelEvent,
  turn: ReturnType<typeof resolveHambaPilotTurn>,
  catalog: HambaFlowCatalog
): Promise<EnhancedPilotTurn> {
  if (turn.action?.type !== 'answer_property_question') return turn;
  try {
    const assistant = await generatePropertyAssistantReply({
      admin,
      messages: await loadConversationHistory(admin, event),
      catalog,
      propertyId: turn.action.locationId,
    });
    return { ...turn, reply: assistant.reply, assistant };
  } catch (error) {
    console.error('[whatsapp-dispatch] Property Assistant fallback', error instanceof Error ? error.message : error);
    return turn;
  }
}

async function recordAssistantUsage(
  admin: SupabaseClient,
  event: NormalizedChannelEvent,
  assistant: PropertyAssistantReply | undefined
) {
  if (!assistant) return;
  const { data, error } = await admin
    .from('channel_events')
    .select('payload')
    .eq('provider', event.provider)
    .eq('channel', event.channel)
    .eq('event_type', 'assistant.usage')
    .limit(1000);
  if (error) throw new Error(`Assistant spend load failed: ${error.message}`);
  const previousSpend = (data ?? []).reduce((total, row) => {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload as { estimatedCostUsd?: unknown } : {};
    return total + (typeof payload.estimatedCostUsd === 'number' ? payload.estimatedCostUsd : 0);
  }, 0);
  const cumulativeCostUsd = previousSpend + (assistant.estimatedCostUsd ?? 0);
  if (cumulativeCostUsd >= 5) {
    console.warn('[whatsapp-dispatch] $5 assistant spend warning', { cumulativeCostUsd });
  }
  await persistChannelEvents(admin, [{
    provider: event.provider,
    channel: event.channel,
    eventId: `${event.eventId}:assistant-usage`,
    eventType: 'assistant.usage',
    direction: 'system',
    connectionExternalId: event.connectionExternalId,
    senderExternalId: event.senderExternalId,
    recipientExternalId: event.recipientExternalId,
    providerMessageId: event.providerMessageId,
    occurredAt: new Date().toISOString(),
    raw: {
      propertyId: assistant.propertyId,
      provider: assistant.provider,
      model: assistant.model,
      retrieval: assistant.retrieval,
      retrievedCount: assistant.retrievedCount,
      usage: assistant.usage,
      estimatedCostUsd: assistant.estimatedCostUsd,
      cumulativeCostUsd,
      warningThresholdUsd: 5,
    },
  }]);
}

export async function dispatchMetaInboundEvent(admin: SupabaseClient, event: NormalizedChannelEvent) {
  if (event.eventType !== 'message.received' || event.direction !== 'inbound') return { outcome: 'not-inbound' as const };
  if (event.message?.type !== 'text' || !event.message.text.trim()) {
    await updateEventStatus(admin, event, 'ignored');
    return { outcome: 'unsupported-message' as const };
  }

  const configuredConnectionId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
  if (!configuredConnectionId) throw new Error('The configured Meta WhatsApp connection ID is missing.');
  if (event.connectionExternalId !== configuredConnectionId) {
    await updateEventStatus(admin, event, 'ignored');
    return { outcome: 'wrong-connection' as const };
  }

  const saved = await loadConversationState(admin, event);
  if (!saved?.pilot_enabled) {
    await updateEventStatus(admin, event, 'ignored');
    return { outcome: 'not-in-pilot' as const };
  }
  if (saved.bot_paused) {
    await updateEventStatus(admin, event, 'ignored');
    return { outcome: 'bot-paused' as const };
  }
  const claim = await claimEvent(admin, event);
  if (claim === 'busy') throw new Error('This event is already processing; retry this webhook.');
  if (claim === 'terminal') return { outcome: 'duplicate' as const };

  if (!await acquireConversationTurn(admin, event)) {
    await updateEventStatus(admin, event, 'received', 'Waiting for an earlier conversation message.');
    throw new Error('Conversation is processing an earlier message; retry this webhook.');
  }

  let outboundAttempted = false;
  try {
    const catalog = await loadHambaCatalog(admin);
    const resumedState = resumeHambaFlowState(saved.flow_state);
    const assistantConfig = await loadAssistantRuntimeConfig(admin, resumedState.locationId);
    const baseTurn = resolveHambaPilotTurn(resumedState, event.message.text, catalog, assistantConfig.greeting);
    const turn = await enhancePilotTurn(admin, event, baseTurn, catalog);
    outboundAttempted = true;
    const response = await sendMetaTextMessage({ to: event.senderExternalId, body: turn.reply });
    const outboundId = providerMessageId(response);
    if (!outboundId) throw new Error('Meta WhatsApp send did not return a provider message ID.');

    const shouldPause = turn.action?.type === 'opt_out' || turn.state.step === 'handoff' || turn.state.step === 'stopped';
    await saveConversationState(admin, event, turn.state, shouldPause, outboundId);
    await persistChannelEvents(admin, [{
      provider: 'meta',
      channel: 'whatsapp',
      eventId: outboundId,
      eventType: 'message.sent',
      direction: 'outbound',
      connectionExternalId: event.connectionExternalId,
      senderExternalId: event.connectionExternalId,
      recipientExternalId: event.senderExternalId,
      providerMessageId: outboundId,
      occurredAt: new Date().toISOString(),
      message: { type: 'text', text: turn.reply },
      raw: {
        response,
        assistant: turn.assistant ? {
          propertyId: turn.assistant.propertyId,
          provider: turn.assistant.provider,
          model: turn.assistant.model,
          retrieval: turn.assistant.retrieval,
          retrievedCount: turn.assistant.retrievedCount,
          estimatedCostUsd: turn.assistant.estimatedCostUsd,
        } : undefined,
      },
    }]);
    await updateEventStatus(admin, event, 'processed');
    try {
      await recordAction(admin, event, turn.action);
      await recordAssistantUsage(admin, event, turn.assistant);
    } catch (telemetryError) {
      console.error(
        '[whatsapp-dispatch] Non-blocking telemetry failure',
        telemetryError instanceof Error ? telemetryError.message : telemetryError
      );
    }
    return { outcome: 'replied' as const, providerMessageId: outboundId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown dispatch failure';
    await updateEventStatus(admin, event, outboundAttempted ? 'failed' : 'received', message);
    throw error;
  }
}
