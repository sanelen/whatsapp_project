import { NextResponse } from 'next/server';
import { getApiUser } from './dal';

// Route-handler guard. Returns a 401 response when unauthenticated, or null
// when the request is authorized. Defense-in-depth alongside the proxy gate.
//
//   const denied = await requireApiAuth();
//   if (denied) return denied;
export async function requireApiAuth(): Promise<NextResponse | null> {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
