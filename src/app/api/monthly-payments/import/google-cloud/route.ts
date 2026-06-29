import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  buildGmailOAuthConsentUrl,
  exchangeGmailOAuthCode,
  getGmailIntegrationStatus,
} from '@/lib/bank-import';

function resolveRedirectUri(request: NextRequest) {
  const configured = process.env.GMAIL_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  return new URL('/api/monthly-payments/import/google-cloud', request.nextUrl.origin).toString();
}

export async function GET(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const redirectUri = resolveRedirectUri(request);
  const code = request.nextUrl.searchParams.get('code')?.trim();
  const status = getGmailIntegrationStatus();

  try {
    if (code) {
      const token = await exchangeGmailOAuthCode({ code, redirectUri });
      return NextResponse.json({
        success: true,
        refreshToken: token.refresh_token ?? null,
        hasAccessToken: Boolean(token.access_token),
        status: getGmailIntegrationStatus(),
        nextStep: token.refresh_token
          ? 'Store this refreshToken as GMAIL_OAUTH_REFRESH_TOKEN in the runtime environment.'
          : 'Google Cloud did not return a refresh token. Re-run consent with prompt=consent or remove the prior app grant in the Google account.',
      });
    }

    const authorizationUrl = status.hasOAuthClient
      ? buildGmailOAuthConsentUrl({
          redirectUri,
          state: 'monthly-payments-bank-import',
        })
      : null;

    return NextResponse.json({
      success: true,
      status,
      redirectUri,
      authorizationUrl,
      nextStep: status.configured
        ? 'Google Cloud Gmail API credentials are configured.'
        : !authorizationUrl
          ? 'Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET from Google Cloud to generate the consent URL.'
          : 'Open authorizationUrl, approve Gmail read-only access, then store the returned refreshToken as GMAIL_OAUTH_REFRESH_TOKEN.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        status,
        redirectUri,
        error: error instanceof Error ? error.message : 'Failed to prepare Google Cloud Gmail API setup',
      },
      { status: 500 }
    );
  }
}
