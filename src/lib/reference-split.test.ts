import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReverseReferenceSplit,
  planReferenceSplit,
  type SplitParentSnapshot,
  type SplitUnitSnapshot,
} from './reference-split';

const units = new Map<string, SplitUnitSnapshot>([
  ['unit-qh-7', { id: 'unit-qh-7', propertyId: 'prop-qh' }],
  ['unit-qh-9', { id: 'unit-qh-9', propertyId: 'prop-qh' }],
  ['unit-wr-2', { id: 'unit-wr-2', propertyId: 'prop-wr' }],
]);

function parent(overrides: Partial<SplitParentSnapshot> = {}): SplitParentSnapshot {
  return {
    id: 'ref-1',
    amount: 4400,
    propertyId: null,
    unitId: null,
    signedOff: false,
    splitAt: null,
    splitParentId: null,
    ...overrides,
  };
}

test('splits the verified R4,400 two-room case into exact per-unit children', () => {
  const result = planReferenceSplit(
    parent(),
    [
      { unitId: 'unit-qh-7', amount: 2200 },
      { unitId: 'unit-qh-9', amount: 2200 },
    ],
    units
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.children, [
    { unitId: 'unit-qh-7', propertyId: 'prop-qh', amount: 2200 },
    { unitId: 'unit-qh-9', propertyId: 'prop-qh', amount: 2200 },
  ]);
});

test('allows uneven splits and cent precision', () => {
  const result = planReferenceSplit(
    parent({ amount: 4100.5 }),
    [
      { unitId: 'unit-qh-7', amount: 2200.25 },
      { unitId: 'unit-qh-9', amount: 1900.25 },
    ],
    units
  );
  assert.equal(result.ok, true);
});

test('rejects allocations that fall short, with the exact shortfall', () => {
  const result = planReferenceSplit(
    parent(),
    [
      { unitId: 'unit-qh-7', amount: 2200 },
      { unitId: 'unit-qh-9', amount: 2100 },
    ],
    units
  );
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : '', /short.*R100\.00/);
});

test('rejects allocations that exceed the parent amount', () => {
  const result = planReferenceSplit(
    parent(),
    [
      { unitId: 'unit-qh-7', amount: 2300 },
      { unitId: 'unit-qh-9', amount: 2200 },
    ],
    units
  );
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : '', /exceed.*R100\.00/);
});

test('requires at least two allocations — a one-unit "split" is just a match', () => {
  const result = planReferenceSplit(parent(), [{ unitId: 'unit-qh-7', amount: 4400 }], units);
  assert.equal(result.ok, false);
});

test('rejects duplicate units, unknown units, and non-positive amounts', () => {
  assert.equal(
    planReferenceSplit(
      parent(),
      [
        { unitId: 'unit-qh-7', amount: 2200 },
        { unitId: 'unit-qh-7', amount: 2200 },
      ],
      units
    ).ok,
    false
  );
  assert.equal(
    planReferenceSplit(
      parent(),
      [
        { unitId: 'unit-qh-7', amount: 2200 },
        { unitId: 'unit-ghost', amount: 2200 },
      ],
      units
    ).ok,
    false
  );
  assert.equal(
    planReferenceSplit(
      parent(),
      [
        { unitId: 'unit-qh-7', amount: 4400 },
        { unitId: 'unit-qh-9', amount: 0 },
      ],
      units
    ).ok,
    false
  );
});

test('enforces a parent property lock across every allocation', () => {
  const result = planReferenceSplit(
    parent({ propertyId: 'prop-qh' }),
    [
      { unitId: 'unit-qh-7', amount: 2200 },
      { unitId: 'unit-wr-2', amount: 2200 },
    ],
    units
  );
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.error : '', /locked to a property/);
});

test('allows cross-property splits when no property lock exists', () => {
  const result = planReferenceSplit(
    parent(),
    [
      { unitId: 'unit-qh-7', amount: 2200 },
      { unitId: 'unit-wr-2', amount: 2200 },
    ],
    units
  );
  assert.equal(result.ok, true);
});

test('refuses to split matched, signed-off, already-split, or child references', () => {
  const allocations = [
    { unitId: 'unit-qh-7', amount: 2200 },
    { unitId: 'unit-qh-9', amount: 2200 },
  ];
  assert.equal(planReferenceSplit(parent({ unitId: 'unit-qh-7' }), allocations, units).ok, false);
  assert.equal(planReferenceSplit(parent({ signedOff: true }), allocations, units).ok, false);
  assert.equal(planReferenceSplit(parent({ splitAt: '2026-07-13T00:00:00Z' }), allocations, units).ok, false);
  assert.equal(planReferenceSplit(parent({ splitParentId: 'ref-0' }), allocations, units).ok, false);
});

test('split reversal is only allowed while every child is untouched', () => {
  assert.equal(
    canReverseReferenceSplit([
      { unitId: null, signedOff: false },
      { unitId: null, signedOff: false },
    ]).ok,
    true
  );
  assert.equal(
    canReverseReferenceSplit([
      { unitId: 'unit-qh-7', signedOff: false },
      { unitId: null, signedOff: false },
    ]).ok,
    false
  );
  assert.equal(
    canReverseReferenceSplit([
      { unitId: null, signedOff: true },
      { unitId: null, signedOff: false },
    ]).ok,
    false
  );
  assert.equal(canReverseReferenceSplit([]).ok, false);
});
