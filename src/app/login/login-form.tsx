'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button } from '@heroui/react';
import { getLoginErrorMessage } from '@/lib/auth/login-messages';
import { safeRedirectPath } from '@/lib/auth/redirect-path';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    getLoginErrorMessage(searchParams.get('error'))
  );

  const supabase = createClient();

  async function handleGoogle() {
    setError(null);
    setPending(true);
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', safeRedirectPath(searchParams.get('next'), '/staff'));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString() },
    });
    if (error) {
      setError(getLoginErrorMessage(error.message));
      setPending(false);
    }
    // On success the browser is redirected to Google; nothing else to do.
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-950">Sign in to Hamba</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use the approved Hamba Google account.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        fullWidth
        onPress={handleGoogle}
        isDisabled={pending}
      >
        <span aria-hidden className="text-base">G</span>
        Continue with Google
      </Button>

      {error && (
        <Alert status="danger" className="mt-4">
          <Alert.Description>{error}</Alert.Description>
        </Alert>
      )}
    </div>
  );
}
