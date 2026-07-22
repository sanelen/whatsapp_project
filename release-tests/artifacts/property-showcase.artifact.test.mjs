import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { PDFDocument } from 'pdf-lib';

const manifest = JSON.parse(
  readFileSync(new URL('../property-showcase.manifest.json', import.meta.url), 'utf8'),
);

function builtHtmlPath(pagePath) {
  if (pagePath === '/') return '.next/server/app/index.html';
  return path.join('.next/server/app', `${pagePath.replace(/^\//, '')}.html`);
}

test('built homepage contains the carousel and all property destinations', () => {
  const homepagePath = builtHtmlPath('/');
  assert.ok(existsSync(homepagePath), 'the built public homepage is missing');

  const html = readFileSync(homepagePath, 'utf8');
  assert.ok(html.includes(manifest.homepageHeading));
  assert.ok(html.includes('Property carousel controls'));

  for (const property of manifest.properties) {
    assert.ok(html.includes(property.name), `${property.name} is missing from the built homepage`);
    assert.ok(
      html.includes(`href="${property.pagePath}"`),
      `${property.pagePath} is missing from the built homepage`,
    );
  }
});

test('built property pages retain locations and pamphlet links', () => {
  for (const property of manifest.properties) {
    const pageFile = builtHtmlPath(property.pagePath);
    assert.ok(existsSync(pageFile), `${property.pagePath} was not emitted by Next.js`);

    const html = readFileSync(pageFile, 'utf8');
    assert.ok(html.includes(property.address), `${property.name} address is missing`);
    assert.ok(html.includes('Full pamphlet PDF'));
    assert.ok(html.includes('Complete 3-page property pamphlet'));
    assert.ok(
      html.includes(`href="${property.pdfPath}"`),
      `${property.pagePath} does not link to ${property.pdfPath}`,
    );
  }
});

test('built Westrich page contains all six media-carousel controls', () => {
  const westrich = manifest.properties.find(({ id }) => id === 'westridge');
  const html = readFileSync(builtHtmlPath(westrich.pagePath), 'utf8');

  assert.ok(html.includes('Property media carousel'));
  for (let index = 1; index <= westrich.carouselSlides; index += 1) {
    assert.ok(html.includes(`Show image ${index}`), `carousel control ${index} is missing`);
  }
});

for (const property of manifest.properties) {
  test(`${property.name} pamphlet is a complete ${property.pdfPages}-page PDF`, async () => {
    const pdfFile = path.join('public', property.pdfPath.replace(/^\//, ''));
    assert.ok(existsSync(pdfFile), `${property.pdfPath} is missing from the build input`);

    const pdf = await PDFDocument.load(readFileSync(pdfFile));
    assert.equal(pdf.getPageCount(), property.pdfPages);
  });
}
