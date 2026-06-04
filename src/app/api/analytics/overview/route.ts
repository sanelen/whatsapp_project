import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  getOverviewAnalyticsSummary,
  isOverviewChannel,
  isOverviewWindow,
} from '@/lib/overview-analytics';

export async function GET(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const propertyId = request.nextUrl.searchParams.get('propertyId')?.trim();
  const window = request.nextUrl.searchParams.get('window')?.trim() ?? '30d';
  const channel = request.nextUrl.searchParams.get('channel')?.trim() ?? 'all';

  if (!propertyId) {
    return NextResponse.json({ success: false, error: 'propertyId is required' }, { status: 400 });
  }

  if (!isOverviewWindow(window)) {
    return NextResponse.json({ success: false, error: `Unsupported window "${window}"` }, { status: 400 });
  }

  if (!isOverviewChannel(channel)) {
    return NextResponse.json({ success: false, error: `Unsupported channel "${channel}"` }, { status: 400 });
  }

  try {
    const summary = await getOverviewAnalyticsSummary(propertyId, window, channel);

    return NextResponse.json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load overview analytics',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
