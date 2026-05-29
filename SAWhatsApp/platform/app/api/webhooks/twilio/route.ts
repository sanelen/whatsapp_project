import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateCustomer,
  getOrCreateConversation,
  getActiveKnowledgeBase,
  getAssistantSettings,
  getRecentMessages,
  logMessage,
  logWebhookEvent,
  markConversationHandoff,
  markFirstBotResponse,
} from '@/lib/supabase';
import { validateTwilioSignature, parseTwilioBody } from '@/lib/twilio-signature';
import { getTwilioClient, TWILIO_FROM_NUMBER } from '@/lib/twilio';
import { decideAssistantResponse } from '@/lib/assistant';
import type { ApiResponse, Conversation } from '@/lib/types';

export async function GET(): Promise<NextResponse<ApiResponse>> {
  return NextResponse.json(
    { success: true, data: { message: 'Twilio webhook endpoint is active' }, timestamp: new Date().toISOString() },
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

    // Twilio signs requests with the auth token
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';
    const isValid = validateTwilioSignature(inboundUrl, params, signature, authToken);
    if (!isValid) {
      console.warn('Invalid Twilio signature');
      await logWebhookEvent('twilio.message', params, 'failed', 'Invalid signature');
      return NextResponse.json(
        { success: false, error: 'Unauthorized', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }

    await logWebhookEvent('twilio.message', params, 'processing');

    const rawFrom = params.From as string;
    const phoneNumber = rawFrom?.startsWith('whatsapp:')
      ? rawFrom.replace('whatsapp:', '')
      : rawFrom;
    const messageBody = params.Body as string;
    const messageSid = params.MessageSid as string;

    if (!phoneNumber || !messageBody) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields (From, Body)', timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    // Fetch customer, assistant settings, and knowledge base in parallel — none depend on each other
    const [customer, assistantSettings, knowledgeEntries] = await Promise.all([
      getOrCreateCustomer(phoneNumber) as Promise<{ id: string; name?: string }>,
      getAssistantSettings(),
      getActiveKnowledgeBase(25),
    ]);

    if (!customer) {
      throw new Error('Failed to resolve customer from inbound message');
    }

    const conversation = (await getOrCreateConversation(customer.id)) as Conversation;

    // Log the inbound message and fetch conversation history in parallel
    const [, recentMessages] = await Promise.all([
      logMessage(conversation.id, 'inbound', messageBody, messageSid),
      getRecentMessages(conversation.id, 8),
    ]);

    const assistantDecision = await decideAssistantResponse({
      inboundText: messageBody,
      customer,
      conversation,
      knowledgeEntries,
      recentMessages,
      settings: assistantSettings,
    });

    let outboundSid: string | null = null;
    let outboundError: string | null = null;
    const automationStatus = assistantDecision.reason;

    if (assistantDecision.reason === 'tenant_requested_handoff') {
      await markConversationHandoff(
        conversation.id,
        assistantDecision.handoffReason || 'Tenant requested a human response',
        assistantSettings.handoff_pause_minutes
      );
    }

    if (!assistantDecision.shouldReply) {
      await logWebhookEvent(
        'twilio.message.automation_skipped',
        {
          phoneNumber,
          conversationId: conversation.id,
          reason: assistantDecision.reason,
        },
        'success'
      );
    } else if (TWILIO_FROM_NUMBER && assistantDecision.replyText) {
      try {
        const outbound = await getTwilioClient().messages.create({
          from: `whatsapp:${TWILIO_FROM_NUMBER}`,
          to: `whatsapp:${phoneNumber}`,
          body: assistantDecision.replyText,
        });
        outboundSid = outbound.sid;
        await logMessage(conversation.id, 'outbound', assistantDecision.replyText, outbound.sid, 'bot');
        await markFirstBotResponse(conversation.id);
      } catch (sendError) {
        outboundError = sendError instanceof Error ? sendError.message : 'Failed to send outbound reply';
        await logWebhookEvent('twilio.message.outbound', { phoneNumber, conversationId: conversation.id }, 'failed', outboundError);
      }
    } else {
      outboundError = 'TWILIO_PHONE_NUMBER_ID is not configured';
      await logWebhookEvent('twilio.message.outbound', { phoneNumber, conversationId: conversation.id }, 'failed', outboundError);
    }

    await logWebhookEvent('twilio.message', params, 'success');

    return NextResponse.json(
      {
        success: true,
        data: {
          customerId: customer.id,
          conversationId: conversation.id,
          messageSid,
          outboundSid,
          outboundError,
          automationStatus,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook error:', errorMessage);
    await logWebhookEvent('twilio.message', { error: errorMessage }, 'failed', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
