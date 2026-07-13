import { NextResponse, type NextRequest } from 'next/server';
import { isLocalAuthBypassEnabled } from '@/lib/auth/local-testing';
import { getProxySession } from '@/lib/supabase/proxy';

// Next.js 16: this is the `proxy` convention (formerly `middleware`).
// Runs on the nodejs runtime. Refreshes the Supabase session on every request
// and gates access: unauthenticated users are sent to /login (pages) or get a
// 401 (API). Authenticated users hitting /login are sent to the app root.

// Public paths that never require authentication.
function isPublicPath(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/auth/');
}

export async function proxy(request: NextRequest) {
  if (isLocalAuthBypassEnabled()) {
    if (request.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  const { user, response } = await getProxySession(request);
  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    // API routes get a 401 instead of a redirect.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Signed-in users shouldn't see the login page.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
