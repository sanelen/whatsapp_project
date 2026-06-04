import { NextResponse, type NextRequest } from 'next/server';
import { isLocalAuthBypassEnabled } from '@/lib/auth/local-testing';
import { createClient } from '@/lib/supabase/server';

// POST /auth/signout — clears the Supabase session and returns to /login.
export async function POST(request: NextRequest) {
  if (isLocalAuthBypassEnabled()) {
    return NextResponse.redirect(new URL('/', request.url), { status: 303 });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 so the browser issues a GET to /login after the POST.
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
