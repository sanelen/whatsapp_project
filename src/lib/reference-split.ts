/**
 * Combined-payment reference splitting — pure decision logic (FR-2.13 gap:
 * "combined-payment splitting with an explicit operator decision").
 *
 * Owner rule (docs/roadmap/functionality/payments-bank-import.md): combined
 * room payments stay unmatched for operator review; the system never guesses
 * a unit. A split is therefore always an explicit operator action that
 * divides one pooled reference into per-unit child references. Children then
 * flow through the existing match → sign-off → deposit/credit machinery
 * unchanged; the parent stays as the bank-entry-linked audit row and leaves
 * the pool.
 */

export interface SplitParentSnapshot {
  id: string;
  amount: number;
  /** Property lock, if the import pipeline established one (e.g. account-mapped). */
  propertyId: string | null;
  unitId: string | null;
  signedOff: boolean;
  /** Set when this reference was already split. */
  splitAt: string | null;
  /** Set when this reference is itself a child of a split. */
  splitParentId: string | null;
}

export interface SplitAllocationInput {
  unitId: string;
  amount: number;
}

export interface SplitUnitSnapshot {
  id: string;
  propertyId: string;
}

export interface SplitChildPlan {
  unitId: string;
  propertyId: string;
  amount: number;
}

export type SplitPlanResult =
  | { ok: true; children: SplitChildPlan[] }
  | { ok: false; error: string };

function toCents(value: number): number {
  return Math.round(value * 100);
}

/**
 * Validates an operator-proposed split and returns the child plan.
 *
 * Rules:
 * - parent must be in the pool: unmatched, not signed off, not already split,
 *   and not itself a split child;
 * - at least two allocations, each to a known unit, each amount > 0 at cent
 *   precision, units distinct;
 * - allocations must consume the parent amount exactly (strict sum — surplus
 *   or shortfall handling happens later via the existing partial/overpaid and
 *   held-credit rules on each child);
 * - if the parent carries a property lock, every unit must belong to it.
 */
export function planReferenceSplit(
  parent: SplitParentSnapshot,
  allocations: SplitAllocationInput[],
  unitsById: Map<string, SplitUnitSnapshot>
): SplitPlanResult {
  if (parent.unitId) {
    return { ok: false, error: 'Only unmatched pool references can be split' };
  }
  if (parent.signedOff) {
    return { ok: false, error: 'Signed-off references cannot be split' };
  }
  if (parent.splitAt) {
    return { ok: false, error: 'Reference has already been split' };
  }
  if (parent.splitParentId) {
    return { ok: false, error: 'Split children cannot be split again' };
  }
  if (!Array.isArray(allocations) || allocations.length < 2) {
    return { ok: false, error: 'A split needs at least two allocations' };
  }

  const seenUnits = new Set<string>();
  const children: SplitChildPlan[] = [];
  let allocatedCents = 0;

  for (const allocation of allocations) {
    const unitId = allocation.unitId?.trim();
    if (!unitId) {
      return { ok: false, error: 'Every allocation needs a unit' };
    }
    if (seenUnits.has(unitId)) {
      return { ok: false, error: 'Each unit may appear only once in a split' };
    }
    seenUnits.add(unitId);

    const unit = unitsById.get(unitId);
    if (!unit) {
      return { ok: false, error: 'Allocation references an unknown unit' };
    }
    if (parent.propertyId && unit.propertyId !== parent.propertyId) {
      return { ok: false, error: 'Reference is locked to a property; all units must belong to it' };
    }

    const cents = toCents(allocation.amount);
    if (!Number.isFinite(allocation.amount) || cents <= 0) {
      return { ok: false, error: 'Every allocation amount must be greater than zero' };
    }

    allocatedCents += cents;
    children.push({ unitId, propertyId: unit.propertyId, amount: cents / 100 });
  }

  const parentCents = toCents(parent.amount);
  if (allocatedCents !== parentCents) {
    const diff = (parentCents - allocatedCents) / 100;
    return {
      ok: false,
      error:
        diff > 0
          ? `Allocations fall short of the reference amount by R${diff.toFixed(2)}`
          : `Allocations exceed the reference amount by R${Math.abs(diff).toFixed(2)}`,
    };
  }

  return { ok: true, children };
}

/**
 * A split may be reversed only while every child is still untouched —
 * unmatched and not signed off. Matched or signed-off children must be
 * reversed individually first (existing reverse flows), keeping the audit
 * trail intact.
 */
export function canReverseReferenceSplit(
  children: Array<{ unitId: string | null; signedOff: boolean }>
): { ok: true } | { ok: false; error: string } {
  if (children.length === 0) {
    return { ok: false, error: 'No split children found for this reference' };
  }
  const touched = children.some((child) => child.unitId !== null || child.signedOff);
  if (touched) {
    return {
      ok: false,
      error: 'Reverse or unmatch every child reference before reversing the split',
    };
  }
  return { ok: true };
}
