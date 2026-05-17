import { NextRequest, NextResponse } from 'next/server';
import {
  getMessageByExternalId,
  getOrCreateConversation,
  getOrCreateCustomer,
  logMessage,
  logWebhookEvent,
} from '@/lib/supabase';
import { parseTwilioBody, validateTwilioSignature } from '@/lib/twilio-signature';
import type { ApiResponse } from '@/lib/types';

export async function GET(): Promise<NextResponse<ApiResponse>> {
  return NextResponse.json(
    {
      success: true,
      data: { message: 'Twilio status callback endpoint is active' },
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-twilio-signature') || '';
    const params = parseTwilioBody(rawBody);

    const forwardedProto = request.headers.get('x-forwarded-proto');
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const webhookPath = request.nextUrl.pathname;
    const inboundUrl = forwardedHost
      ? `${forwardedProto || 'https'}://${forwardedHost}${webhookPath}`
      : request.url;

    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    const isValid = validateTwilioSignature(inboundUrl, params, signature, authToken);

    if (!isValid) {
      await logWebhookEvent('twilio.status', params, 'failed', 'Invalid signature');
      return NextResponse.json(
        { success: false, error: 'Unauthorized', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }

    await logWebhookEvent('twilio.status', params, 'processing');

    const rawTo = String(params.To || '');
    const toPhone = rawTo.startsWith('whatsapp:') ? rawTo.replace('whatsapp:', '') : rawTo;
    const messageSid = String(params.MessageSid || '');
    const messageStatus = String(params.MessageStatus || '');
    const body = String(params.Body || '').trim();

    if (!toPhone || !messageSid) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (To, MessageSid)', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const existing = await getMessageByExternalId(messageSid);

    if (!existing) {
      const customer = (await getOrCreateCustomer(toPhone)) as { id: string } | null;
      if (!customer) {
        throw new Error('Failed to resolve customer for status callback');
      }

      const conversation = (await getOrCreateConversation(customer.id)) as { id: string };
      const fallbackContent = `Outbound Twilio message (${messageStatus || 'queued'})`;
      await logMessage(conversation.id, 'outbound', body || fallbackContent, messageSid);
    }

    await logWebhookEvent('twilio.status', params, 'success');

    return NextResponse.json(
      {
        success: true,
        data: { messageSid, status: messageStatus, mirroredToConversation: !existing },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await logWebhookEvent('twilio.status', { error: errorMessage }, 'failed', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
