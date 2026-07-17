import { NextResponse, type NextRequest } from 'next/server';
import { isAuthUserAllowed } from '@/lib/auth/access-control';
import { safeRedirectPath } from '@/lib/auth/redirect-path';
import { createClient } from '@/lib/supabase/server';

// Google OAuth callback: exchange the code, then return staff to the protected
// destination they selected on the public landing page.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextPath = safeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && isAuthUserAllowed(user)) {
        return NextResponse.redirect(new URL(nextPath, origin));
      }

      await supabase.auth.signOut();
      const loginUrl = new URL('/login', origin);
      loginUrl.searchParams.set('error', 'access_denied');
      loginUrl.searchParams.set('next', nextPath);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
