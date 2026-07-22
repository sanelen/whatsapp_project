import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('public property source keeps every location independent and uses verified album links', () => {
  const source = readFileSync('src/lib/public-properties.ts', 'utf8');

  assert.match(source, /name: '33 Essex'/);
  assert.match(source, /name: 'Westrich'/);
  assert.match(source, /name: 'Quarry Heights'/);
  assert.match(source, /kMR2VEfBo4EXLZJQA/);
  assert.match(source, /xwUqocDcoAvnMpmW8/);
  assert.match(source, /56RH6eEDm8tBMWxo8/);
  assert.match(source, /No tenant or guest parking is available/);
  assert.match(source, /Parking is very limited and is never guaranteed/);
  assert.match(source, /Ask us to confirm the current room price/);
});

test('homepage provides a compact carousel and property-specific WhatsApp handoff', () => {
  const pageSource = readFileSync('src/app/page.tsx', 'utf8');
  const componentSource = readFileSync('src/components/public/property-showcase.tsx', 'utf8');

  assert.match(pageSource, /<PropertyShowcase \/>/);
  assert.match(componentSource, /aria-label="Property carousel controls"/);
  assert.match(componentSource, /View photos/);
  assert.match(componentSource, /Ask Hamba/);
  assert.match(componentSource, /property\.mapsUrl/);
  assert.match(componentSource, /Photos show the properties, not guaranteed availability/);
});

test('refreshed Essex advert excludes unresolved prices and application claims', () => {
  const source = readFileSync('src/app/marketing/33-essex/page.tsx', 'utf8');

  assert.match(source, /current price, deposit, lease term, household fit, and availability/);
  assert.match(source, /Free Wi-Fi included/);
  assert.match(source, /Parking is very limited/);
  assert.match(source, /Furnishings and appliances may vary by unit/);
  assert.doesNotMatch(
    source,
    /R4,000|R5,000|No children|proof of income|CCTV|burglar guards|prepaid electricity|metered water|shared hot water|no subletting|three-month/i,
  );
});

test('Essex advert includes a matching downloadable profile image', () => {
  const pageSource = readFileSync('src/app/marketing/33-essex/page.tsx', 'utf8');
  const profileSource = readFileSync('public/marketing/hamba-essex-profile.svg', 'utf8');

  assert.match(pageSource, /hamba-essex-profile\.svg/);
  assert.match(pageSource, /hamba-essex-profile\.png/);
  assert.match(profileSource, />33<\/text>/);
  assert.match(profileSource, />ESSEX<\/text>/);
});

test('property adverts expose the verified website and downloadable PDFs', () => {
  const essexSource = readFileSync('src/app/marketing/33-essex/page.tsx', 'utf8');
  const quarrySource = readFileSync('src/app/marketing/quarry-heights/page.tsx', 'utf8');
  const westrichSource = readFileSync('src/app/marketing/westrich/page.tsx', 'utf8');

  assert.match(essexSource, /https:\/\/hambatrading\.co\.za/);
  assert.match(essexSource, /hamba-essex-advert\.pdf/);
  assert.match(quarrySource, /https:\/\/hambatrading\.co\.za/);
  assert.match(quarrySource, /hamba-quarry-heights-advert\.pdf/);
  assert.match(westrichSource, /https:\/\/hambatrading\.co\.za/);
  assert.match(westrichSource, /hamba-westrich-advert\.pdf/);
});

test('Quarry Heights advert keeps building-specific facts narrow and verified', () => {
  const source = readFileSync('src/app/marketing/quarry-heights/page.tsx', 'utf8');
  const profileSource = readFileSync('public/marketing/hamba-quarry-heights-profile.svg', 'utf8');

  assert.match(source, /R2,200 \/ month/);
  assert.match(source, /Refundable deposit: R2,200/);
  assert.match(source, /Free Wi-Fi included/);
  assert.match(source, /Maximum two occupants/);
  assert.match(source, /No tenant or guest parking/);
  assert.match(source, /do not allow children under 12/);
  assert.match(source, /children aged 12-15/);
  assert.doesNotMatch(source, /CCTV/i);
  assert.match(profileSource, />28<\/text>/);
  assert.match(profileSource, />QUARRY<\/text>/);
});

test('Westrich advert uses verified property-specific facts and conservative claims', () => {
  const source = readFileSync('src/app/marketing/westrich/page.tsx', 'utf8');
  const carouselSource = readFileSync('src/components/public/property-media-carousel.tsx', 'utf8');
  const profileSource = readFileSync('public/marketing/hamba-westrich-profile.svg', 'utf8');

  assert.match(source, /Recorded from R1,900 \/ month/);
  assert.match(source, /Recorded deposit baseline: R1,400/);
  assert.match(source, /Parking is very limited and is never guaranteed/);
  assert.match(source, /One or two occupants, depending on the room/);
  assert.match(source, /household fit.*confirmed by staff/i);
  assert.doesNotMatch(source, /Free Wi-Fi|CCTV|No children|children under/i);
  assert.match(source, /<PropertyMediaCarousel/);
  assert.equal((source.match(/src: '\/marketing\/westrich-/g) ?? []).length, 6);
  assert.match(source, /westrich-empty-studio\.jpg/);
  assert.match(source, /westrich-kitchenette-entry\.jpg/);
  assert.match(source, /westrich-full-ensuite\.jpg/);
  assert.match(source, /westrich-shower-detail\.jpg/);
  assert.doesNotMatch(source, /src: '\/marketing\/westrich-exterior\.jpg'/);
  assert.match(carouselSource, /aria-label="Property media carousel"/);
  assert.match(carouselSource, /Swipe the gallery or use the arrows/);
  assert.match(profileSource, />10<\/text>/);
  assert.match(profileSource, />WESTRICH<\/text>/);
});
