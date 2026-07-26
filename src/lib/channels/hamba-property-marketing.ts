import { publicProperties, type PublicProperty } from '@/lib/public-properties';
import { propertyShortLink } from '@/lib/property-short-links';

export type ProspectProperty = PublicProperty & {
  aliases: string[];
};

export type PropertyQuickReply = {
  id: string;
  title: string;
};

export const prospectProperties: ProspectProperty[] = publicProperties.map((property) => ({
  ...property,
  aliases: property.id === 'essex'
    ? ['33 essex', 'essex', 'bulwer', 'berea']
    : property.id === 'westridge'
      ? ['westrich', 'westridge', 'newlands west', 'earlsfield']
      : ['quarry heights', 'quarry', 'newlands east'],
}));

export function propertyQuickReplies(): PropertyQuickReply[] {
  return prospectProperties.map((property) => ({
    id: `property:${property.id}`,
    title: property.name,
  }));
}

export function prospectEntryQuickReplies(): PropertyQuickReply[] {
  return [{ id: 'prospect:start', title: 'Yes, find me a unit' }];
}

export function propertyActionQuickReplies(): PropertyQuickReply[] {
  return [
    { id: 'prospect:apply', title: 'Apply / availability' },
    { id: 'prospect:question', title: 'Ask a question' },
    { id: 'prospect:locations', title: 'Other location' },
  ];
}

export function propertyMarketingContext() {
  return prospectProperties.map((property) => [
    `${property.name} — ${property.area}`,
    `Address: ${property.address}`,
    `Property page: ${propertyShortLink(property)}`,
    `Photos and videos: ${propertyShortLink(property, 'photos')}`,
    `Pamphlet: ${propertyShortLink(property, 'pamphlet')}`,
  ].join('\n')).join('\n\n');
}

export function buildProspectEntryReply(intro = 'Hi 👋 Welcome to Hamba Trading Property Rentals.') {
  const safeIntro = intro.trim().length > 280
    ? `${intro.trim().slice(0, 279).trimEnd()}…`
    : intro.trim();
  const question = /looking for (?:a )?(?:unit|room|rental)/i.test(safeIntro)
    ? ''
    : 'Are you looking for a unit to rent?';
  return [safeIntro, question].filter(Boolean).join('\n\n');
}

export function buildLocationChoiceReply(intro = 'Great. Where would you like to stay?') {
  return [
    intro.trim(),
    '',
    ...prospectProperties.map((property) => `• ${property.name} — ${property.area}`),
  ].join('\n').trim();
}

export function buildSelectedPropertyReply(property: ProspectProperty) {
  const links = [
    property.mapsUrl ? `Map: ${propertyShortLink(property, 'map')}` : '',
    `Photos: ${propertyShortLink(property, 'photos')}`,
    `Details: ${propertyShortLink(property)}`,
    `Pamphlet: ${propertyShortLink(property, 'pamphlet')}`,
  ].filter(Boolean);

  return [
    `${property.name} — ${property.area}`,
    property.priceLine,
    property.featureLine,
    property.parkingLine,
    `Address: ${property.address}`,
    ...links,
    '',
    'Hamba staff will confirm the available room, current rent, deposit and viewing details.',
    'What would you like to do next?',
  ].join('\n');
}

export function buildVerifiedPropertyQuestionReply(input: {
  locationId?: string;
  propertyInterest?: string;
  query: string;
}) {
  const identity = [input.locationId, input.propertyInterest]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const property = prospectProperties.find((item) =>
    identity.includes(item.id)
    || identity.includes(item.name.toLowerCase())
    || item.aliases.some((alias) => identity.includes(alias))
  );
  if (!property) {
    return 'Hamba staff can confirm that property detail for you.';
  }

  const query = input.query.toLowerCase();
  if (/\b(park|parking|car|vehicle)\b/.test(query)) {
    return `${property.parkingLine}.`;
  }
  if (/\b(rent|rental|price|cost|how much|monthly)\b/.test(query)) {
    return `${property.priceLine}. Hamba staff will confirm the current rent and final terms.`;
  }
  if (/\b(deposit|secure|upfront|move.?in cost)\b/.test(query)) {
    return `Hamba staff will confirm the current deposit and any payment arrangement for ${property.name}.`;
  }
  if (/\b(where|location|located|address|map|direction)\b/.test(query)) {
    return [
      `${property.name} is at ${property.address}.`,
      property.mapsUrl ? `Map: ${propertyShortLink(property, 'map')}` : '',
    ].filter(Boolean).join('\n');
  }
  if (/\b(photo|picture|image|video|pamphlet|brochure)\b/.test(query)) {
    return [
      `Photos: ${propertyShortLink(property, 'photos')}`,
      `Pamphlet: ${propertyShortLink(property, 'pamphlet')}`,
    ].join('\n');
  }
  if (/\b(occupant|people|person|persons|couple|children|child|family)\b/.test(query)) {
    return `${property.featureLine}. Hamba staff will confirm whether the unit suits your household.`;
  }
  if (/\b(wi-?fi|internet|fibre|fiber)\b/.test(query)) {
    return `${property.featureLine}.`;
  }
  if (/\b(available|availability|vacant|vacancy|open room)\b/.test(query)) {
    return `Hamba staff will check and confirm current availability at ${property.name}.`;
  }
  return `Hamba staff can confirm that detail about ${property.name} for you.`;
}

export function buildPropertyShowcaseReply(intro = 'Hi 👋 Welcome to Hamba Trading.') {
  const safeIntro = intro.trim().length > 150
    ? `${intro.trim().slice(0, 149).trimEnd()}…`
    : intro.trim();
  const cards = prospectProperties.map((property, index) => [
    `${index + 1}. ${property.name} — ${property.area}`,
    `Property: ${propertyShortLink(property)}`,
    `Photos: ${propertyShortLink(property, 'photos')}`,
    `Pamphlet: ${propertyShortLink(property, 'pamphlet')}`,
  ].join('\n'));

  return [
    safeIntro,
    '',
    'Explore our well-managed room and studio rentals across Durban:',
    '',
    ...cards.flatMap((card) => [card, '']),
    'Choose a button, or type a property name, area or 1–3.',
    'Next: budget and move-in. Staff confirms availability and final terms.',
  ].join('\n').trim();
}

export function findProspectProperty(message: string) {
  const input = message.trim().toLowerCase().replace(/\s+/g, ' ');
  const quickReplyProperty = prospectProperties.find((property) => input === `property:${property.id}`);
  if (quickReplyProperty) return quickReplyProperty;
  const numeric = Number(input);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= prospectProperties.length) {
    return prospectProperties[numeric - 1];
  }
  return prospectProperties.find((property) =>
    [property.name, property.area, ...property.aliases]
      .some((candidate) => input.includes(candidate.toLowerCase()))
  );
}
