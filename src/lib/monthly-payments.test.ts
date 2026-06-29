import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDuplicateBuildingName, normalizeBuildingName } from './monthly-payments';

test('normalizeBuildingName trims and lowercases names', () => {
  assert.equal(normalizeBuildingName('  Berea  '), 'berea');
});

test('hasDuplicateBuildingName matches exact names case-insensitively', () => {
  assert.equal(
    hasDuplicateBuildingName(
      [
        { name: 'Berea' },
        { name: 'Essex' },
      ],
      'berea'
    ),
    true
  );
});

test('hasDuplicateBuildingName allows distinct names', () => {
  assert.equal(
    hasDuplicateBuildingName(
      [
        { name: 'Berea' },
        { name: 'Essex' },
      ],
      'Breer'
    ),
    false
  );
});

test('hasDuplicateBuildingName ignores the current building when editing', () => {
  assert.equal(
    hasDuplicateBuildingName(
      [
        { id: 'a', name: 'Berea' },
        { id: 'b', name: 'Essex' },
      ],
      'berea',
      { excludeId: 'a' }
    ),
    false
  );
});
