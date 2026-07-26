import assert from 'node:assert/strict';
import test from 'node:test';
import { publicProperties } from '@/lib/public-properties';
import {
  propertyShortLink,
  resolvePropertyShortLink,
} from '@/lib/property-short-links';

test('creates stable branded short links for every property resource', () => {
  const quarry = publicProperties.find((property) => property.id === 'quarry');
  assert.ok(quarry);

  assert.equal(propertyShortLink(quarry), 'https://hambatrading.co.za/go/qh');
  assert.equal(propertyShortLink(quarry, 'photos'), 'https://hambatrading.co.za/go/qh-photos');
  assert.equal(propertyShortLink(quarry, 'map'), 'https://hambatrading.co.za/go/qh-map');
  assert.equal(propertyShortLink(quarry, 'flyer'), 'https://hambatrading.co.za/go/qh-flyer');
});

test('resolves only approved static property destinations', () => {
  assert.equal(
    resolvePropertyShortLink('qh'),
    'https://hambatrading.co.za/marketing/quarry-heights'
  );
  assert.equal(
    resolvePropertyShortLink('qh-photos'),
    'https://photos.app.goo.gl/56RH6eEDm8tBMWxo8'
  );
  assert.equal(
    resolvePropertyShortLink('qh-map'),
    'https://maps.app.goo.gl/i89MQThp1StcQssK7'
  );
  assert.equal(
    resolvePropertyShortLink('qh-flyer'),
    'https://hambatrading.co.za/marketing/hamba-quarry-heights-advert.pdf'
  );
  assert.equal(resolvePropertyShortLink('es-map'), null);
  assert.equal(resolvePropertyShortLink('https://malicious.example'), null);
  assert.equal(resolvePropertyShortLink('../staff'), null);
});
