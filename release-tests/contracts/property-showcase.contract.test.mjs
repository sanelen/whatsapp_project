import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import publicPropertiesModule from '../../src/lib/public-properties.ts';

const { publicProperties } = publicPropertiesModule;

const manifest = JSON.parse(
  readFileSync(new URL('../property-showcase.manifest.json', import.meta.url), 'utf8'),
);

test('release manifest preserves all three independently verified locations', () => {
  assert.equal(manifest.properties.length, 3);
  assert.deepEqual(
    manifest.properties.map(({ name }) => name),
    ['33 Essex', 'Quarry Heights', 'Westrich'],
  );

  for (const expected of manifest.properties) {
    const property = publicProperties.find(({ id }) => id === expected.id);

    assert.ok(property, `${expected.name} is missing from the public property data`);
    assert.equal(property.name, expected.name);
    assert.equal(property.address, expected.address);
    assert.equal(property.portfolioUrl, expected.portfolioUrl);
  }
});

test('release contract requires every public route and pamphlet asset', () => {
  for (const property of manifest.properties) {
    const routeSource = path.join(
      'src/app',
      property.pagePath.replace(/^\//, ''),
      'page.tsx',
    );
    const pdfFile = path.join('public', property.pdfPath.replace(/^\//, ''));

    assert.ok(existsSync(routeSource), `${property.pagePath} route source is missing`);
    assert.ok(existsSync(pdfFile), `${property.pdfPath} is missing`);
    assert.ok(
      statSync(pdfFile).size > 100_000,
      `${property.pdfPath} is unexpectedly small and may be a placeholder`,
    );

    const source = readFileSync(routeSource, 'utf8');
    assert.match(source, /Full pamphlet PDF/);
    assert.match(source, /Complete 3-page property pamphlet/);
    assert.ok(
      source.includes(path.basename(property.pdfPath)),
      `${property.pagePath} no longer links to ${property.pdfPath}`,
    );
  }
});

test('release contract requires both property carousels', () => {
  const homepage = readFileSync('src/app/page.tsx', 'utf8');
  const propertyShowcase = readFileSync(
    'src/components/public/property-showcase.tsx',
    'utf8',
  );
  const westrichPage = readFileSync(
    'src/app/marketing/westrich/page.tsx',
    'utf8',
  );
  const mediaCarousel = readFileSync(
    'src/components/public/property-media-carousel.tsx',
    'utf8',
  );
  const westrich = manifest.properties.find(({ id }) => id === 'westridge');

  assert.match(homepage, /<PropertyShowcase \/>/);
  assert.match(propertyShowcase, /Property carousel controls/);
  assert.match(propertyShowcase, /publicProperties\.map/);
  assert.match(westrichPage, /<PropertyMediaCarousel/);
  assert.equal(
    (westrichPage.match(/src: '\/marketing\/westrich-/g) ?? []).length,
    westrich.carouselSlides,
  );
  assert.match(mediaCarousel, /aria-label={`Show image \${index \+ 1}`}/);
});
