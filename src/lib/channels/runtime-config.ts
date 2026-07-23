import type { ChannelProvider, ProviderReadiness } from '@/lib/channels/types';

type Environment = Record<string, string | undefined>;

function isEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function missing(env: Environment, keys: string[]): string[] {
  return keys.filter((key) => !env[key]?.trim());
}

export function getChannelRuntimeConfig(env: Environment = process.env) {
  const primaryProvider: ChannelProvider = env.WHATSAPP_PRIMARY_PROVIDER === 'twilio' ? 'twilio' : 'meta';
  const metaMissing = missing(env, [
    'META_APP_SECRET',
    'WHATSAPP_VERIFY_TOKEN',
    'META_WHATSAPP_ACCESS_TOKEN',
    'META_WHATSAPP_PHONE_NUMBER_ID',
  ]);
  const twilioMissing = missing(env, ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM']);

  const providers: Record<ChannelProvider, ProviderReadiness> = {
    meta: {
      provider: 'meta',
      enabled: isEnabled(env.META_WHATSAPP_ENABLED),
      ingestionEnabled: isEnabled(env.WHATSAPP_INGESTION_ENABLED),
      outboundEnabled: isEnabled(env.WHATSAPP_OUTBOUND_ENABLED),
      credentialsConfigured: metaMissing.length === 0,
      missingConfiguration: metaMissing,
    },
    twilio: {
      provider: 'twilio',
      enabled: isEnabled(env.TWILIO_WHATSAPP_ENABLED),
      ingestionEnabled: false,
      outboundEnabled: false,
      credentialsConfigured: twilioMissing.length === 0,
      missingConfiguration: twilioMissing,
    },
  };

  return {
    primaryProvider,
    providers,
    dispatchEnabled: isEnabled(env.WHATSAPP_DISPATCH_ENABLED),
    metaGraphVersion: env.META_GRAPH_API_VERSION?.trim() || 'v25.0',
  };
}
