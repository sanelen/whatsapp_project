import { NextResponse } from 'next/server';
import { getWebhookHeartbeat } from '@/lib/supabase';
import type { ApiResponse } from '@/lib/types';

export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    const heartbeat = await getWebhookHeartbeat();
    const seconds = heartbeat.secondsSinceSuccess;

    const state =
      seconds === null
        ? 'no-signal'
        : seconds <= 120
          ? 'live'
          : seconds <= 900
            ? 'stale'
            : 'offline';

    return NextResponse.json(
      {
        success: true,
        data: {
          state,
          ...heartbeat,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
