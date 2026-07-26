import { NextResponse, type NextRequest } from 'next/server';
import { resolvePropertyShortLink } from '@/lib/property-short-links';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const destination = resolvePropertyShortLink(slug);

  if (!destination) {
    return NextResponse.json({ error: 'Short link not found.' }, { status: 404 });
  }

  return NextResponse.redirect(destination, 307);
}
