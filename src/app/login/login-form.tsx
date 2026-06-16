'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Input, Label, TextField } from '@heroui/react';
import { getLoginErrorMessage } from '@/lib/auth/login-messages';
import { createClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    getLoginErrorMessage(searchParams.get('error'))
  );
  const [notice, setNotice] = useState<string | null>(null);

  const supabase = createClient();

  async function handleGoogle() {
    setError(null);
    setPending(true);
    const callback = new URL('/auth/callback', window.location.origin);
    callback.searchParams.set('next', redirectTo);
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

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    try {
      if (mode === 'signup') {
        const callback = new URL('/auth/callback', window.location.origin);
        callback.searchParams.set('next', redirectTo);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: callback.toString() },
        });
        if (error) throw error;
        // If email confirmation is required there is no active session yet.
        if (data.session) {
          router.replace(redirectTo);
          router.refresh();
        } else {
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(getLoginErrorMessage(err instanceof Error ? err.message : null));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold tracking-tight text-slate-950">
          {mode === 'signin' ? 'Sign in to Hamba' : 'Create your account'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'signin'
            ? 'Access the property assistant workspace.'
            : 'Create a user with email/password, or use Google.'}
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

      <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form method="post" onSubmit={handleEmailSubmit} className="space-y-3">
        <TextField
          name="email"
          type="email"
          isRequired
          autoComplete="email"
          value={email}
          onChange={setEmail}
          className="flex flex-col gap-1"
        >
          <Label className="text-xs font-medium text-slate-500">Email</Label>
          <Input placeholder="you@example.com" />
        </TextField>

        <TextField
          name="password"
          type="password"
          isRequired
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          value={password}
          onChange={setPassword}
          className="flex flex-col gap-1"
        >
          <Label className="text-xs font-medium text-slate-500">Password</Label>
          <Input placeholder="••••••••" minLength={6} />
        </TextField>

        {error && (
          <Alert status="danger">
            <Alert.Description>{error}</Alert.Description>
          </Alert>
        )}
        {notice && (
          <Alert status="success">
            <Alert.Description>{notice}</Alert.Description>
          </Alert>
        )}

        <Button type="submit" variant="primary" fullWidth isPending={pending} isDisabled={pending}>
          {pending ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            setError(null);
            setNotice(null);
          }}
          className="font-semibold text-blue-600 hover:text-blue-500"
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
      {mode === 'signin' && (
        <p className="mt-3 text-center text-xs leading-5 text-slate-500">
          First time here? Use <span className="font-semibold text-slate-700">Sign up</span> so
          Supabase can create your user before you sign in.
        </p>
      )}
    </div>
  );
}
