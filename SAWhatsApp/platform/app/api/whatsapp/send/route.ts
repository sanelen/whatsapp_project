import { NextRequest, NextResponse } from 'next/server';
import { getAssistantSettings, logMessage, markHumanResponse } from '@/lib/supabase';
import { getTwilioClient, TWILIO_FROM_NUMBER } from '@/lib/twilio';
import type { ApiResponse } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse<ApiResponse>> {
  try {
    const { conversationId, phoneNumber, message } = await request.json();

    if (!conversationId || !phoneNumber || !message) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields (conversationId, phoneNumber, message)',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    const normalizedTo = phoneNumber.startsWith('whatsapp:')
      ? phoneNumber.replace('whatsapp:', '')
      : phoneNumber;

    // Send via Twilio WhatsApp
    const sent = await getTwilioClient().messages.create({
      from: `whatsapp:${TWILIO_FROM_NUMBER}`,
      to: `whatsapp:${normalizedTo}`,
      body: message,
    });

    const assistantSettings = await getAssistantSettings();
    await logMessage(conversationId, 'outbound', message, sent.sid, 'human');
    await markHumanResponse(conversationId, assistantSettings.handoff_pause_minutes);

    return NextResponse.json(
      {
        success: true,
        data: {
          messageId: sent.sid,
          sent: true,
          status: sent.status,
          botPausedForMinutes: assistantSettings.handoff_pause_minutes,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Send message error:', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
