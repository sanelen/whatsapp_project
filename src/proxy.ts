import { NextResponse, type NextRequest } from 'next/server';
import { isAuthUserAllowed } from '@/lib/auth/access-control';
import { isLocalAuthBypassEnabled } from '@/lib/auth/local-testing';
import { safeRedirectPath } from '@/lib/auth/redirect-path';
import { getProxySession } from '@/lib/supabase/proxy';

// Next.js 16: this is the `proxy` convention (formerly `middleware`).
// Runs on the nodejs runtime. Refreshes the Supabase session on every request
// and gates access: unauthenticated users are sent to /login (pages) or get a
// 401 (API). The public landing page remains available without a session.

// Public paths that never require authentication.
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/data-deletion' ||
    pathname === '/login' ||
    pathname.startsWith('/auth/') ||
    pathname === '/api/whatsapp/webhook'
  );
}

export async function proxy(request: NextRequest) {
  if (isLocalAuthBypassEnabled()) {
    if (request.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/staff', request.url));
    }
    return NextResponse.next();
  }

  const { user, response } = await getProxySession(request);
  const { pathname } = request.nextUrl;
  const isAllowed = Boolean(user && isAuthUserAllowed(user));

  if (!isAllowed && !isPublicPath(pathname)) {
    // API routes get a 401 instead of a redirect.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: user ? 'Forbidden' : 'Unauthorized' },
        { status: user ? 403 : 401 }
      );
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set(
      'next',
      safeRedirectPath(`${request.nextUrl.pathname}${request.nextUrl.search}`)
    );
    if (user) loginUrl.searchParams.set('error', 'access_denied');
    return NextResponse.redirect(loginUrl);
  }

  // Signed-in users shouldn't see the login page.
  if (isAllowed && pathname === '/login') {
    return NextResponse.redirect(new URL('/staff', request.url));
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
