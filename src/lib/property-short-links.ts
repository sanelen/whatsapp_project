import { publicProperties, type PublicProperty } from '@/lib/public-properties';

const PUBLIC_ORIGIN = 'https://hambatrading.co.za';

const PROPERTY_SHORT_CODES: Record<PublicProperty['id'], string> = {
  essex: 'es',
  westridge: 'wr',
  quarry: 'qh',
};

export type PropertyShortLinkKind = 'details' | 'photos' | 'map' | 'flyer';

function publicUrl(path: string) {
  return new URL(path, PUBLIC_ORIGIN).toString();
}

export function propertyShortLink(
  property: PublicProperty,
  kind: PropertyShortLinkKind = 'details'
) {
  const code = PROPERTY_SHORT_CODES[property.id];
  const suffix = kind === 'details' ? '' : `-${kind}`;
  return publicUrl(`/go/${code}${suffix}`);
}

export function resolvePropertyShortLink(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();

  for (const property of publicProperties) {
    const code = PROPERTY_SHORT_CODES[property.id];
    if (normalized === code) return publicUrl(property.pagePath);
    if (normalized === `${code}-photos`) return property.portfolioUrl;
    if (normalized === `${code}-map`) return property.mapsUrl ?? null;
    if (normalized === `${code}-flyer`) return publicUrl(property.pamphletPath);
  }

  return null;
}
