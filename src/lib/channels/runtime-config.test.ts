import assert from 'node:assert/strict';
import test from 'node:test';
import { getChannelRuntimeConfig } from '@/lib/channels/runtime-config';

test('defaults to Meta while keeping every live transport action disabled', () => {
  const config = getChannelRuntimeConfig({});
  assert.equal(config.primaryProvider, 'meta');
  assert.equal(config.providers.meta.enabled, false);
  assert.equal(config.providers.meta.ingestionEnabled, false);
  assert.equal(config.providers.meta.outboundEnabled, false);
  assert.equal(config.dispatchEnabled, false);
  assert.equal(config.providers.twilio.enabled, false);
});

test('reports readiness without returning any secret values', () => {
  const config = getChannelRuntimeConfig({
    WHATSAPP_PRIMARY_PROVIDER: 'meta',
    META_WHATSAPP_ENABLED: 'true',
    WHATSAPP_INGESTION_ENABLED: '1',
    WHATSAPP_OUTBOUND_ENABLED: 'false',
    WHATSAPP_DISPATCH_ENABLED: 'true',
    META_APP_SECRET: 'secret-value',
    WHATSAPP_VERIFY_TOKEN: 'verify-value',
    META_WHATSAPP_ACCESS_TOKEN: 'access-value',
    META_WHATSAPP_PHONE_NUMBER_ID: 'phone-value',
  });

  assert.equal(config.providers.meta.credentialsConfigured, true);
  assert.equal(config.providers.meta.enabled, true);
  assert.equal(config.providers.meta.ingestionEnabled, true);
  assert.equal(config.providers.meta.outboundEnabled, false);
  assert.equal(config.dispatchEnabled, true);
  assert.equal(JSON.stringify(config).includes('secret-value'), false);
  assert.equal(JSON.stringify(config).includes('access-value'), false);
});

test('keeps Twilio as an explicitly enabled fallback only', () => {
  const config = getChannelRuntimeConfig({
    WHATSAPP_PRIMARY_PROVIDER: 'twilio',
    TWILIO_WHATSAPP_ENABLED: 'true',
    TWILIO_ACCOUNT_SID: 'account',
    TWILIO_AUTH_TOKEN: 'token',
    TWILIO_WHATSAPP_FROM: 'whatsapp:+10000000000',
  });

  assert.equal(config.primaryProvider, 'twilio');
  assert.equal(config.providers.twilio.enabled, true);
  assert.equal(config.providers.twilio.credentialsConfigured, true);
  assert.equal(config.providers.twilio.ingestionEnabled, false);
  assert.equal(config.providers.twilio.outboundEnabled, false);
});
