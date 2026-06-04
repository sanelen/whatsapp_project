import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
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
  return user;
});

// For Server Components / pages: redirect to /login when unauthenticated.
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

// For Route Handlers: returns the user or null (caller responds 401).
export async function getApiUser(): Promise<User | null> {
  return getUser();
}
