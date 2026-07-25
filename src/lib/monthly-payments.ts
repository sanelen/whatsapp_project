import { getSupabaseAdmin } from '@/lib/supabase';
import { getBillingPeriodForDate, getBillingWindowForPeriod } from '@/lib/bank-import';
import { ensurePaymentPeriodsForPeriod } from '@/lib/monthly-payments-ops';
import {
  computeUnitStatus,
  type ComputedUnitStatus,
  type UnitTableStatus,
} from '@/lib/monthly-payment-status';

export type MonthlyPaymentsOrganizationRow = {
  id: string;
  name: string;
};

export type MonthlyPaymentsPropertyRow = {
  id: string;
  organization_id: string;
  name: string;
  location: string;
};

export type MonthlyPaymentsUnitRow = {
  id: string;
  property_id: string;
  label: string;
  rent_amount: number | string;
  occupancy_status: 'occupied' | 'vacant';
  is_blocked: boolean;
};

export type MonthlyPaymentsPeriodRow = {
  id: string;
  unit_id: string;
  period_start: string;
  expected_amount: number | string;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue' | 'blocked' | 'mismatch';
  is_blocked: boolean;
};

export type MonthlyPaymentsReferenceRow = {
  id: string;
  organization_id: string;
  property_id: string | null;
  unit_id: string | null;
  unit_payment_period_id: string | null;
  bank_import_entry_id?: string | null;
  inferred_location_name?: string | null;
  reference: string;
  amount: number | string;
  received_at: string;
  signed_off: boolean;
};

export type MonthlyPaymentsMonthSummary = {
  key: string;
  label: string;
  collectedAmount: number;
  expectedAmount: number;
  collectionRate: number;
  /** Matched-to-unit money / expected. Operator-facing progress, includes pending sign-off. */
  coverageRate: number;
  isCurrent: boolean;
  rollingTotal: {
    collectedAmount: number;
    matchedCollectedAmount: number;
    signedOffCollectedAmount: number;
    pendingCollectedAmount: number;
    /** Money that arrived in the window but is not yet matched to any unit (incl. propertyless imports). */
    unmatchedCollectedAmount: number;
    expectedAmount: number;
    collectionRate: number;
    /** Matched-to-unit money / expected. Operator-facing progress, includes pending sign-off. */
    coverageRate: number;
    occupiedCount: number;
    blockedCount: number;
    overdueCount: number;
    paidCount: number;
    pendingCount: number;
    dueCount: number;
  };
  locations: MonthlyPaymentsLocationSummary[];
  unmatchedReferenceCount: number;
};

export type MonthlyPaymentsLocationSummary = {
  id: string;
  name: string;
  location: string;
  collectedAmount: number;
  matchedCollectedAmount: number;
  /** Matched money that has been signed off — the decision-grade collected number. */
  signedOffCollectedAmount: number;
  /** Matched money still awaiting operator sign-off. */
  pendingCollectedAmount: number;
  unmatchedCollectedAmount: number;
  expectedAmount: number;
  /** Signed-off collected / expected (paid = signed-off only). */
  collectionRate: number;
  /** Matched-to-unit money / expected. Operator-facing progress, includes pending sign-off. */
  coverageRate: number;
  occupiedCount: number;
  paidCount: number;
  /** Units fully covered but awaiting sign-off. */
  pendingCount: number;
  dueCount: number;
  overdueCount: number;
  blockedCount: number;
  unitCount: number;
  unmatchedReferenceCount: number;
};

export type MonthlyPaymentsDashboardSnapshot = {
  setupState: 'ready' | 'empty' | 'missing_tables';
  organizationLabel: string;
  monthLabel: string;
  recentMonths: MonthlyPaymentsMonthSummary[];
  rollingTotal: {
    collectedAmount: number;
    matchedCollectedAmount: number;
    signedOffCollectedAmount: number;
    pendingCollectedAmount: number;
    unmatchedCollectedAmount: number;
    expectedAmount: number;
    collectionRate: number;
    coverageRate: number;
    occupiedCount: number;
    blockedCount: number;
    overdueCount: number;
    paidCount: number;
    pendingCount: number;
    dueCount: number;
  };
  locations: MonthlyPaymentsLocationSummary[];
  unmatchedReferenceCount: number;
};

type MonthlyPaymentsSnapshotInput = {
  organizations: MonthlyPaymentsOrganizationRow[];
  properties: MonthlyPaymentsPropertyRow[];
  units: MonthlyPaymentsUnitRow[];
  periods: MonthlyPaymentsPeriodRow[];
  references: MonthlyPaymentsReferenceRow[];
  depositContributedByReference?: Record<string, number>;
  creditFromReference?: Record<string, number>;
  creditAppliedByPeriod?: Record<string, number>;
};

export { computeUnitStatus, type ComputedUnitStatus, type UnitTableStatus } from '@/lib/monthly-payment-status';

export {
  computeDepositSplitSuggestion,
  computeCreditAllocationOptions,
  roundMoney,
  type DepositSplitSuggestion,
  type CreditAllocationOptions,
} from '@/lib/payment-allocation';
import {
  computeDepositSplitSuggestion,
  computeCreditAllocationOptions,
  roundMoney,
  shiftPeriodStart,
  type DepositSplitSuggestion,
  type CreditAllocationOptions,
} from '@/lib/payment-allocation';

export type UnitTableMatchRule = {
  id: string;
  matcherType:
    | 'reference_contains'
    | 'reference_equals'
    | 'reference_regex'
    | 'payer_name_contains'
    | 'amount_equals';
  matcherValue: string;
  amountValue: number | null;
  isActive: boolean;
};

function toMonthStart(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), 1));
}

function addMonths(input: Date, offset: number): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth() + offset, 1));
}

function formatMonthKey(input: Date): string {
  return input.toISOString().slice(0, 7);
}

