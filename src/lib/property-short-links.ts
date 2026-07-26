import { publicProperties, type PublicProperty } from '@/lib/public-properties';

const PUBLIC_ORIGIN = 'https://hambatrading.co.za';

const PROPERTY_CUSTOMER_SLUGS: Record<PublicProperty['id'], string> = {
  essex: '33-essex',
  westridge: 'westrich',
  quarry: 'Quarry-Heights',
};

const PROPERTY_LEGACY_CODES: Record<PublicProperty['id'], string> = {
  essex: 'es',
  westridge: 'wr',
  quarry: 'qh',
};

export type PropertyShortLinkKind = 'details' | 'photos' | 'map' | 'pamphlet';

function publicUrl(path: string) {
  return new URL(path, PUBLIC_ORIGIN).toString();
}

export function propertyShortLink(
  property: PublicProperty,
  kind: PropertyShortLinkKind = 'details'
) {
  const code = PROPERTY_CUSTOMER_SLUGS[property.id];
  const suffix = kind === 'details' ? '' : `-${kind}`;
  return publicUrl(`/go/${code}${suffix}`);
}

export function resolvePropertyShortLink(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();

  for (const property of publicProperties) {
    const customerSlug = PROPERTY_CUSTOMER_SLUGS[property.id].toLowerCase();
    const legacyCode = PROPERTY_LEGACY_CODES[property.id];
    if (normalized === customerSlug || normalized === legacyCode) {
      return publicUrl(property.pagePath);
    }
    if (normalized === `${customerSlug}-photos` || normalized === `${legacyCode}-photos`) {
      return property.portfolioUrl;
    }
    if (normalized === `${customerSlug}-map` || normalized === `${legacyCode}-map`) {
      return property.mapsUrl ?? null;
    }
    if (
      normalized === `${customerSlug}-pamphlet`
      || normalized === `${legacyCode}-flyer`
      || normalized === `${legacyCode}-pamphlet`
    ) {
      return publicUrl(property.pamphletPath);
    }
  }

  return null;
}
