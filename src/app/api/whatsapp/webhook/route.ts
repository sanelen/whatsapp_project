import { NextRequest } from 'next/server';
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

  return new Response('EVENT_RECEIVED', { status: 200, headers: responseHeaders });
}