function formatMonthLabel(input: Date): string {
  return new Intl.DateTimeFormat('en-ZA', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(input);
}

function toMoney(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOnlyMonthKey(value: string): string {
  return value.slice(0, 7);
}

function billingPeriodKeyForReferenceDate(value: string): string {
  try {
    return getBillingPeriodForDate(value);
  } catch {
    return toDateOnlyMonthKey(value);
  }
}

function buildMonthStarts(currentMonthStart: Date): Date[] {
  return Array.from({ length: 6 }, (_, index) => addMonths(currentMonthStart, index - 3));
}

export function buildMonthlyPaymentsDashboardSnapshot(
  input: MonthlyPaymentsSnapshotInput,
  options?: { currentDate?: Date; setupState?: MonthlyPaymentsDashboardSnapshot['setupState'] }
): MonthlyPaymentsDashboardSnapshot {
  const currentDate = options?.currentDate ?? new Date();
  const currentBillingPeriodKey = getBillingPeriodForDate(currentDate.toISOString().slice(0, 10));
  const currentMonthStart = new Date(`${currentBillingPeriodKey}-01T00:00:00Z`);
  const currentMonthKey = formatMonthKey(currentMonthStart);
  const monthStarts = buildMonthStarts(currentMonthStart);
  const properties = input.properties;
  const unitsByProperty = new Map<string, MonthlyPaymentsUnitRow[]>();
  const periodsByUnitAndMonth = new Map<string, MonthlyPaymentsPeriodRow>();
  const referencesByPeriod = new Map<string, MonthlyPaymentsReferenceRow[]>();
  const referencesByPropertyAndMonth = new Map<string, MonthlyPaymentsReferenceRow[]>();
  const referencesByMonth = new Map<string, MonthlyPaymentsReferenceRow[]>();
  const referencesByInferredLocationAndMonth = new Map<string, MonthlyPaymentsReferenceRow[]>();
  const referencesByUnitAndMonth = new Map<string, MonthlyPaymentsReferenceRow[]>();

  for (const unit of input.units) {
    const current = unitsByProperty.get(unit.property_id) ?? [];
    current.push(unit);
    unitsByProperty.set(unit.property_id, current);
  }

  for (const period of input.periods) {
    periodsByUnitAndMonth.set(`${period.unit_id}:${toDateOnlyMonthKey(period.period_start)}`, period);
  }

  for (const reference of input.references) {
    const monthKey = billingPeriodKeyForReferenceDate(reference.received_at);
    const monthReferences = referencesByMonth.get(monthKey) ?? [];
    monthReferences.push(reference);
    referencesByMonth.set(monthKey, monthReferences);

    if (!reference.property_id && reference.inferred_location_name) {
      const inferredLocationKey = `${reference.inferred_location_name}:${monthKey}`;
      const inferredLocationReferences = referencesByInferredLocationAndMonth.get(inferredLocationKey) ?? [];
      inferredLocationReferences.push(reference);
      referencesByInferredLocationAndMonth.set(inferredLocationKey, inferredLocationReferences);
    }

    if (reference.property_id) {
      const propertyMonthKey = `${reference.property_id}:${monthKey}`;
      const propertyMonthReferences = referencesByPropertyAndMonth.get(propertyMonthKey) ?? [];
      propertyMonthReferences.push(reference);
      referencesByPropertyAndMonth.set(propertyMonthKey, propertyMonthReferences);
    }

    if (reference.unit_id) {
      const unitMonthKey = `${reference.unit_id}:${monthKey}`;
      const unitMonthReferences = referencesByUnitAndMonth.get(unitMonthKey) ?? [];
      unitMonthReferences.push(reference);
      referencesByUnitAndMonth.set(unitMonthKey, unitMonthReferences);
    }

    if (!reference.unit_payment_period_id) continue;
    const current = referencesByPeriod.get(reference.unit_payment_period_id) ?? [];
    current.push(reference);
    referencesByPeriod.set(reference.unit_payment_period_id, current);
  }
  function buildLocationsForMonth(monthKey: string): MonthlyPaymentsLocationSummary[] {
    const propertyLocations = properties.map((property) => {
      const units = unitsByProperty.get(property.id) ?? [];
      const propertyReferences = referencesByPropertyAndMonth.get(`${property.id}:${monthKey}`) ?? [];
      const matchedPropertyReferences = propertyReferences.filter((reference) => Boolean(reference.unit_id));
      const unmatchedPropertyReferences = propertyReferences.filter((reference) => !reference.unit_id);
      let expectedAmount = 0;
      let occupiedCount = 0;
      let blockedCount = 0;
      let overdueCount = 0;
      let paidCount = 0;
      let pendingCount = 0;
      let dueCount = 0;

      for (const unit of units) {
        const period = periodsByUnitAndMonth.get(`${unit.id}:${monthKey}`);
        const matchedReferences = referencesByUnitAndMonth.get(`${unit.id}:${monthKey}`) ?? [];
        const depositContributedAmount = matchedReferences.reduce(
          (sum, reference) => sum + (input.depositContributedByReference?.[reference.id] ?? 0),
          0
        );
        const creditFromMatchedReferencesAmount = matchedReferences.reduce(
          (sum, reference) => sum + (input.creditFromReference?.[reference.id] ?? 0),
          0
        );
        const isBlocked = period?.is_blocked ?? unit.is_blocked;
        const expected = isBlocked
          ? 0
          : toMoney(
              period?.expected_amount ?? (unit.occupancy_status === 'occupied' ? unit.rent_amount : 0)
            );
        const status = computeUnitStatus({
          occupancyStatus: unit.occupancy_status,
          isBlocked,
          expectedAmount: expected,
          depositContributedAmount,
          creditFromMatchedReferencesAmount,
          creditAppliedAmount: period ? (input.creditAppliedByPeriod?.[period.id] ?? 0) : 0,
          matchedReferences,
          dueDate: getBillingWindowForPeriod(monthKey).endDate,
          now: currentDate,
        }).status;

        expectedAmount += expected;

        if (isBlocked || status === 'blocked') {
          blockedCount += 1;
        } else if (unit.occupancy_status === 'occupied') {
          occupiedCount += 1;
        }

        if (status === 'paid') paidCount += 1;
        if (status === 'pending') pendingCount += 1;
        if (status === 'overdue') overdueCount += 1;
        if (status !== 'paid' && status !== 'pending' && status !== 'blocked') dueCount += 1;
      }

      const matchedCollectedAmount = matchedPropertyReferences.reduce(
        (sum, reference) => sum + toMoney(reference.amount),
        0
      );
      // Decision rule (owner, 2026-07-02): collection progress counts
      // signed-off money only; matched-awaiting-sign-off stays visible as its
      // own number instead of inflating "collected".
      const signedOffCollectedAmount = matchedPropertyReferences
        .filter((reference) => reference.signed_off)
        .reduce((sum, reference) => sum + toMoney(reference.amount), 0);
      const pendingCollectedAmount = matchedCollectedAmount - signedOffCollectedAmount;
      const unmatchedCollectedAmount = unmatchedPropertyReferences.reduce(
        (sum, reference) => sum + toMoney(reference.amount),
        0
      );
      const collectedAmount = matchedCollectedAmount + unmatchedCollectedAmount;

      return {
        id: property.id,
        name: property.name,
        location: property.location,
        collectedAmount,
        matchedCollectedAmount,
        signedOffCollectedAmount,
        pendingCollectedAmount,
        unmatchedCollectedAmount,
        expectedAmount,
        collectionRate: expectedAmount > 0 ? signedOffCollectedAmount / expectedAmount : 0,
        coverageRate: expectedAmount > 0 ? matchedCollectedAmount / expectedAmount : 0,
        occupiedCount,
        paidCount,
        pendingCount,
        dueCount,
        overdueCount,
        blockedCount,
        unitCount: units.length,
        unmatchedReferenceCount: unmatchedPropertyReferences.length,
      };
    });

    const inferredLocationNames = Array.from(
      new Set(
        (referencesByMonth.get(monthKey) ?? [])
          .filter((reference) => !reference.property_id && reference.inferred_location_name)
          .map((reference) => reference.inferred_location_name as string)
      )
    );

    const inferredLocations = inferredLocationNames.map((name) => {
      const references = referencesByInferredLocationAndMonth.get(`${name}:${monthKey}`) ?? [];
      const collectedAmount = references.reduce((sum, reference) => sum + toMoney(reference.amount), 0);

      return {
        id: `inferred:${name}`,
        name,
        location: 'Imported bank references',
        collectedAmount,
        matchedCollectedAmount: 0,
        signedOffCollectedAmount: 0,
        pendingCollectedAmount: 0,
        unmatchedCollectedAmount: collectedAmount,
        expectedAmount: 0,
        collectionRate: 0,
        coverageRate: 0,
        occupiedCount: 0,
        paidCount: 0,
        pendingCount: 0,
        dueCount: references.length,
        overdueCount: 0,
        blockedCount: 0,
        unitCount: 0,
        unmatchedReferenceCount: references.length,
      };
    });

    return [...propertyLocations, ...inferredLocations].sort((left, right) => right.expectedAmount - left.expectedAmount);
  }

  const recentMonths = monthStarts.map((monthStart) => {
    const monthKey = formatMonthKey(monthStart);
    const locations = buildLocationsForMonth(monthKey);
    const rollingTotal = locations.reduce(
      (summary, location) => ({
        collectedAmount: summary.collectedAmount + location.collectedAmount,
        matchedCollectedAmount: summary.matchedCollectedAmount + location.matchedCollectedAmount,
        signedOffCollectedAmount: summary.signedOffCollectedAmount + location.signedOffCollectedAmount,
        pendingCollectedAmount: summary.pendingCollectedAmount + location.pendingCollectedAmount,
        expectedAmount: summary.expectedAmount + location.expectedAmount,
        occupiedCount: summary.occupiedCount + location.occupiedCount,
        blockedCount: summary.blockedCount + location.blockedCount,
        overdueCount: summary.overdueCount + location.overdueCount,
        paidCount: summary.paidCount + location.paidCount,
        pendingCount: summary.pendingCount + location.pendingCount,
        dueCount: summary.dueCount + location.dueCount,
      }),
      {
        collectedAmount: 0,
        matchedCollectedAmount: 0,
        signedOffCollectedAmount: 0,
        pendingCollectedAmount: 0,
        expectedAmount: 0,
        occupiedCount: 0,
        blockedCount: 0,
        overdueCount: 0,
        paidCount: 0,
        pendingCount: 0,
        dueCount: 0,
      }
    );

    const unmatchedPropertylessCollectedAmount = (referencesByMonth.get(monthKey) ?? [])
      .filter((reference) => !reference.property_id && !reference.inferred_location_name)
      .reduce((sum, reference) => sum + toMoney(reference.amount), 0);

    const unmatchedReferenceCount = input.references.filter(
      (reference) =>
        billingPeriodKeyForReferenceDate(reference.received_at) === monthKey && !reference.unit_payment_period_id
    ).length;

    return {
      key: monthKey,
      label: new Intl.DateTimeFormat('en-ZA', {
        month: 'short',
        timeZone: 'UTC',
      }).format(monthStart),
      collectedAmount: rollingTotal.collectedAmount + unmatchedPropertylessCollectedAmount,
      expectedAmount: rollingTotal.expectedAmount,
      // Decision rule: collection progress = signed-off money / expected.
      // Total money arrived (incl. unmatched) stays visible via collectedAmount.
      collectionRate:
        rollingTotal.expectedAmount > 0
          ? rollingTotal.signedOffCollectedAmount / rollingTotal.expectedAmount
          : 0,
      // Operator-facing month progress = money already worked into unit rows,
      // even if some of it is still awaiting sign-off.
      coverageRate:
        rollingTotal.expectedAmount > 0
          ? rollingTotal.matchedCollectedAmount / rollingTotal.expectedAmount
          : 0,
      isCurrent: monthKey === currentMonthKey,
      rollingTotal: {
        ...rollingTotal,
        collectedAmount: rollingTotal.collectedAmount + unmatchedPropertylessCollectedAmount,
        // Every rand that arrived is either signed off, awaiting sign-off, or
        // unmatched — nothing may become invisible (owner report 2026-07-02).
        unmatchedCollectedAmount: roundMoney(
          rollingTotal.collectedAmount +
            unmatchedPropertylessCollectedAmount -
            rollingTotal.signedOffCollectedAmount -
            rollingTotal.pendingCollectedAmount
        ),
        collectionRate:
          rollingTotal.expectedAmount > 0
            ? rollingTotal.signedOffCollectedAmount / rollingTotal.expectedAmount
            : 0,
        coverageRate:
          rollingTotal.expectedAmount > 0
            ? rollingTotal.matchedCollectedAmount / rollingTotal.expectedAmount
            : 0,
      },
      locations,
      unmatchedReferenceCount,
    };
  });

  const selectedMonth = recentMonths.find((month) => month.key === currentMonthKey) ?? recentMonths.at(2);
  const rollingTotal = selectedMonth?.rollingTotal ?? {
    collectedAmount: 0,
    matchedCollectedAmount: 0,
    signedOffCollectedAmount: 0,
    pendingCollectedAmount: 0,
    unmatchedCollectedAmount: 0,
    expectedAmount: 0,
    collectionRate: 0,
    coverageRate: 0,
    occupiedCount: 0,
    blockedCount: 0,
    overdueCount: 0,
    paidCount: 0,
    pendingCount: 0,
    dueCount: 0,
  };
  const locations = selectedMonth?.locations ?? [];
  const unmatchedReferenceCount = selectedMonth?.unmatchedReferenceCount ?? 0;

  return {
    setupState: options?.setupState ?? (properties.length === 0 ? 'empty' : 'ready'),
    organizationLabel:
      input.organizations.length === 1
        ? input.organizations[0].name
        : input.organizations.length > 1
          ? 'Hamba operations'
          : 'Hamba Trading',
    monthLabel: formatMonthLabel(currentMonthStart),
    recentMonths,
    rollingTotal,
    locations,
    unmatchedReferenceCount,
  };
}

export async function readMonthlyPaymentsDashboard(): Promise<MonthlyPaymentsDashboardSnapshot> {
  const admin = getSupabaseAdmin();
  const currentBillingPeriodKey = getBillingPeriodForDate(new Date().toISOString().slice(0, 10));
  const currentMonthStart = new Date(`${currentBillingPeriodKey}-01T00:00:00Z`);
  await ensurePaymentPeriodsForPeriod({ periodKey: formatMonthKey(currentMonthStart) });
  const historyStart = addMonths(currentMonthStart, -5).toISOString().slice(0, 10);

  const [organizationsResult, propertiesResult, unitsResult, periodsResult, referencesResult] =
    await Promise.all([
      admin.from('organizations').select('id,name').order('created_at', { ascending: true }),
      admin
        .from('properties')
        .select('id,organization_id,name,location')
        .order('created_at', { ascending: true }),
      admin
        .from('property_units')
        .select('id,property_id,label,rent_amount,occupancy_status,is_blocked')
        .order('display_order', { ascending: true }),
      admin
        .from('unit_payment_periods')
        .select('id,unit_id,period_start,expected_amount,status,is_blocked')
        .gte('period_start', historyStart),
      admin
        .from('payment_references')
        .select('id,organization_id,property_id,unit_id,unit_payment_period_id,bank_import_entry_id,reference,amount,received_at,signed_off')
        .gte('received_at', historyStart),
    ]);

  const tableErrors = [unitsResult.error, periodsResult.error, referencesResult.error].filter(Boolean);
  if (tableErrors.some((error) => error?.code === '42P01')) {
    return buildMonthlyPaymentsDashboardSnapshot(
      {
        organizations: organizationsResult.data ?? [],
        properties: propertiesResult.data ?? [],
        units: [],
        periods: [],
        references: [],
      },
      { setupState: 'missing_tables' }
    );
  }

  if (organizationsResult.error) {
    throw new Error(`Failed to load organizations: ${organizationsResult.error.message}`);
  }
  if (propertiesResult.error) {
    throw new Error(`Failed to load properties: ${propertiesResult.error.message}`);
  }
  if (unitsResult.error) {
    throw new Error(`Failed to load property units: ${unitsResult.error.message}`);
  }
  if (periodsResult.error) {
    throw new Error(`Failed to load unit payment periods: ${periodsResult.error.message}`);
  }
  if (referencesResult.error) {
    throw new Error(`Failed to load payment references: ${referencesResult.error.message}`);
  }

  const references = (referencesResult.data ?? []) as MonthlyPaymentsReferenceRow[];
  const referenceIds = references.map((reference) => reference.id);
  const periodIds = (periodsResult.data ?? []).map((period) => period.id as string);
  const [contributionsResult, creditsResult, allocationsResult] = await Promise.all([
    referenceIds.length > 0
      ? admin
          .from('deposit_contributions')
          .select('payment_reference_id,amount')
          .in('payment_reference_id', referenceIds)
          .is('reversed_at', null)
      : Promise.resolve({ data: [], error: null }),
    referenceIds.length > 0
      ? admin
          .from('unit_credits')
          .select('payment_reference_id,amount')
          .in('payment_reference_id', referenceIds)
          .is('reversed_at', null)
      : Promise.resolve({ data: [], error: null }),
    periodIds.length > 0
      ? admin
          .from('unit_credit_allocations')
          .select('target_period_id,amount,destination')
          .in('target_period_id', periodIds)
          .in('destination', ['arrears', 'advance'])
          .is('reversed_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const ledgerErrors = [contributionsResult.error, creditsResult.error, allocationsResult.error]
    .filter((error) => error && !isMissingRelation(error));
  if (ledgerErrors.length > 0) {
    throw new Error(`Failed to load payment allocation ledgers: ${ledgerErrors[0]?.message}`);
  }
  const depositContributedByReference: Record<string, number> = {};
  for (const row of contributionsResult.data ?? []) {
    const referenceId = row.payment_reference_id as string | null;
    if (!referenceId) continue;
    depositContributedByReference[referenceId] = roundMoney(
      (depositContributedByReference[referenceId] ?? 0) + toMoney(row.amount as number | string)
    );
  }
  const creditFromReference: Record<string, number> = {};
  for (const row of creditsResult.data ?? []) {
    const referenceId = row.payment_reference_id as string | null;
    if (!referenceId) continue;
    creditFromReference[referenceId] = roundMoney(
      (creditFromReference[referenceId] ?? 0) + toMoney(row.amount as number | string)
    );
  }
  const creditAppliedByPeriod: Record<string, number> = {};
  for (const row of allocationsResult.data ?? []) {
    const periodId = row.target_period_id as string | null;
    if (!periodId) continue;
    creditAppliedByPeriod[periodId] = roundMoney(
      (creditAppliedByPeriod[periodId] ?? 0) + toMoney(row.amount as number | string)
    );
  }
  const unresolvedBankImportEntryIds = references
    .filter((reference) => !reference.property_id && reference.bank_import_entry_id)
    .map((reference) => reference.bank_import_entry_id as string);

  const inferredLocationNamesByEntryId = new Map<string, string>();
  if (unresolvedBankImportEntryIds.length > 0) {
    const { data: bankImportEntries, error: bankImportEntriesError } = await admin
      .from('bank_import_entries')
      .select('id,raw_metadata')
      .in('id', unresolvedBankImportEntryIds);

    if (bankImportEntriesError) {
      throw new Error(`Failed to load bank import entry metadata: ${bankImportEntriesError.message}`);
    }

    for (const entry of bankImportEntries ?? []) {
      const propertyName =
        typeof entry.raw_metadata?.propertyName === 'string' ? entry.raw_metadata.propertyName.trim() : '';
      if (propertyName) {
        inferredLocationNamesByEntryId.set(entry.id, propertyName);
      }
    }
  }

  return buildMonthlyPaymentsDashboardSnapshot({
    organizations: organizationsResult.data ?? [],
    properties: propertiesResult.data ?? [],
    units: unitsResult.data ?? [],
    periods: periodsResult.data ?? [],
    depositContributedByReference,
    creditFromReference,
    creditAppliedByPeriod,
    references: references.map((reference) => ({
      ...reference,
      inferred_location_name:
        !reference.property_id && reference.bank_import_entry_id
          ? inferredLocationNamesByEntryId.get(reference.bank_import_entry_id) ?? null
          : null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Per-unit table (match & sign-off view) — Hamba Trading › <property> › Units
// ---------------------------------------------------------------------------

export type UnitTableRow = {
  unitId: string;
  label: string;
  occupancy: 'occupied' | 'vacant';
  contacts: string[];
  expectedAmount: number;
  expectedReference: string;
  matchKeywords: string[];
  matchRules: UnitTableMatchRule[];
  periodId: string | null;
  reference: string | null;
  referenceId: string | null;
  referencePayerName: string | null;
  referenceAccountSuffix: string | null;
  transactionDate: string | null;
  /** Every bank reference contributing to this unit-month, shown individually. */
  matchedReferences: Array<{
    id: string;
    reference: string;
    payerName: string | null;
    accountSuffix: string | null;
    transactionDate: string | null;
    amount: number;
    signedOff: boolean;
  }>;
  /** Matched bank references for this room across the selected month and two prior billing months. */
  recentPayments: Array<{
    id: string;
    periodStart: string | null;
    reference: string;
    payerName: string | null;
    accountSuffix: string | null;
    transactionDate: string | null;
    amount: number;
    rentAmount: number;
    depositAmount: number;
    creditAmount: number;
    signedOff: boolean;
  }>;
  receivedAmount: number | null;
  signedOff: boolean;
  locked: boolean;
  status: UnitTableStatus;
  overdueDays: number | null;
  outstandingAmount: number | null;
  depositAmount: number;
  /** Running deposit-ledger balance for this unit (all periods, non-reversed). */
  depositBalance: number;
  /** Deposit amount accepted out of this period's matched references. */
  depositContributedAmount: number;
  depositSplit: DepositSplitSuggestion | null;
  /** Held surplus credit (FR-2.8 rulings 2026-07-03): credits − allocations. */
  creditBalance: number;
  /** Remaining held-credit source payments after active allocations are consumed. */
  heldCreditSources: Array<{
    referenceId: string | null;
    reference: string;
    transactionDate: string | null;
    amount: number;
    sourcePaymentAmount: number | null;
  }>;
  /** Credit applied to THIS period via arrears/advance allocations. */
  creditAppliedAmount: number;
  /** Amount from this period's matched references moved into the credit ledger. */
  creditFromMatchedReferencesAmount: number;
  /** Choices shown before an overpayment is signed off. */
  overpaymentOptions: CreditAllocationOptions | null;
  /** Allocation destinations available right now (null when no credit held). */
  creditOptions: CreditAllocationOptions | null;
  /** Active (non-reversed) allocations for the reverse action. */
  creditAllocations: Array<{
    id: string;
    amount: number;
    destination: 'current' | 'arrears' | 'advance' | 'deposit';
    targetPeriodStart: string | null;
    createdAt: string | null;
    sourcePayments: Array<{
      referenceId: string | null;
      reference: string;
      transactionDate: string | null;
      amount: number;
      sourcePaymentAmount: number | null;
    }>;
  }>;
  depositLifecycle: {
    mode: 'occupancy' | 'legacy';
    occupancyId: string | null;
    status: 'holding' | 'active' | 'notice' | 'ended' | null;
    startsOn: string | null;
    endsOn: string | null;
    closedAt: string | null;
    tenantDisplayName: string | null;
    depositTargetAmount: number;
    depositBalance: number;
    previousOccupancyCount: number;
    previousOccupancies: Array<{
      id: string;
      status: 'holding' | 'active' | 'notice' | 'ended';
      startsOn: string | null;
      endsOn: string | null;
      closedAt: string | null;
      depositTargetAmount: number;
      depositBalance: number;
    }>;
  };
};

export type ReferencePoolRow = {
  id: string;
  reference: string;
  amount: number;
  transactionDate: string;
  accountSuffix: string | null;
  payerName: string | null;
  signedOff: boolean;
};

export type PropertyUnitsTable = {
  setupState: 'ready' | 'no_units' | 'missing_tables';
  organizationLabel: string;
  propertyId: string;
  propertyName: string;
  periodKey: string;
  periodLabel: string;
  billingWindowLabel: string;
  activityHint: string | null;
  rows: UnitTableRow[];
  referencePool: ReferencePoolRow[];
  totals: {
    unitCount: number;
    blockedCount: number;
    paidCount: number;
    /** Units fully covered but awaiting sign-off — action: sign off, don't chase. */
    pendingCount: number;
    dueCount: number;
    overdueCount: number;
    /** Signed-off money only (decision-grade collected). */
    collected: number;
    /** Matched money still awaiting sign-off. */
    pendingAmount: number;
    /** Rent still owed across partial rows. */
    outstandingAmount: number;
    expected: number;
    unmatchedCount: number;
    unmatchedAmount: number;
  };
};

export type ReferencePoolViewRow = {
  id: string;
  reference: string;
  amount: number;
  transactionDate: string;
  accountSuffix: string | null;
  payerName: string | null;
  propertyId: string | null;
  propertyName: string;
  signedOff: boolean;
};

export type ReferencePoolLocationSummary = {
  id: string;
  name: string;
  propertyId: string | null;
  referenceCount: number;
  totalAmount: number;
};

export type ReferencePoolView = {
  setupState: 'ready' | 'missing_tables';
  organizationLabel: string;
  periodKey: string;
  periodLabel: string;
  billingWindowLabel: string;
  rows: ReferencePoolViewRow[];
  locations: ReferencePoolLocationSummary[];
  totals: {
    unmatchedCount: number;
    totalAmount: number;
  };
};

export type LocationsAdminCard = {
  propertyId: string;
  name: string;
  location: string;
  unitCount: number;
  occupiedCount: number;
  vacantCount: number;
  blockedCount: number;
  coveredUnitCount: number;
  expectedAmount: number;
  collectedAmount: number;
  accountSuffixes: string[];
};

export type MonthlyPaymentsLocationsView = {
  setupState: 'ready' | 'missing_tables';
  organizationLabel: string;
  periodKey: string;
  periodLabel: string;
  billingWindowLabel: string;
  cards: LocationsAdminCard[];
};

export type RoomManagerRule = {
  id: string;
  matcherType: 'reference_contains' | 'reference_equals' | 'reference_regex' | 'payer_name_contains' | 'amount_equals';
  matcherValue: string;
  amountValue: number | null;
  priority: number;
  label: string;
  isActive: boolean;
};

export type RoomManagerRoomRow = {
  unitId: string;
  label: string;
  contactPrimary: string;
  contactSecondary: string;
  contacts: string[];
  rentAmount: number;
  depositAmount: number;
  occupancy: 'occupied' | 'vacant';
  isBlocked: boolean;
  isAvailable: boolean;
  parking: string;
  ensuite: boolean;
  maxOccupants: number;
  features: string[];
  expectedReference: string;
  matchKeywords: string[];
  keywordCount: number;
  rules: RoomManagerRule[];
  photoCount: number;
  latestReference: string | null;
  stayLifecycleMode: 'occupancy' | 'legacy';
  currentStay: RoomManagerStay | null;
  stays: RoomManagerStay[];
};

export type RoomManagerStay = {
  id: string;
  status: 'holding' | 'active' | 'notice' | 'ended';
  tenantDisplayName: string;
  contactPrimary: string;
  contactSecondary: string;
  startsOn: string | null;
  endsOn: string | null;
  closedAt: string | null;
  depositTargetAmount: number;
  depositBalance: number;
  isCurrent: boolean;
};

export type RoomManagerView = {
  setupState: 'ready' | 'missing_tables';
  organizationLabel: string;
  propertyId: string;
  propertyName: string;
  locationLabel: string;
  periodKey: string;
  periodLabel: string;
  billingWindowLabel: string;
  summary: {
    roomCount: number;
    occupiedCount: number;
    vacantCount: number;
    blockedCount: number;
  };
  rooms: RoomManagerRoomRow[];
};

function transactionDateOnly(value: string | null | undefined, fallback: string | null | undefined) {
  if (value) return value.slice(0, 10);
  return fallback ?? null;
}

function formatDateShort(value: string) {
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return value;
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(ms));
}

function cleanContacts(...values: Array<string | null | undefined>): string[] {
  return values.map((value) => (value ?? '').trim()).filter(Boolean);
}

function stayDisplayContacts(stay: {
  tenant_display_name?: string | null;
  contact_primary?: string | null;
  contact_secondary?: string | null;
}) {
  const contacts = cleanContacts(stay.contact_primary, stay.contact_secondary);
  if (contacts.length > 0) return contacts;
  return cleanContacts(stay.tenant_display_name);
}

function diffDaysUtc(from: string, to: Date): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  if (Number.isNaN(fromMs)) return 0;
  return Math.floor((to.getTime() - fromMs) / 86_400_000);
}

// Resolve which billing month to show. The per-unit table now uses the same
// Hamba billing window as imports: 9th of previous month -> 8th of selected month.
function resolvePeriodKey(periodKey: string | undefined, now: Date): string {
  if (periodKey && /^\d{4}-\d{2}$/.test(periodKey)) return periodKey;
  return formatMonthKey(toMonthStart(now));
}

function isMissingRelation(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === '42703' || error?.code === 'PGRST205';
}

function formatMatcherLabel(matcherType: string, matcherValue: string, amountValue: number | string | null | undefined) {
  switch (matcherType) {
    case 'reference_equals':
      return `reference = ${matcherValue}`;
    case 'reference_regex':
      return `reference regex ${matcherValue}`;
    case 'payer_name_contains':
      return `payer contains ${matcherValue}`;
    case 'amount_equals':
      return `amount = R ${toMoney(amountValue).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    case 'reference_contains':
    default:
      return `reference contains ${matcherValue}`;
  }
}

type RoomUnitRecord = {
  id: string;
  property_id: string;
  label: string;
  contact_primary: string;
  contact_secondary: string;
  rent_amount: number | string;
  deposit_amount: number | string;
  occupancy_status: 'occupied' | 'vacant';
  is_blocked: boolean;
  parking: string;
  ensuite: boolean;
  max_occupants: number;
  is_available: boolean;
  features: string[];
  expected_reference: string;
  match_keywords: string[];
  display_order: number;
};

async function readRoomUnitRecords(propertyId: string): Promise<{ rows: RoomUnitRecord[]; setupState: 'ready' | 'missing_tables' }> {
  const admin = getSupabaseAdmin();
  const richResult = await admin
    .from('property_units')
    .select(
      'id,property_id,label,contact_primary,contact_secondary,rent_amount,deposit_amount,occupancy_status,is_blocked,parking,ensuite,max_occupants,is_available,features,expected_reference,match_keywords,display_order'
    )
    .eq('property_id', propertyId)
    .order('display_order', { ascending: true });

  if (!richResult.error) {
    return {
      setupState: 'ready',
      rows: (richResult.data ?? []) as RoomUnitRecord[],
    };
  }

  if (isMissingRelation(richResult.error)) {
    const fallbackResult = await admin
      .from('property_units')
      .select(
        'id,property_id,label,contact_primary,contact_secondary,rent_amount,occupancy_status,is_blocked,expected_reference,match_keywords,display_order'
      )
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true });

    if (fallbackResult.error) {
      if (isMissingRelation(fallbackResult.error)) {
        return { setupState: 'missing_tables', rows: [] };
      }
      throw new Error(`Failed to load property units: ${fallbackResult.error.message}`);
    }

    return {
      setupState: 'missing_tables',
      rows: (fallbackResult.data ?? []).map((unit) => ({
        ...unit,
        deposit_amount: 0,
        parking: '',
        ensuite: false,
        max_occupants: 1,
        is_available: unit.occupancy_status === 'vacant',
        features: [],
      })) as RoomUnitRecord[],
    };
  }

  throw new Error(`Failed to load property units: ${richResult.error.message}`);
}

export async function readMonthlyPaymentsLocations(
  options?: { currentDate?: Date }
): Promise<MonthlyPaymentsLocationsView> {
  const admin = getSupabaseAdmin();
  const now = options?.currentDate ?? new Date();
  const resolvedPeriodKey = resolvePeriodKey(undefined, now);
  await ensurePaymentPeriodsForPeriod({ periodKey: resolvedPeriodKey });
  const monthStart = new Date(`${resolvedPeriodKey}-01T00:00:00Z`);
  const periodLabel = formatMonthLabel(monthStart);
  const billingWindow = getBillingWindowForPeriod(resolvedPeriodKey);

  const [organizationsResult, propertiesResult, unitsResult, periodsResult, referencesResult, hintsResult, mappingsResult] =
    await Promise.all([
      admin.from('organizations').select('id,name').order('created_at', { ascending: true }).limit(1),
      admin.from('properties').select('id,name,location').order('created_at', { ascending: true }),
      admin
        .from('property_units')
        .select('id,property_id,occupancy_status,is_blocked,expected_reference,match_keywords')
        .order('display_order', { ascending: true }),
      admin
        .from('unit_payment_periods')
        .select('unit_id,expected_amount,is_blocked')
        .gte('period_start', `${resolvedPeriodKey}-01`)
        .lt('period_start', addMonths(monthStart, 1).toISOString().slice(0, 10)),
      admin
        .from('payment_references')
        .select('property_id,amount')
        .not('property_id', 'is', null)
        .gte('received_at', billingWindow.startDate)
        .lte('received_at', billingWindow.endDate),
      admin.from('bank_import_unit_match_hints').select('property_id,unit_id,is_active').eq('is_active', true),
      admin
        .from('bank_import_property_mappings')
        .select('property_id,account_number_suffix')
        .eq('is_active', true),
    ]);

  const tableErrors = [unitsResult.error, periodsResult.error, referencesResult.error, hintsResult.error, mappingsResult.error].filter(Boolean);
  if (tableErrors.some((error) => error?.code === '42P01')) {
    return {
      setupState: 'missing_tables',
      organizationLabel: organizationsResult.data?.[0]?.name ?? 'Hamba Trading',
      periodKey: resolvedPeriodKey,
      periodLabel,
      billingWindowLabel: billingWindowLabelFromRange(billingWindow.startDate, billingWindow.endDate),
      cards: [],
    };
  }

  if (organizationsResult.error) throw new Error(`Failed to load organizations: ${organizationsResult.error.message}`);
  if (propertiesResult.error) throw new Error(`Failed to load properties: ${propertiesResult.error.message}`);
  if (unitsResult.error) throw new Error(`Failed to load property units: ${unitsResult.error.message}`);
  if (periodsResult.error) throw new Error(`Failed to load unit payment periods: ${periodsResult.error.message}`);
  if (referencesResult.error) throw new Error(`Failed to load payment references: ${referencesResult.error.message}`);
  if (hintsResult.error) throw new Error(`Failed to load unit match hints: ${hintsResult.error.message}`);
  if (mappingsResult.error) throw new Error(`Failed to load property mappings: ${mappingsResult.error.message}`);

  const periodsByUnit = new Map<string, { expected_amount: number | string; is_blocked: boolean }>();
  for (const period of periodsResult.data ?? []) {
    periodsByUnit.set(period.unit_id as string, period as never);
  }

  const hintCountsByUnit = new Map<string, number>();
  for (const hint of hintsResult.data ?? []) {
    const key = hint.unit_id as string | null;
    if (!key) continue;
    hintCountsByUnit.set(key, (hintCountsByUnit.get(key) ?? 0) + 1);
  }

  const mappingSuffixesByProperty = new Map<string, string[]>();
  for (const mapping of mappingsResult.data ?? []) {
    const key = mapping.property_id as string | null;
    if (!key) continue;
    const list = mappingSuffixesByProperty.get(key) ?? [];
    list.push(mapping.account_number_suffix as string);
    mappingSuffixesByProperty.set(key, list);
  }

  const refsByProperty = new Map<string, number>();
  for (const reference of referencesResult.data ?? []) {
    const key = reference.property_id as string | null;
    if (!key) continue;
    refsByProperty.set(key, (refsByProperty.get(key) ?? 0) + toMoney(reference.amount as number | string));
  }

  const unitsByProperty = new Map<string, Array<{ id: string; occupancy_status: 'occupied' | 'vacant'; is_blocked: boolean; expected_reference: string; match_keywords: string[]; rent_amount?: number | string }>>();
  for (const unit of unitsResult.data ?? []) {
    const key = unit.property_id as string;
    const list = unitsByProperty.get(key) ?? [];
    list.push(unit as never);
    unitsByProperty.set(key, list);
  }

  const cards = (propertiesResult.data ?? []).map((property) => {
    const units = unitsByProperty.get(property.id as string) ?? [];
    let occupiedCount = 0;
    let vacantCount = 0;
    let blockedCount = 0;
    let coveredUnitCount = 0;
    let expectedAmount = 0;

    for (const unit of units) {
      const period = periodsByUnit.get(unit.id);
      const isBlocked = unit.is_blocked || (period?.is_blocked ?? false);
      if (unit.occupancy_status === 'occupied') occupiedCount += 1;
      if (unit.occupancy_status === 'vacant') vacantCount += 1;
      if (isBlocked) blockedCount += 1;

      const hasCoverage =
        Boolean(unit.expected_reference?.trim()) ||
        (unit.match_keywords?.length ?? 0) > 0 ||
        (hintCountsByUnit.get(unit.id) ?? 0) > 0;
      if (hasCoverage) coveredUnitCount += 1;

      if (!isBlocked && unit.occupancy_status === 'occupied') {
        expectedAmount += toMoney(period?.expected_amount ?? 0);
      }
    }

    return {
      propertyId: property.id as string,
      name: property.name as string,
      location: property.location as string,
      unitCount: units.length,
      occupiedCount,
      vacantCount,
      blockedCount,
      coveredUnitCount,
      expectedAmount,
      collectedAmount: refsByProperty.get(property.id as string) ?? 0,
      accountSuffixes: (mappingSuffixesByProperty.get(property.id as string) ?? []).sort(),
    };
  });

  return {
    setupState: 'ready',
    organizationLabel: organizationsResult.data?.[0]?.name ?? 'Hamba Trading',
    periodKey: resolvedPeriodKey,
    periodLabel,
    billingWindowLabel: billingWindowLabelFromRange(billingWindow.startDate, billingWindow.endDate),
    cards,
  };
}

export async function readRoomManagerView(
  propertyId: string,
  periodKey?: string,
  options?: { currentDate?: Date }
): Promise<RoomManagerView> {
  const admin = getSupabaseAdmin();
  const now = options?.currentDate ?? new Date();
  const resolvedPeriodKey = resolvePeriodKey(periodKey, now);
  const monthStart = new Date(`${resolvedPeriodKey}-01T00:00:00Z`);
  const periodLabel = formatMonthLabel(monthStart);
  const billingWindow = getBillingWindowForPeriod(resolvedPeriodKey);

  const [propertyResult, unitsPayload, hintsResult, referencesResult, mediaResult] = await Promise.all([
    admin
      .from('properties')
      .select('id,name,location, organizations(name)')
      .eq('id', propertyId)
      .maybeSingle<{ id: string; name: string; location: string; organizations: { name: string } | null }>(),
    readRoomUnitRecords(propertyId),
    admin
      .from('bank_import_unit_match_hints')
      .select('id,unit_id,matcher_type,matcher_value,amount_value,priority,is_active')
      .eq('property_id', propertyId)
      .order('priority', { ascending: true }),
    admin
      .from('payment_references')
      .select('id,unit_id,reference,received_at,transaction_at')
      .eq('property_id', propertyId)
      .not('unit_id', 'is', null)
      .gte('received_at', billingWindow.startDate)
      .lte('received_at', billingWindow.endDate)
      .order('received_at', { ascending: false }),
    admin.from('property_media').select('id,unit_id').eq('property_id', propertyId),
  ]);

  if (propertyResult.error) throw new Error(`Failed to load property: ${propertyResult.error.message}`);
  if (hintsResult.error && !isMissingRelation(hintsResult.error)) throw new Error(`Failed to load match hints: ${hintsResult.error.message}`);
  if (referencesResult.error && !isMissingRelation(referencesResult.error)) throw new Error(`Failed to load payment references: ${referencesResult.error.message}`);
  if (mediaResult.error && !isMissingRelation(mediaResult.error)) throw new Error(`Failed to load property media: ${mediaResult.error.message}`);

  const unitIds = unitsPayload.rows.map((unit) => unit.id);
  type RoomManagerOccupancyRow = {
    id: string;
    unit_id: string;
    status: 'holding' | 'active' | 'notice' | 'ended';
    tenant_display_name: string;
    contact_primary: string;
    contact_secondary: string;
    starts_on: string | null;
    ends_on: string | null;
    closed_at: string | null;
    deposit_target_amount: number | string;
    created_at: string;
  };
  const staysByUnit = new Map<string, RoomManagerStay[]>();
  let hasStayLifecycle = false;
  if (unitIds.length > 0) {
    const { data: stays, error: staysError } = await admin
      .from('unit_occupancies')
      .select('id,unit_id,status,tenant_display_name,contact_primary,contact_secondary,starts_on,ends_on,closed_at,deposit_target_amount,created_at')
      .in('unit_id', unitIds)
      .order('created_at', { ascending: false });
    if (staysError && !isMissingRelation(staysError)) {
      throw new Error(`Failed to load tenant stays: ${staysError.message}`);
    }
    if (!staysError) {
      hasStayLifecycle = true;
      const stayRows = (stays ?? []) as RoomManagerOccupancyRow[];
      const stayIds = stayRows.map((stay) => stay.id);
      const depositBalanceByStay = new Map<string, number>();
      if (stayIds.length > 0) {
        const { data: ledgerRows, error: ledgerError } = await admin
          .from('deposit_ledger_entries')
          .select('unit_occupancy_id,amount')
          .in('unit_occupancy_id', stayIds)
          .is('reversed_at', null);
        if (ledgerError && !isMissingRelation(ledgerError)) {
          throw new Error(`Failed to load stay deposit balances: ${ledgerError.message}`);
        }
        for (const row of ledgerRows ?? []) {
          const stayId = row.unit_occupancy_id as string | null;
          if (!stayId) continue;
          depositBalanceByStay.set(stayId, roundMoney((depositBalanceByStay.get(stayId) ?? 0) + toMoney(row.amount as number | string)));
        }
      }
      for (const stay of stayRows) {
        const isCurrent = !stay.closed_at && stay.status !== 'ended';
        const list = staysByUnit.get(stay.unit_id) ?? [];
        list.push({
          id: stay.id,
          status: stay.status,
          tenantDisplayName: stay.tenant_display_name || cleanContacts(stay.contact_primary, stay.contact_secondary).join(' '),
          contactPrimary: stay.contact_primary ?? '',
          contactSecondary: stay.contact_secondary ?? '',
          startsOn: stay.starts_on ?? null,
          endsOn: stay.ends_on ?? null,
          closedAt: stay.closed_at ?? null,
          depositTargetAmount: toMoney(stay.deposit_target_amount),
          depositBalance: depositBalanceByStay.get(stay.id) ?? 0,
          isCurrent,
        });
        staysByUnit.set(stay.unit_id, list);
      }
    }
  }

  const rulesByUnit = new Map<string, RoomManagerRule[]>();
  for (const hint of hintsResult.data ?? []) {
    const key = hint.unit_id as string | null;
    if (!key) continue;
    const list = rulesByUnit.get(key) ?? [];
    list.push({
      id: hint.id as string,
      matcherType: hint.matcher_type as RoomManagerRule['matcherType'],
      matcherValue: (hint.matcher_value as string) ?? '',
      amountValue: hint.amount_value === null || hint.amount_value === undefined ? null : toMoney(hint.amount_value as number | string),
      priority: Number(hint.priority ?? 100),
      label: formatMatcherLabel(
        hint.matcher_type as string,
        (hint.matcher_value as string) ?? '',
        hint.amount_value as number | string | null | undefined
      ),
      isActive: Boolean(hint.is_active),
    });
    rulesByUnit.set(key, list);
  }

  const latestReferenceByUnit = new Map<string, string>();
  for (const reference of referencesResult.data ?? []) {
    const key = reference.unit_id as string | null;
    if (!key || latestReferenceByUnit.has(key)) continue;
    latestReferenceByUnit.set(key, reference.reference as string);
  }

  const photoCountsByUnit = new Map<string, number>();
  for (const media of mediaResult.data ?? []) {
    const key = media.unit_id as string | null;
    if (!key) continue;
    photoCountsByUnit.set(key, (photoCountsByUnit.get(key) ?? 0) + 1);
  }

  let occupiedCount = 0;
  let vacantCount = 0;
  let blockedCount = 0;

  const rooms = unitsPayload.rows.map((unit) => {
    const stays = staysByUnit.get(unit.id) ?? [];
    const currentStay = stays.find((stay) => stay.isCurrent) ?? null;
    const roomIsOccupied = hasStayLifecycle ? Boolean(currentStay) : unit.occupancy_status === 'occupied';
    const stayLifecycleMode: RoomManagerRoomRow['stayLifecycleMode'] = hasStayLifecycle ? 'occupancy' : 'legacy';
    if (roomIsOccupied) occupiedCount += 1;
    if (hasStayLifecycle ? !roomIsOccupied : unit.occupancy_status === 'vacant') vacantCount += 1;
    if (unit.is_blocked) blockedCount += 1;

    return {
      unitId: unit.id,
      label: unit.label,
      contactPrimary: unit.contact_primary ?? '',
      contactSecondary: unit.contact_secondary ?? '',
      contacts: cleanContacts(unit.contact_primary, unit.contact_secondary),
      rentAmount: toMoney(unit.rent_amount),
      depositAmount: toMoney(unit.deposit_amount),
      occupancy: unit.occupancy_status,
      isBlocked: unit.is_blocked,
      isAvailable: unit.is_available,
      parking: unit.parking,
      ensuite: unit.ensuite,
      maxOccupants: unit.max_occupants,
      features: unit.features ?? [],
      expectedReference: unit.expected_reference ?? '',
      matchKeywords: unit.match_keywords ?? [],
      keywordCount: unit.match_keywords?.length ?? 0,
      rules: rulesByUnit.get(unit.id) ?? [],
      photoCount: photoCountsByUnit.get(unit.id) ?? 0,
      latestReference: latestReferenceByUnit.get(unit.id) ?? null,
      stayLifecycleMode,
      currentStay,
      stays,
    };
  });

  return {
    setupState: unitsPayload.setupState,
    organizationLabel: propertyResult.data?.organizations?.name ?? 'Hamba Trading',
    propertyId,
    propertyName: propertyResult.data?.name ?? 'Property',
    locationLabel: propertyResult.data?.location ?? '',
    periodKey: resolvedPeriodKey,
    periodLabel,
    billingWindowLabel: billingWindowLabelFromRange(billingWindow.startDate, billingWindow.endDate),
    summary: {
      roomCount: rooms.length,
      occupiedCount,
      vacantCount,
      blockedCount,
    },
    rooms,
  };
}

export async function readPropertyUnitsTable(
  propertyId: string,
  periodKey?: string,
  options?: { currentDate?: Date }
): Promise<PropertyUnitsTable> {
  const admin = getSupabaseAdmin();
  const now = options?.currentDate ?? new Date();
  const resolvedPeriodKey = resolvePeriodKey(periodKey, now);
  await ensurePaymentPeriodsForPeriod({ periodKey: resolvedPeriodKey, propertyId });
  const monthStart = new Date(`${resolvedPeriodKey}-01T00:00:00Z`);
  const monthStartDate = monthStart.toISOString().slice(0, 10);
  const nextMonthDate = addMonths(monthStart, 1).toISOString().slice(0, 10);
  const periodLabel = formatMonthLabel(monthStart);
  const billingWindow = getBillingWindowForPeriod(resolvedPeriodKey);

  const [propertyResult, unitsResult, referencesResult, hintsResult] = await Promise.all([
    admin
      .from('properties')
      .select('id,organization_id,name, organizations(name)')
      .eq('id', propertyId)
      .maybeSingle<{ id: string; organization_id: string; name: string; organizations: { name: string } | null }>(),
    (async () => {
      const richResult = await admin
        .from('property_units')
        .select('id,property_id,label,contact_primary,contact_secondary,rent_amount,deposit_amount,occupancy_status,is_blocked,expected_reference,match_keywords,display_order')
        .eq('property_id', propertyId)
        .order('display_order', { ascending: true });
      // deposit_amount is additive (2026-06-30 migration); fall back gracefully
      // if the column has not been applied in this environment yet.
      if (richResult.error?.code !== '42703') return richResult;
      const fallbackResult = await admin
        .from('property_units')
        .select('id,property_id,label,contact_primary,contact_secondary,rent_amount,occupancy_status,is_blocked,expected_reference,match_keywords,display_order')
        .eq('property_id', propertyId)
        .order('display_order', { ascending: true });
      return {
        ...fallbackResult,
        data: (fallbackResult.data ?? []).map((unit) => ({ ...unit, deposit_amount: 0 })),
      };
    })(),
    admin
      .from('payment_references')
      .select('id,property_id,unit_id,unit_payment_period_id,bank_import_entry_id,reference,amount,received_at,transaction_at,signed_off')
      .eq('property_id', propertyId)
      .gte('received_at', billingWindow.startDate)
      .lte('received_at', billingWindow.endDate),
    admin
      .from('bank_import_unit_match_hints')
      .select('id,unit_id,matcher_type,matcher_value,amount_value,is_active,priority')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .order('priority', { ascending: true }),
  ]);

  if (
    unitsResult.error?.code === '42P01' ||
    referencesResult.error?.code === '42P01' ||
    hintsResult.error?.code === '42P01'
  ) {
    return {
      setupState: 'missing_tables',
      organizationLabel: propertyResult.data?.organizations?.name ?? 'Hamba Trading',
      propertyId,
      propertyName: propertyResult.data?.name ?? 'Property',
      periodKey: resolvedPeriodKey,
      periodLabel,
      billingWindowLabel: `${formatDateShort(billingWindow.startDate)} - ${formatDateShort(billingWindow.endDate)}`,
      activityHint: null,
      rows: [],
      referencePool: [],
      totals: {
        unitCount: 0,
        blockedCount: 0,
        paidCount: 0,
        pendingCount: 0,
        dueCount: 0,
        overdueCount: 0,
        collected: 0,
        pendingAmount: 0,
        outstandingAmount: 0,
        expected: 0,
        unmatchedCount: 0,
        unmatchedAmount: 0,
      },
    };
  }
  if (propertyResult.error) throw new Error(`Failed to load property: ${propertyResult.error.message}`);
  if (unitsResult.error) throw new Error(`Failed to load property units: ${unitsResult.error.message}`);
  if (referencesResult.error) throw new Error(`Failed to load payment references: ${referencesResult.error.message}`);
  if (hintsResult.error) throw new Error(`Failed to load unit match hints: ${hintsResult.error.message}`);

  const units = (unitsResult.data ?? []) as Array<{
    id: string;
    label: string;
    contact_primary: string;
    contact_secondary: string;
    rent_amount: number | string;
    deposit_amount: number | string;
    occupancy_status: 'occupied' | 'vacant';
    is_blocked: boolean;
    expected_reference: string;
    match_keywords: string[];
  }>;
  const references = (referencesResult.data ?? []) as Array<{
    id: string;
    unit_id: string | null;
    unit_payment_period_id: string | null;
    bank_import_entry_id: string | null;
    reference: string;
    amount: number | string;
    received_at: string;
    transaction_at: string | null;
    signed_off: boolean;
  }>;
  const recentPeriodStartById = new Map<string, string>();
  let recentReferences: typeof references = [];
  const rulesByUnit = new Map<string, UnitTableMatchRule[]>();
  for (const hint of hintsResult.data ?? []) {
    const key = hint.unit_id as string | null;
    if (!key) continue;
    const rules = rulesByUnit.get(key) ?? [];
    rules.push({
      id: hint.id as string,
      matcherType: hint.matcher_type as UnitTableMatchRule['matcherType'],
      matcherValue: (hint.matcher_value as string) ?? '',
      amountValue:
        hint.amount_value === null || hint.amount_value === undefined
          ? null
          : toMoney(hint.amount_value as number | string),
      isActive: Boolean(hint.is_active),
    });
    rulesByUnit.set(key, rules);
  }

  // Periods for these units in the selected month.
  const unitIds = units.map((unit) => unit.id);
  const periodsByUnit = new Map<string, { id: string; expected_amount: number | string; status: string; is_blocked: boolean; due_date: string | null }>();
  if (unitIds.length > 0) {
    const recentWindowStart = shiftPeriodStart(monthStartDate, -2);
    const [periodsResult, recentPeriodsResult] = await Promise.all([
      admin
        .from('unit_payment_periods')
        .select('id,unit_id,expected_amount,status,is_blocked,due_date')
        .in('unit_id', unitIds)
        .gte('period_start', monthStartDate)
        .lt('period_start', nextMonthDate),
      admin
        .from('unit_payment_periods')
        .select('id,unit_id,period_start')
        .in('unit_id', unitIds)
        .gte('period_start', recentWindowStart)
        .lt('period_start', nextMonthDate),
    ]);
    const { data: periods, error: periodsError } = periodsResult;
    if (periodsError && periodsError.code !== '42P01') {
      throw new Error(`Failed to load unit payment periods: ${periodsError.message}`);
    }
    if (recentPeriodsResult.error && !isMissingRelation(recentPeriodsResult.error)) {
      throw new Error(`Failed to load recent unit payment periods: ${recentPeriodsResult.error.message}`);
    }
    for (const period of periods ?? []) {
      periodsByUnit.set(period.unit_id as string, period as never);
    }
    for (const period of recentPeriodsResult.data ?? []) {
      recentPeriodStartById.set(period.id as string, period.period_start as string);
    }
    const recentPeriodIds = Array.from(recentPeriodStartById.keys());
    if (recentPeriodIds.length > 0) {
      const { data: recentRows, error: recentRowsError } = await admin
        .from('payment_references')
        .select('id,property_id,unit_id,unit_payment_period_id,bank_import_entry_id,reference,amount,received_at,transaction_at,signed_off')
        .eq('property_id', propertyId)
        .in('unit_payment_period_id', recentPeriodIds);
      if (recentRowsError && !isMissingRelation(recentRowsError)) {
        throw new Error(`Failed to load recent room payments: ${recentRowsError.message}`);
      }
      recentReferences = (recentRows ?? []) as typeof references;
    }
  }

  type UnitOccupancyRow = {
    id: string;
    unit_id: string;
    status: 'holding' | 'active' | 'notice' | 'ended';
    tenant_display_name: string;
    contact_primary: string;
    contact_secondary: string;
    starts_on: string | null;
    ends_on: string | null;
    closed_at: string | null;
    deposit_target_amount: number | string;
    created_at: string;
  };
  const occupanciesByUnit = new Map<string, UnitOccupancyRow[]>();
  const activeOccupancyByUnit = new Map<string, UnitOccupancyRow>();
  const previousOccupanciesByUnit = new Map<string, UnitOccupancyRow[]>();
  const previousOccupancyCountByUnit = new Map<string, number>();
  const depositBalanceByOccupancy = new Map<string, number>();
  let hasDepositLifecycle = false;
  if (unitIds.length > 0) {
    const { data: occupancies, error: occupanciesError } = await admin
      .from('unit_occupancies')
      .select('id,unit_id,status,tenant_display_name,contact_primary,contact_secondary,starts_on,ends_on,closed_at,deposit_target_amount,created_at')
      .in('unit_id', unitIds)
      .order('created_at', { ascending: false });

    if (occupanciesError && !isMissingRelation(occupanciesError)) {
      throw new Error(`Failed to load unit occupancies: ${occupanciesError.message}`);
    }

    if (!occupanciesError) {
      hasDepositLifecycle = true;
      for (const occupancy of (occupancies ?? []) as UnitOccupancyRow[]) {
        const occupanciesForUnit = occupanciesByUnit.get(occupancy.unit_id) ?? [];
        occupanciesForUnit.push(occupancy);
        occupanciesByUnit.set(occupancy.unit_id, occupanciesForUnit);
        const isCurrent = !occupancy.closed_at && occupancy.status !== 'ended';
        if (isCurrent && !activeOccupancyByUnit.has(occupancy.unit_id)) {
          activeOccupancyByUnit.set(occupancy.unit_id, occupancy);
        } else {
          const previous = previousOccupanciesByUnit.get(occupancy.unit_id) ?? [];
          previous.push(occupancy);
          previousOccupanciesByUnit.set(occupancy.unit_id, previous);
          previousOccupancyCountByUnit.set(
            occupancy.unit_id,
            (previousOccupancyCountByUnit.get(occupancy.unit_id) ?? 0) + 1
          );
        }
      }

      const occupancyIds = ((occupancies ?? []) as UnitOccupancyRow[]).map((occupancy) => occupancy.id);
      if (occupancyIds.length > 0) {
        const { data: ledgerRows, error: ledgerError } = await admin
          .from('deposit_ledger_entries')
          .select('unit_occupancy_id,amount')
          .in('unit_occupancy_id', occupancyIds)
          .is('reversed_at', null);
        if (ledgerError && !isMissingRelation(ledgerError)) {
          throw new Error(`Failed to load deposit lifecycle ledger: ${ledgerError.message}`);
        }
        for (const row of ledgerRows ?? []) {
          const occupancyId = row.unit_occupancy_id as string | null;
          if (!occupancyId) continue;
          depositBalanceByOccupancy.set(
            occupancyId,
            roundMoney((depositBalanceByOccupancy.get(occupancyId) ?? 0) + toMoney(row.amount as number | string))
          );
        }
      }
    }
  }

  const findStayForDate = (unitId: string, date: string): UnitOccupancyRow | null => {
    const stays = occupanciesByUnit.get(unitId) ?? [];
    const candidates = stays.filter((stay) => {
      const startsOn = stay.starts_on ?? '0000-01-01';
      const endsOn = stay.ends_on ?? (stay.closed_at ? stay.closed_at.slice(0, 10) : '9999-12-31');
      return startsOn <= date && endsOn >= date;
    });
    candidates.sort((a, b) => {
      const aStart = a.starts_on ?? '';
      const bStart = b.starts_on ?? '';
      if (aStart !== bStart) return bStart.localeCompare(aStart);
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
    return candidates[0] ?? null;
  };

  // Bank-entry metadata (account suffix + payer) for the reference pool display.
  const entryIds = Array.from(
    new Set(
      [...references, ...recentReferences]
        .map((reference) => reference.bank_import_entry_id)
        .filter(Boolean) as string[]
    )
  );
  const entryMeta = new Map<string, { accountSuffix: string | null; payerName: string | null }>();
  if (entryIds.length > 0) {
    const { data: entries } = await admin
      .from('bank_import_entries')
      .select('id,destination_account_suffix,payer_name')
      .in('id', entryIds);
    for (const entry of entries ?? []) {
      entryMeta.set(entry.id as string, {
        accountSuffix: (entry.destination_account_suffix as string) || null,
        payerName: (entry.payer_name as string) || null,
      });
    }
  }

  const referencesByUnit = new Map<string, typeof references>();
  const pool: typeof references = [];
  for (const reference of references) {
    if (reference.unit_id) {
      const list = referencesByUnit.get(reference.unit_id) ?? [];
      list.push(reference);
      referencesByUnit.set(reference.unit_id, list);
    } else {
      pool.push(reference);
    }
  }

  // Deposit ledger (FR-2.8): per-reference accepted contributions and each
  // unit's running balance toward its deposit target. Missing table (migration
  // not applied) degrades to zeros.
  const contributionsByReference = new Map<string, number>();
  const depositBalanceByUnit = new Map<string, number>();
  if (unitIds.length > 0) {
    const { data: contributions, error: contributionsError } = await admin
      .from('deposit_contributions')
      .select('unit_id,payment_reference_id,amount')
      .in('unit_id', unitIds)
      .is('reversed_at', null);
    if (contributionsError && !isMissingRelation(contributionsError)) {
      throw new Error(`Failed to load deposit contributions: ${contributionsError.message}`);
    }
    for (const contribution of contributions ?? []) {
      const amount = toMoney(contribution.amount as number | string);
      const unitId = contribution.unit_id as string;
      depositBalanceByUnit.set(unitId, roundMoney((depositBalanceByUnit.get(unitId) ?? 0) + amount));
      const referenceId = contribution.payment_reference_id as string | null;
      if (referenceId) {
        contributionsByReference.set(referenceId, roundMoney((contributionsByReference.get(referenceId) ?? 0) + amount));
      }
    }
  }

  // Credit ledger (FR-2.8, owner rulings 2026-07-03): held balance per unit,
  // credit applied per period, active allocations, and arrears candidates for
  // the allocate action. Missing tables degrade to zeros.
  const creditBalanceByUnit = new Map<string, number>();
  const creditsByReference = new Map<string, number>();
  const creditAppliedByPeriod = new Map<string, number>();
  const creditAllocationsByUnit = new Map<
    string,
    Array<{ id: string; amount: number; destination: 'current' | 'arrears' | 'advance' | 'deposit'; targetPeriodId: string | null; createdAt: string | null }>
  >();
  const creditSourcesByUnit = new Map<
    string,
    Array<{
      referenceId: string | null;
      reference: string;
      transactionDate: string | null;
      createdAt: string | null;
      amount: number;
      sourcePaymentAmount: number | null;
    }>
  >();
  const heldCreditSourcesByUnit = new Map<
    string,
    Array<{
      referenceId: string | null;
      reference: string;
      transactionDate: string | null;
      amount: number;
      sourcePaymentAmount: number | null;
    }>
  >();
  const allocationSourcesById = new Map<
    string,
    Array<{
      referenceId: string | null;
      reference: string;
      transactionDate: string | null;
      amount: number;
      sourcePaymentAmount: number | null;
    }>
  >();
  const arrearsCandidatesByUnit = new Map<
    string,
    Array<{ periodId: string; periodStart: string; outstandingAmount: number }>
  >();
  const periodStartById = new Map<string, string>();
  if (unitIds.length > 0) {
    const windowStart = shiftPeriodStart(monthStartDate, -3);
    const [creditsResult, allocationsResult, pastPeriodsResult] = await Promise.all([
      admin
        .from('unit_credits')
        .select('unit_id,payment_reference_id,reference_text,amount,created_at')
        .in('unit_id', unitIds)
        .is('reversed_at', null),
      admin
        .from('unit_credit_allocations')
        .select('id,unit_id,amount,destination,target_period_id,created_at')
        .in('unit_id', unitIds)
        .is('reversed_at', null),
      admin
        .from('unit_payment_periods')
        .select('id,unit_id,period_start,expected_amount,is_blocked')
        .in('unit_id', unitIds)
        .gte('period_start', windowStart)
        .lt('period_start', monthStartDate),
    ]);
    if (creditsResult.error && !isMissingRelation(creditsResult.error)) {
      throw new Error(`Failed to load unit credits: ${creditsResult.error.message}`);
    }
    if (allocationsResult.error && !isMissingRelation(allocationsResult.error)) {
      throw new Error(`Failed to load credit allocations: ${allocationsResult.error.message}`);
    }
    if (pastPeriodsResult.error && !isMissingRelation(pastPeriodsResult.error)) {
      throw new Error(`Failed to load arrears candidates: ${pastPeriodsResult.error.message}`);
    }

    const creditReferenceIds = Array.from(
      new Set(
        (creditsResult.data ?? [])
          .map((credit) => credit.payment_reference_id as string | null)
          .filter(Boolean) as string[]
      )
    );
    const creditReferenceDetails = new Map<
      string,
      { reference: string; transactionDate: string | null; amount: number }
    >();
    if (creditReferenceIds.length > 0) {
      const { data: creditRefs, error: creditRefsError } = await admin
        .from('payment_references')
        .select('id,reference,amount,received_at,transaction_at')
        .in('id', creditReferenceIds);
      if (creditRefsError && !isMissingRelation(creditRefsError)) {
        throw new Error(`Failed to load credit source references: ${creditRefsError.message}`);
      }
      for (const reference of creditRefs ?? []) {
        creditReferenceDetails.set(reference.id as string, {
          reference: reference.reference as string,
          transactionDate: transactionDateOnly(reference.transaction_at as string | null, reference.received_at as string | null),
          amount: toMoney(reference.amount as number | string),
        });
      }
    }

    for (const credit of creditsResult.data ?? []) {
      const unitId = credit.unit_id as string;
      const amount = toMoney(credit.amount as number | string);
      creditBalanceByUnit.set(unitId, roundMoney((creditBalanceByUnit.get(unitId) ?? 0) + amount));
      const referenceId = credit.payment_reference_id as string | null;
      if (referenceId) {
        creditsByReference.set(referenceId, roundMoney((creditsByReference.get(referenceId) ?? 0) + amount));
      }
      const referenceDetails = referenceId ? creditReferenceDetails.get(referenceId) : undefined;
      const sourceList = creditSourcesByUnit.get(unitId) ?? [];
      sourceList.push({
        referenceId,
        reference: referenceDetails?.reference ?? (credit.reference_text as string | null) ?? 'Held credit',
        transactionDate: referenceDetails?.transactionDate ?? null,
        createdAt: (credit.created_at as string | null) ?? null,
        amount,
        sourcePaymentAmount: referenceDetails?.amount ?? null,
      });
      creditSourcesByUnit.set(unitId, sourceList);
    }
    for (const allocation of allocationsResult.data ?? []) {
      const unitId = allocation.unit_id as string;
      const amount = toMoney(allocation.amount as number | string);
      creditBalanceByUnit.set(unitId, roundMoney((creditBalanceByUnit.get(unitId) ?? 0) - amount));
      const destination = allocation.destination as 'current' | 'arrears' | 'advance' | 'deposit';
      const targetPeriodId = (allocation.target_period_id as string | null) ?? null;
      if (targetPeriodId && destination !== 'deposit' && destination !== 'current') {
        creditAppliedByPeriod.set(targetPeriodId, roundMoney((creditAppliedByPeriod.get(targetPeriodId) ?? 0) + amount));
      }
      const list = creditAllocationsByUnit.get(unitId) ?? [];
      list.push({ id: allocation.id as string, amount, destination, targetPeriodId, createdAt: (allocation.created_at as string | null) ?? null });
      creditAllocationsByUnit.set(unitId, list);
    }

    for (const sourceList of creditSourcesByUnit.values()) {
      sourceList.sort((a, b) => {
        const aDate = a.transactionDate ?? a.createdAt ?? '';
        const bDate = b.transactionDate ?? b.createdAt ?? '';
        return aDate.localeCompare(bDate);
      });
    }
    for (const [unitId, allocations] of creditAllocationsByUnit.entries()) {
      const remainingSources = (creditSourcesByUnit.get(unitId) ?? []).map((source) => ({ ...source }));
      const sortedAllocations = allocations.slice().sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
      for (const allocation of sortedAllocations) {
        let remainingAllocation = allocation.amount;
        const sources: Array<{
          referenceId: string | null;
          reference: string;
          transactionDate: string | null;
          amount: number;
          sourcePaymentAmount: number | null;
        }> = [];
        for (const source of remainingSources) {
          if (remainingAllocation <= 0.001) break;
          if (source.amount <= 0.001) continue;
          const consumed = roundMoney(Math.min(source.amount, remainingAllocation));
          sources.push({
            referenceId: source.referenceId,
            reference: source.reference,
            transactionDate: source.transactionDate,
            amount: consumed,
            sourcePaymentAmount: source.sourcePaymentAmount,
          });
          source.amount = roundMoney(source.amount - consumed);
          remainingAllocation = roundMoney(remainingAllocation - consumed);
        }
        allocationSourcesById.set(allocation.id, sources);
      }
      heldCreditSourcesByUnit.set(
        unitId,
        remainingSources
          .filter((source) => source.amount > 0.001)
          .map((source) => ({
            referenceId: source.referenceId,
            reference: source.reference,
            transactionDate: source.transactionDate,
            amount: source.amount,
            sourcePaymentAmount: source.sourcePaymentAmount,
          }))
      );
    }

    const pastPeriodIds = (pastPeriodsResult.data ?? []).map((row) => row.id as string);
    for (const row of pastPeriodsResult.data ?? []) {
      periodStartById.set(row.id as string, row.period_start as string);
    }
    if (pastPeriodIds.length > 0) {
      const { data: pastRefs, error: pastRefsError } = await admin
        .from('payment_references')
        .select('unit_payment_period_id,amount')
        .in('unit_payment_period_id', pastPeriodIds);
      if (pastRefsError && !isMissingRelation(pastRefsError)) {
        throw new Error(`Failed to load arrears references: ${pastRefsError.message}`);
      }
      const receivedByPeriod = new Map<string, number>();
      for (const row of pastRefs ?? []) {
        const periodId = row.unit_payment_period_id as string | null;
        if (!periodId) continue;
        receivedByPeriod.set(periodId, roundMoney((receivedByPeriod.get(periodId) ?? 0) + toMoney(row.amount as number | string)));
      }
      for (const row of pastPeriodsResult.data ?? []) {
        if (row.is_blocked) continue;
        const periodId = row.id as string;
        const outstanding = roundMoney(
          toMoney(row.expected_amount) - (receivedByPeriod.get(periodId) ?? 0) - (creditAppliedByPeriod.get(periodId) ?? 0)
        );
        if (outstanding > 0.001) {
          const unitId = row.unit_id as string;
          const list = arrearsCandidatesByUnit.get(unitId) ?? [];
          list.push({ periodId, periodStart: row.period_start as string, outstandingAmount: outstanding });
          arrearsCandidatesByUnit.set(unitId, list);
        }
      }
    }
  }

  const recentPaymentsByUnit = new Map<
    string,
    UnitTableRow['recentPayments']
  >();
  for (const reference of recentReferences) {
    if (!reference.unit_id) continue;
    const amount = toMoney(reference.amount);
    const depositAmount = contributionsByReference.get(reference.id) ?? 0;
    const creditAmount = creditsByReference.get(reference.id) ?? 0;
    const rentAmount = roundMoney(Math.max(0, amount - depositAmount - creditAmount));
    const meta = reference.bank_import_entry_id ? entryMeta.get(reference.bank_import_entry_id) : undefined;
    const list = recentPaymentsByUnit.get(reference.unit_id) ?? [];
    list.push({
      id: reference.id,
      periodStart: reference.unit_payment_period_id
        ? recentPeriodStartById.get(reference.unit_payment_period_id) ?? null
        : null,
      reference: reference.reference,
      payerName: meta?.payerName ?? null,
      accountSuffix: meta?.accountSuffix ?? null,
      transactionDate: transactionDateOnly(reference.transaction_at, reference.received_at),
      amount,
      rentAmount,
      depositAmount,
      creditAmount,
      signedOff: reference.signed_off,
    });
    recentPaymentsByUnit.set(reference.unit_id, list);
  }
  for (const list of recentPaymentsByUnit.values()) {
    list.sort((a, b) => {
      const aPeriod = a.periodStart ?? '';
      const bPeriod = b.periodStart ?? '';
      if (aPeriod !== bPeriod) return aPeriod < bPeriod ? 1 : -1;
      const aDate = a.transactionDate ?? '';
      const bDate = b.transactionDate ?? '';
      return aDate < bDate ? 1 : -1;
    });
  }

  let collected = 0;
  let pendingAmountTotal = 0;
  let outstandingTotal = 0;
  let expectedTotal = 0;
  let blockedCount = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let dueCount = 0;
  let overdueCount = 0;

  const rows: UnitTableRow[] = units.map((unit) => {
    const period = periodsByUnit.get(unit.id);
    const matched = (referencesByUnit.get(unit.id) ?? []).slice().sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
    const primary = matched[0] ?? null;
    const primaryTransactionDate = transactionDateOnly(primary?.transaction_at, primary?.received_at);
    const effectiveStayDate = primaryTransactionDate ?? billingWindow.endDate;
    const effectiveOccupancy = hasDepositLifecycle ? findStayForDate(unit.id, effectiveStayDate) : null;
    const periodOccupancyStatus: 'occupied' | 'vacant' =
      hasDepositLifecycle ? (effectiveOccupancy ? 'occupied' : 'vacant') : unit.occupancy_status;
    const isBlocked = unit.is_blocked || (period?.is_blocked ?? false) || periodOccupancyStatus === 'vacant';
    const expectedAmount = isBlocked ? 0 : toMoney(period?.expected_amount ?? unit.rent_amount);
    expectedTotal += expectedAmount;
    if (isBlocked) blockedCount += 1;
    const legacyDepositTarget = toMoney(unit.deposit_amount);
    const legacyDepositBalance = depositBalanceByUnit.get(unit.id) ?? 0;
    const activeOccupancy = activeOccupancyByUnit.get(unit.id) ?? null;
    const depositOccupancy = effectiveOccupancy ?? activeOccupancy;
    const depositAmount =
      hasDepositLifecycle && depositOccupancy
        ? toMoney(depositOccupancy.deposit_target_amount)
        : hasDepositLifecycle
          ? legacyDepositTarget
          : legacyDepositTarget;
    const depositBalance =
      hasDepositLifecycle && depositOccupancy
        ? (depositBalanceByOccupancy.get(depositOccupancy.id) ?? 0)
        : hasDepositLifecycle
          ? 0
          : legacyDepositBalance;
    const displayContacts = effectiveOccupancy
      ? stayDisplayContacts(effectiveOccupancy)
      : cleanContacts(unit.contact_primary, unit.contact_secondary);
    const depositContributedAmount = matched.reduce(
      (sum, reference) => sum + (contributionsByReference.get(reference.id) ?? 0),
      0
    );
    const creditBalance = creditBalanceByUnit.get(unit.id) ?? 0;
    const creditFromMatchedReferencesAmount = matched.reduce(
      (sum, reference) => sum + (creditsByReference.get(reference.id) ?? 0),
      0
    );
    const creditAppliedAmount = period?.id ? (creditAppliedByPeriod.get(period.id) ?? 0) : 0;
    const statusState = computeUnitStatus({
      occupancyStatus: periodOccupancyStatus,
      isBlocked,
      expectedAmount,
      // Split suggestions only get the REMAINING deposit headroom.
      depositAmount: roundMoney(Math.max(0, depositAmount - depositBalance)),
      depositContributedAmount,
      creditFromMatchedReferencesAmount,
      creditAppliedAmount,
      matchedReferences: matched,
      dueDate: period?.due_date ?? billingWindow.endDate,
      now,
    });
    const allMatchedReferencesSignedOff = matched.length > 0 && matched.every((reference) => reference.signed_off);
    // Decision rule: only signed-off money counts as collected.
    collected += statusState.signedOffAmount;
    pendingAmountTotal += statusState.pendingAmount;
    outstandingTotal += statusState.outstandingAmount ?? 0;
    if (statusState.status === 'paid') paidCount += 1;
    if (statusState.status === 'pending') pendingCount += 1;
    if (statusState.status === 'overdue') overdueCount += 1;
    // "Due" = money not fully received (chase list). Pending is excluded — the
    // money arrived; the action is sign-off, not follow-up.
    if (statusState.status !== 'paid' && statusState.status !== 'pending' && statusState.status !== 'blocked') {
      dueCount += 1;
    }

    const primaryMeta = primary?.bank_import_entry_id
      ? entryMeta.get(primary.bank_import_entry_id)
      : undefined;
    const overpaymentAmount = statusState.depositSplit
      ? roundMoney(statusState.depositSplit.depositPortion + statusState.depositSplit.surplusAmount)
      : 0;
    const blockedAllocatableAmount =
      isBlocked && matched.length > 0 && !allMatchedReferencesSignedOff
        ? roundMoney((statusState.receivedAmount ?? matched.reduce((sum, reference) => sum + toMoney(reference.amount), 0)) - depositContributedAmount - creditFromMatchedReferencesAmount)
        : 0;
    const allocationNeededAmount = overpaymentAmount > 0.001 ? overpaymentAmount : blockedAllocatableAmount;

    return {
      unitId: unit.id,
      label: unit.label,
      occupancy: periodOccupancyStatus,
      contacts: displayContacts,
      expectedAmount,
      expectedReference: unit.expected_reference ?? '',
      matchKeywords: unit.match_keywords ?? [],
      matchRules: rulesByUnit.get(unit.id) ?? [],
      periodId: period?.id ?? null,
      reference: primary?.reference ?? null,
      referenceId: primary?.id ?? null,
      referencePayerName: primaryMeta?.payerName ?? null,
      referenceAccountSuffix: primaryMeta?.accountSuffix ?? null,
      transactionDate: primaryTransactionDate,
      matchedReferences: matched.map((reference) => {
        const meta = reference.bank_import_entry_id ? entryMeta.get(reference.bank_import_entry_id) : undefined;
        return {
          id: reference.id,
          reference: reference.reference,
          payerName: meta?.payerName ?? null,
          accountSuffix: meta?.accountSuffix ?? null,
          transactionDate: transactionDateOnly(reference.transaction_at, reference.received_at),
          amount: toMoney(reference.amount),
          signedOff: reference.signed_off,
        };
      }),
      recentPayments: recentPaymentsByUnit.get(unit.id) ?? [],
      receivedAmount: statusState.receivedAmount,
      signedOff: statusState.signedOff,
      locked: statusState.signedOff,
      status: statusState.status,
      overdueDays: statusState.overdueDays,
      outstandingAmount: statusState.outstandingAmount,
      depositAmount,
      depositBalance,
      depositContributedAmount,
      depositSplit: statusState.depositSplit,
      creditBalance,
      heldCreditSources: heldCreditSourcesByUnit.get(unit.id) ?? [],
      creditAppliedAmount,
      creditFromMatchedReferencesAmount,
      overpaymentOptions:
        allocationNeededAmount > 0.001
          ? computeCreditAllocationOptions({
              creditBalance: allocationNeededAmount,
              selectedPeriodStart: monthStartDate,
              arrearsCandidates: arrearsCandidatesByUnit.get(unit.id) ?? [],
              depositHeadroom: roundMoney(Math.max(0, depositAmount - depositBalance)),
            })
          : null,
      creditOptions: isBlocked
        ? null
        : computeCreditAllocationOptions({
            creditBalance,
            selectedPeriodStart: monthStartDate,
            arrearsCandidates: arrearsCandidatesByUnit.get(unit.id) ?? [],
            depositHeadroom: roundMoney(Math.max(0, depositAmount - depositBalance)),
          }),
      creditAllocations: (creditAllocationsByUnit.get(unit.id) ?? []).map((allocation) => ({
        id: allocation.id,
        amount: allocation.amount,
        destination: allocation.destination,
        targetPeriodStart: allocation.targetPeriodId
          ? (periodStartById.get(allocation.targetPeriodId) ??
             (period?.id === allocation.targetPeriodId ? monthStartDate : null))
          : null,
        createdAt: allocation.createdAt,
        sourcePayments: allocationSourcesById.get(allocation.id) ?? [],
      })),
      depositLifecycle: {
        mode: hasDepositLifecycle ? 'occupancy' : 'legacy',
        occupancyId: depositOccupancy?.id ?? null,
        status: depositOccupancy?.status ?? null,
        startsOn: depositOccupancy?.starts_on ?? null,
        endsOn: depositOccupancy?.ends_on ?? null,
        closedAt: depositOccupancy?.closed_at ?? null,
        tenantDisplayName: depositOccupancy?.tenant_display_name || null,
        depositTargetAmount: depositAmount,
        depositBalance,
        previousOccupancyCount: previousOccupancyCountByUnit.get(unit.id) ?? 0,
        previousOccupancies: (previousOccupanciesByUnit.get(unit.id) ?? []).map((occupancy) => ({
          id: occupancy.id,
          status: occupancy.status,
          startsOn: occupancy.starts_on ?? null,
          endsOn: occupancy.ends_on ?? null,
          closedAt: occupancy.closed_at ?? null,
          depositTargetAmount: toMoney(occupancy.deposit_target_amount),
          depositBalance: depositBalanceByOccupancy.get(occupancy.id) ?? 0,
        })),
      },
    };
  });

  const referencePool: ReferencePoolRow[] = pool
    .slice()
    .sort((a, b) => (a.received_at < b.received_at ? 1 : -1))
    .map((reference) => {
      const meta = reference.bank_import_entry_id ? entryMeta.get(reference.bank_import_entry_id) : undefined;
      return {
        id: reference.id,
        reference: reference.reference,
        amount: toMoney(reference.amount),
        transactionDate: transactionDateOnly(reference.transaction_at, reference.received_at) ?? reference.received_at,
        accountSuffix: meta?.accountSuffix ?? null,
        payerName: meta?.payerName ?? null,
        signedOff: reference.signed_off,
      };
    });
  const unmatchedAmount = referencePool.reduce((sum, reference) => sum + reference.amount, 0);

  const matchedCount = rows.filter((row) => row.reference).length;
  let activityHint: string | null = null;
  if (matchedCount === 0 && referencePool.length === 0) {
    const { data: nearestReferences } = await admin
      .from('payment_references')
      .select('received_at')
      .eq('property_id', propertyId)
      .not('unit_id', 'is', null)
      .order('received_at', { ascending: true })
      .limit(12);

    const dates = (nearestReferences ?? [])
      .map((reference) => reference.received_at as string)
      .filter(Boolean);

    const previous = dates.filter((date) => date < billingWindow.startDate).at(-1) ?? null;
    const next = dates.find((date) => date > billingWindow.endDate) ?? null;

    if (previous || next) {
      const parts = [];
      if (previous) parts.push(`last matched payment ${formatDateShort(previous)}`);
      if (next) parts.push(`next matched payment ${formatDateShort(next)}`);
      activityHint = `No matched references fall inside ${billingWindowLabelFromRange(billingWindow.startDate, billingWindow.endDate)}; ${parts.join(' · ')}.`;
    }
  }

  return {
    setupState: units.length === 0 ? 'no_units' : 'ready',
    organizationLabel: propertyResult.data?.organizations?.name ?? 'Hamba Trading',
    propertyId,
    propertyName: propertyResult.data?.name ?? 'Property',
    periodKey: resolvedPeriodKey,
    periodLabel,
    billingWindowLabel: `${formatDateShort(billingWindow.startDate)} - ${formatDateShort(billingWindow.endDate)}`,
    activityHint,
    rows,
    referencePool,
    totals: {
      unitCount: units.length,
      blockedCount,
      paidCount,
      pendingCount,
      dueCount,
      overdueCount,
      collected,
      pendingAmount: roundMoney(pendingAmountTotal),
      outstandingAmount: roundMoney(outstandingTotal),
      expected: expectedTotal,
      unmatchedCount: referencePool.length,
      unmatchedAmount,
    },
  };
}

function billingWindowLabelFromRange(startDate: string, endDate: string) {
  return `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`;
}

export async function readReferencePoolView(
  periodKey?: string,
  options?: { currentDate?: Date }
): Promise<ReferencePoolView> {
  const admin = getSupabaseAdmin();
  const now = options?.currentDate ?? new Date();
  const resolvedPeriodKey = resolvePeriodKey(periodKey, now);
  const monthStart = new Date(`${resolvedPeriodKey}-01T00:00:00Z`);
  const periodLabel = formatMonthLabel(monthStart);
  const billingWindow = getBillingWindowForPeriod(resolvedPeriodKey);

  const [organizationsResult, propertiesResult, referencesResult] = await Promise.all([
    admin.from('organizations').select('id,name').order('created_at', { ascending: true }).limit(1),
    admin.from('properties').select('id,name').order('created_at', { ascending: true }),
    admin
      .from('payment_references')
      .select('id,property_id,unit_id,bank_import_entry_id,reference,amount,received_at,transaction_at,signed_off')
      .is('unit_id', null)
      .gte('received_at', billingWindow.startDate)
      .lte('received_at', billingWindow.endDate)
      .order('received_at', { ascending: false }),
  ]);

  if (referencesResult.error?.code === '42P01') {
    return {
      setupState: 'missing_tables',
      organizationLabel: organizationsResult.data?.[0]?.name ?? 'Hamba Trading',
      periodKey: resolvedPeriodKey,
      periodLabel,
      billingWindowLabel: billingWindowLabelFromRange(billingWindow.startDate, billingWindow.endDate),
      rows: [],
      locations: [],
      totals: {
        unmatchedCount: 0,
        totalAmount: 0,
      },
    };
  }

  if (organizationsResult.error) {
    throw new Error(`Failed to load organizations: ${organizationsResult.error.message}`);
  }
  if (propertiesResult.error) {
    throw new Error(`Failed to load properties: ${propertiesResult.error.message}`);
  }
  if (referencesResult.error) {
    throw new Error(`Failed to load payment references: ${referencesResult.error.message}`);
  }

  const propertiesById = new Map(
    (propertiesResult.data ?? []).map((property) => [property.id as string, property.name as string])
  );
  const references = (referencesResult.data ?? []) as Array<{
    id: string;
    property_id: string | null;
    bank_import_entry_id: string | null;
    reference: string;
    amount: number | string;
    received_at: string;
    transaction_at: string | null;
    signed_off: boolean;
  }>;

  const entryIds = references.map((reference) => reference.bank_import_entry_id).filter(Boolean) as string[];
  const entryMeta = new Map<
    string,
    { accountSuffix: string | null; payerName: string | null; propertyName: string | null }
  >();
  if (entryIds.length > 0) {
    const { data: entries, error: entriesError } = await admin
      .from('bank_import_entries')
      .select('id,destination_account_suffix,payer_name,raw_metadata')
      .in('id', entryIds);
    if (entriesError) {
      throw new Error(`Failed to load bank import entries: ${entriesError.message}`);
    }
    for (const entry of entries ?? []) {
      const rawMetadata =
        entry.raw_metadata && typeof entry.raw_metadata === 'object'
          ? (entry.raw_metadata as Record<string, unknown>)
          : null;
      entryMeta.set(entry.id as string, {
        accountSuffix: (entry.destination_account_suffix as string) || null,
        payerName: (entry.payer_name as string) || null,
        propertyName: typeof rawMetadata?.propertyName === 'string' ? rawMetadata.propertyName : null,
      });
    }
  }

  const rows: ReferencePoolViewRow[] = references.map((reference) => {
    const meta = reference.bank_import_entry_id ? entryMeta.get(reference.bank_import_entry_id) : undefined;
    const propertyName =
      (reference.property_id ? propertiesById.get(reference.property_id) : null) ??
      meta?.propertyName ??
      'Unassigned';

    return {
      id: reference.id,
      reference: reference.reference,
      amount: toMoney(reference.amount),
      transactionDate: transactionDateOnly(reference.transaction_at, reference.received_at) ?? reference.received_at,
      accountSuffix: meta?.accountSuffix ?? null,
      payerName: meta?.payerName ?? null,
      propertyId: reference.property_id,
      propertyName,
      signedOff: reference.signed_off,
    };
  });

  const locationMap = new Map<string, ReferencePoolLocationSummary>();
  for (const row of rows) {
    const key = row.propertyId ?? `inferred:${row.propertyName}`;
    const current = locationMap.get(key) ?? {
      id: key,
      name: row.propertyName,
      propertyId: row.propertyId,
      referenceCount: 0,
      totalAmount: 0,
    };
    current.referenceCount += 1;
    current.totalAmount += row.amount;
    locationMap.set(key, current);
  }

  const locations = Array.from(locationMap.values()).sort((left, right) => right.totalAmount - left.totalAmount);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return {
    setupState: 'ready',
    organizationLabel: organizationsResult.data?.[0]?.name ?? 'Hamba Trading',
    periodKey: resolvedPeriodKey,
    periodLabel,
    billingWindowLabel: billingWindowLabelFromRange(billingWindow.startDate, billingWindow.endDate),
    rows,
    locations,
    totals: {
      unmatchedCount: rows.length,
      totalAmount,
    },
  };
}
