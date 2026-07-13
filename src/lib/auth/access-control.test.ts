import assert from 'node:assert/strict';
import test from 'node:test';
import type { User } from '@supabase/supabase-js';
import { isAuthUserAllowed, parseAllowedAuthEmails } from './access-control';

function authUser(email: string | undefined, provider = 'google'): User {
  return {
    id: 'auth-user',
    app_metadata: { provider, providers: [provider] },
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
    email,
  } as User;
}

test('allowed auth emails are normalized and deduplicated', () => {
  assert.deepEqual(
    [...parseAllowedAuthEmails(' Owner@Example.com,owner@example.com, second@example.com ')],
    ['owner@example.com', 'second@example.com']
  );
});

test('production only permits an allowlisted Google user', () => {
  const environment = {
    NODE_ENV: 'production',
    AUTH_ALLOWED_EMAILS: 'owner@example.com',
  } as const;

  assert.equal(isAuthUserAllowed(authUser('Owner@Example.com'), environment), true);
  assert.equal(isAuthUserAllowed(authUser('other@example.com'), environment), false);
  assert.equal(isAuthUserAllowed(authUser('owner@example.com', 'email'), environment), false);
});

test('production fails closed when the allowlist is missing', () => {
  assert.equal(
    isAuthUserAllowed(authUser('owner@example.com'), { NODE_ENV: 'production' }),
    false
  );
});

test('development remains usable without an allowlist', () => {
  assert.equal(
    isAuthUserAllowed(authUser('developer@example.com'), { NODE_ENV: 'development' }),
    true
  );
});
