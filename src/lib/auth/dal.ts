import 'server-only';
import { isReleaseCheckRequest } from './release-check';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { isAuthUserAllowed } from '@/lib/auth/access-control';
import { getLocalAuthBypassUser, isLocalAuthBypassEnabled } from '@/lib/auth/local-testing';
import { createClient } from '@/lib/supabase/server';

// Memoized per-request lookup of the authenticated user.
export const getUser = cache(async (): Promise<User | null> => {
  if (isLocalAuthBypassEnabled()) {
    return getLocalAuthBypassUser();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAuthUserAllowed(user) ? user : null;
});

// For Server Components / pages: redirect to /login when unauthenticated.
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

// For Route Handlers: returns the user or null (caller responds 401).
export async function getApiUser(request?: Request): Promise<User | null> {
  if (request && await isReleaseCheckRequest(request)) return {
    id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'release-check',
    app_metadata: { provider: 'release-check' }, user_metadata: {}, created_at: '2026-11-25T00:00:00Z',
  } as User;
  return getUser();
}
