import type { User } from '@supabase/supabase-js';

const LOCAL_AUTH_BYPASS_EMAIL = 'agent.local@hamba.test';

export function parseEnvToggle(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function isLocalAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && parseEnvToggle(process.env.NEXT_PUBLIC_LOCAL_AUTH_BYPASS);
}

export function getLocalAuthBypassUser(): User {
  const now = new Date().toISOString();

  return {
    id: 'local-auth-bypass-user',
    app_metadata: { provider: 'local-auth-bypass', providers: ['local-auth-bypass'] },
    user_metadata: { full_name: 'Local Browser Test User' },
    aud: 'authenticated',
    confirmation_sent_at: now,
    confirmed_at: now,
    created_at: now,
    email: LOCAL_AUTH_BYPASS_EMAIL,
    email_confirmed_at: now,
    identities: [],
    is_anonymous: false,
    last_sign_in_at: now,
    phone: '',
    role: 'authenticated',
    updated_at: now,
  };
}

export function getLocalAuthBypassEmail(): string {
  return LOCAL_AUTH_BYPASS_EMAIL;
}
