import type { User } from '@supabase/supabase-js';

const ALLOWED_EMAILS_ENV = 'AUTH_ALLOWED_EMAILS';

export function parseAllowedAuthEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

function usesGoogleProvider(user: User): boolean {
  const provider = user.app_metadata.provider;
  const providers = user.app_metadata.providers;

  return provider === 'google' || (Array.isArray(providers) && providers.includes('google'));
}

export function isAuthUserAllowed(
  user: User,
  environment: Partial<Pick<NodeJS.ProcessEnv, 'NODE_ENV' | 'AUTH_ALLOWED_EMAILS'>> = process.env
): boolean {
  const allowedEmails = parseAllowedAuthEmails(environment[ALLOWED_EMAILS_ENV]);

  // Keep ordinary local development usable when no allowlist is configured.
  // Production and Vercel previews fail closed if the setting is missing.
  if (allowedEmails.size === 0) {
    return environment.NODE_ENV !== 'production';
  }

  const email = user.email?.trim().toLowerCase();
  return Boolean(email && allowedEmails.has(email) && usesGoogleProvider(user));
}
