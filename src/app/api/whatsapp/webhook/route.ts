import { NextRequest } from 'next/server';
import { dispatchMetaInboundEvent } from '@/lib/channels/channel-dispatch';
import { persistChannelEvents } from '@/lib/channels/event-store';
import { normalizeMetaWebhook, summarizeMetaWebhook } from '@/lib/channels/meta';
import { getChannelRuntimeConfig } from '@/lib/channels/runtime-config';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyMetaWebhookSignature, verifyWhatsAppChallenge } from '@/lib/whatsapp-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const responseHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'text/plain; charset=utf-8',
};

export async function GET(request: NextRequest) {
  const challenge = verifyWhatsAppChallenge(
    request.nextUrl.searchParams.get('hub.mode'),
    request.nextUrl.searchParams.get('hub.verify_token'),
    request.nextUrl.searchParams.get('hub.challenge'),
    process.env.WHATSAPP_VERIFY_TOKEN?.trim() ?? ''
  );

  if (!challenge) return new Response('Forbidden', { status: 403, headers: responseHeaders });
  return new Response(challenge, { status: 200, headers: responseHeaders });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET?.trim() ?? '';
  if (!appSecret) {
    return new Response('Webhook signature verification is not configured.', {
      status: 503,
      headers: responseHeaders,
    });
  }

  const body = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyMetaWebhookSignature(body, signature, appSecret)) {
    return new Response('Invalid signature', { status: 401, headers: responseHeaders });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: responseHeaders });
  }

  const config = getChannelRuntimeConfig();
  if (config.primaryProvider !== 'meta' || !config.providers.meta.enabled) {
    console.warn('[meta-webhook] Meta provider disabled', {
      primaryProvider: config.primaryProvider,
      metaEnabled: config.providers.meta.enabled,
    });
    return new Response('EVENT_RECEIVED', { status: 200, headers: responseHeaders });
  }

  const events = normalizeMetaWebhook(payload);
  if (!config.providers.meta.ingestionEnabled) {
    console.warn('[meta-webhook] Ingestion disabled', summarizeMetaWebhook(payload));
  } else if (events.length === 0) {
    console.warn('[meta-webhook] No normalized events', summarizeMetaWebhook(payload));
  }

  if (config.providers.meta.ingestionEnabled && events.length > 0) {
    try {
      const admin = getSupabaseAdmin();
      await persistChannelEvents(admin, events);
      if (config.dispatchEnabled && config.providers.meta.outboundEnabled) {
        for (const event of events) await dispatchMetaInboundEvent(admin, event);
      }
    } catch (error) {
      console.error('Meta WhatsApp event ingestion failed:', error instanceof Error ? error.message : error);
      return new Response('Event ingestion failed', { status: 500, headers: responseHeaders });
    }
  }

  return new Response('EVENT_RECEIVED', { status: 200, headers: responseHeaders });
}
