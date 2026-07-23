import type { NormalizedChannelEvent } from '@/lib/channels/types';
import { getChannelRuntimeConfig } from '@/lib/channels/runtime-config';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function asRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is UnknownRecord => Boolean(item)) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function eventTime(value: unknown): string {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date(0).toISOString();
}

function messageText(message: UnknownRecord): string {
  const type = text(message.type) || 'unknown';
  const directText = text(asRecord(message.text)?.body);
  if (directText) return directText;

  const interactive = asRecord(message.interactive);
  const button = asRecord(interactive?.button_reply);
  const list = asRecord(interactive?.list_reply);
  const interactiveText = text(button?.title) || text(button?.id) || text(list?.title) || text(list?.id);
  if (interactiveText) return interactiveText;

  const caption = text(asRecord(message[type])?.caption);
  return caption || `[${type}]`;
}

export function summarizeMetaWebhook(payload: unknown) {
  const root = asRecord(payload);
  const entries = asRecords(root?.entry);
  const changes = entries.flatMap((entry) => asRecords(entry.changes));
  const fields = [...new Set(changes.map((change) => text(change.field)).filter(Boolean))];
  let messageCount = 0;
  let statusCount = 0;
  for (const change of changes) {
    const value = asRecord(change.value);
    messageCount += asRecords(value?.messages).length;
    statusCount += asRecords(value?.statuses).length;
  }
  return {
    object: text(root?.object) || 'unknown',
    entryCount: entries.length,
    changeCount: changes.length,
    fields,
    messageCount,
    statusCount,
  };
}

export function normalizeMetaWebhook(payload: unknown): NormalizedChannelEvent[] {
  const root = asRecord(payload);
  if (!root || root.object !== 'whatsapp_business_account') return [];

  const events: NormalizedChannelEvent[] = [];
  for (const entry of asRecords(root.entry)) {
    for (const change of asRecords(entry.changes)) {
      if (change.field !== 'messages') continue;
      const value = asRecord(change.value);
      if (!value) continue;

      const metadata = asRecord(value.metadata);
      const connectionExternalId = text(metadata?.phone_number_id);
      const contact = asRecords(value.contacts)[0];
      const contactName = text(asRecord(contact?.profile)?.name);

      for (const message of asRecords(value.messages)) {
        const providerMessageId = text(message.id);
        if (!providerMessageId) continue;
        events.push({
          provider: 'meta',
          channel: 'whatsapp',
          eventId: providerMessageId,
          eventType: 'message.received',
          direction: 'inbound',
          connectionExternalId,
          senderExternalId: text(message.from) || text(contact?.wa_id),
          recipientExternalId: connectionExternalId,
          providerMessageId,
          occurredAt: eventTime(message.timestamp),
          contactName: contactName || undefined,
          message: {
            type: text(message.type) || 'unknown',
            text: messageText(message),
          },
          raw: { metadata: metadata ?? {}, contact: contact ?? {}, message },
        });
      }

      for (const status of asRecords(value.statuses)) {
        const providerMessageId = text(status.id);
        const deliveryStatus = text(status.status) || 'unknown';
        if (!providerMessageId) continue;
        events.push({
          provider: 'meta',
          channel: 'whatsapp',
          eventId: `${providerMessageId}:${deliveryStatus}:${text(status.timestamp) || 'unknown'}`,
          eventType: 'message.status',
          direction: 'status',
          connectionExternalId,
          senderExternalId: connectionExternalId,
          recipientExternalId: text(status.recipient_id),
          providerMessageId,
          occurredAt: eventTime(status.timestamp),
          deliveryStatus,
          raw: { metadata: metadata ?? {}, status },
        });
      }
    }
  }

  return events;
}

export function buildMetaTextRequest(input: {
  to: string;
  body: string;
  phoneNumberId: string;
  graphVersion?: string;
}) {
  const graphVersion = input.graphVersion?.trim() || 'v25.0';
  return {
    url: `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(input.phoneNumberId)}/messages`,
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: input.to,
      type: 'text',
      text: { preview_url: false, body: input.body },
    },
  };
}

export async function sendMetaTextMessage(input: { to: string; body: string }) {
  const config = getChannelRuntimeConfig();
  const meta = config.providers.meta;
  if (!meta.enabled || !meta.outboundEnabled) {
    throw new Error('Meta WhatsApp outbound messaging is disabled.');
  }

  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() || '';
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim() || '';
  if (!accessToken || !phoneNumberId) throw new Error('Meta WhatsApp outbound credentials are incomplete.');

  const request = buildMetaTextRequest({ ...input, phoneNumberId, graphVersion: config.metaGraphVersion });
  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request.body),
  });

  if (!response.ok) throw new Error(`Meta WhatsApp send failed with HTTP ${response.status}.`);
  return response.json() as Promise<Record<string, unknown>>;
}
