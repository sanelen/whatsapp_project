import assert from 'node:assert/strict';
import test from 'node:test';
import { formatUnitOccupancySummary } from './unit-display';

test('occupied units without contacts remain visibly occupied', () => {
  assert.equal(
    formatUnitOccupancySummary({ occupancy: 'occupied', contacts: [] }),
    'occupied · no contact'
  );
});

test('vacant units and contacts are represented independently', () => {
  assert.equal(
    formatUnitOccupancySummary({ occupancy: 'vacant', contacts: ['031...555'] }),
    'vacant · 031...555'
  );
});
