import { NextResponse, type NextRequest } from 'next/server';
import { isAuthUserAllowed } from '@/lib/auth/access-control';
import { createClient } from '@/lib/supabase/server';

// OAuth / email-confirmation callback: exchange the code, then always show
// the app chooser so authentication never silently selects a workspace.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && isAuthUserAllowed(user)) {
        return NextResponse.redirect(`${origin}/`);
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=access_denied`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
