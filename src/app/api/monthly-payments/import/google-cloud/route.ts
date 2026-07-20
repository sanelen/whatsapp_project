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
  const state = request.nextUrl.searchParams.get('state')?.trim() ?? '';
  const requestedSlot = request.nextUrl.searchParams.get('slot') === 'source' ? 'source' : 'destination';
  const callbackSlot = state.endsWith(':source') ? 'source' : 'destination';
  const slot = code ? callbackSlot : requestedSlot;
  const sourceMailboxEmail = process.env.BANK_IMPORT_SOURCE_MAILBOX_EMAIL?.trim() || 'Sanele.main@gmail.com';
  const destinationMailboxEmail = process.env.BANK_IMPORT_DESTINATION_MAILBOX_EMAIL?.trim() || 'info.hambatrading@gmail.com';
  const tokenEnvName = slot === 'source' ? 'GMAIL_SOURCE_OAUTH_REFRESH_TOKEN' : 'GMAIL_OAUTH_REFRESH_TOKEN';
  const status = getGmailIntegrationStatus();

  try {
    if (code) {
      const token = await exchangeGmailOAuthCode({ code, redirectUri });
      return NextResponse.json({
        success: true,
        refreshToken: token.refresh_token ?? null,
        hasAccessToken: Boolean(token.access_token),
        status: getGmailIntegrationStatus(),
        credentialSlot: slot,
        mailboxEmail: slot === 'source' ? sourceMailboxEmail : destinationMailboxEmail,
        nextStep: token.refresh_token
          ? `Store this refreshToken as ${tokenEnvName} in the runtime environment.`
          : 'Google Cloud did not return a refresh token. Re-run consent with prompt=consent or remove the prior app grant in the Google account.',
      });
    }

    const authorizationUrl = status.hasOAuthClient
      ? buildGmailOAuthConsentUrl({
          redirectUri,
          state: `monthly-payments-bank-import:${slot}`,
          loginHint: slot === 'source' ? sourceMailboxEmail : destinationMailboxEmail,
        })
      : null;

    return NextResponse.json({
      success: true,
      status,
      redirectUri,
      credentialSlot: slot,
      mailboxEmail: slot === 'source' ? sourceMailboxEmail : destinationMailboxEmail,
      authorizationUrl,
      nextStep: status.configured
        ? 'Google Cloud Gmail API credentials are configured.'
        : !authorizationUrl
          ? 'Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET from Google Cloud to generate the consent URL.'
          : `Open authorizationUrl, approve Gmail read-only access, then store the returned refreshToken as ${tokenEnvName}.`,
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
