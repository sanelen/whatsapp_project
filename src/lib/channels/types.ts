export type ChannelProvider = 'meta' | 'twilio';
export type ChannelKind = 'whatsapp' | 'facebook_messenger' | 'instagram';
export type ChannelDirection = 'inbound' | 'outbound' | 'status' | 'system';

export type NormalizedChannelEvent = {
  provider: ChannelProvider;
  channel: ChannelKind;
  eventId: string;
  eventType: 'message.received' | 'message.sent' | 'message.status' | 'action.recorded' | 'assistant.usage';
  direction: ChannelDirection;
  connectionExternalId: string;
  senderExternalId: string;
  recipientExternalId: string;
  providerMessageId: string;
  occurredAt: string;
  contactName?: string;
  message?: {
    type: string;
    text: string;
  };
  deliveryStatus?: string;
  raw: Record<string, unknown>;
};

export type ProviderReadiness = {
  provider: ChannelProvider;
  enabled: boolean;
  ingestionEnabled: boolean;
  outboundEnabled: boolean;
  credentialsConfigured: boolean;
  missingConfiguration: string[];
};
