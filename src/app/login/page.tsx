import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata = {
  title: 'Sign in — Hamba',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-950">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
