import { getSupabaseAdmin } from '@/lib/supabase';

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
  reference: string;
  amount: number | string;
  received_at: string;
  signed_off: boolean;
};

export type MonthlyPaymentsMonthSummary = {
  key: string;
  label: string;
  collectionRate: number;
  isCurrent: boolean;
};

export type MonthlyPaymentsLocationSummary = {
  id: string;
  name: string;
  location: string;
  collectedAmount: number;
  expectedAmount: number;
  collectionRate: number;
  occupiedCount: number;
  paidCount: number;
  dueCount: number;
  overdueCount: number;
  blockedCount: number;
  unitCount: number;
};

export type MonthlyPaymentsDashboardSnapshot = {
  setupState: 'ready' | 'empty' | 'missing_tables';
  organizationLabel: string;
  monthLabel: string;
  recentMonths: MonthlyPaymentsMonthSummary[];
  rollingTotal: {
    collectedAmount: number;
    expectedAmount: number;
    collectionRate: number;
    occupiedCount: number;
    blockedCount: number;
    overdueCount: number;
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

function buildMonthStarts(currentMonthStart: Date): Date[] {
  return Array.from({ length: 5 }, (_, index) => addMonths(currentMonthStart, index - 2));
}

export function buildMonthlyPaymentsDashboardSnapshot(
  input: MonthlyPaymentsSnapshotInput,
  options?: { currentDate?: Date; setupState?: MonthlyPaymentsDashboardSnapshot['setupState'] }
): MonthlyPaymentsDashboardSnapshot {
  const currentDate = options?.currentDate ?? new Date();
  const currentMonthStart = toMonthStart(currentDate);
  const currentMonthKey = formatMonthKey(currentMonthStart);
  const monthStarts = buildMonthStarts(currentMonthStart);
  const properties = input.properties;
  const unitsByProperty = new Map<string, MonthlyPaymentsUnitRow[]>();
  const periodsByUnitAndMonth = new Map<string, MonthlyPaymentsPeriodRow>();
  const referencesByPeriod = new Map<string, MonthlyPaymentsReferenceRow[]>();

  for (const unit of input.units) {
    const current = unitsByProperty.get(unit.property_id) ?? [];
    current.push(unit);
    unitsByProperty.set(unit.property_id, current);
  }

  for (const period of input.periods) {
    periodsByUnitAndMonth.set(`${period.unit_id}:${toDateOnlyMonthKey(period.period_start)}`, period);
  }

  for (const reference of input.references) {
    if (!reference.unit_payment_period_id) continue;
    const current = referencesByPeriod.get(reference.unit_payment_period_id) ?? [];
    current.push(reference);
    referencesByPeriod.set(reference.unit_payment_period_id, current);
  }

  const locations = properties.map((property) => {
    const units = unitsByProperty.get(property.id) ?? [];
    let expectedAmount = 0;
    let collectedAmount = 0;
    let occupiedCount = 0;
    let blockedCount = 0;
    let overdueCount = 0;
    let paidCount = 0;
    let dueCount = 0;

    for (const unit of units) {
      const period = periodsByUnitAndMonth.get(`${unit.id}:${currentMonthKey}`);
      const isBlocked = period?.is_blocked ?? unit.is_blocked;
      const expected = isBlocked
        ? 0
        : toMoney(
            period?.expected_amount ?? (unit.occupancy_status === 'occupied' ? unit.rent_amount : 0)
          );
      const signedReferences = period ? referencesByPeriod.get(period.id) ?? [] : [];
      const received = signedReferences
        .filter((reference) => reference.signed_off)
        .reduce((sum, reference) => sum + toMoney(reference.amount), 0);
      const status =
        period?.status ?? (isBlocked ? 'blocked' : unit.occupancy_status === 'occupied' ? 'unpaid' : 'blocked');

      expectedAmount += expected;
      collectedAmount += received;

      if (isBlocked || status === 'blocked') {
        blockedCount += 1;
      } else if (unit.occupancy_status === 'occupied') {
        occupiedCount += 1;
      }

      if (status === 'overdue') overdueCount += 1;
      if (status === 'paid') paidCount += 1;
      if (status === 'unpaid' || status === 'partial' || status === 'mismatch') dueCount += 1;
    }

    return {
      id: property.id,
      name: property.name,
      location: property.location,
      collectedAmount,
      expectedAmount,
      collectionRate: expectedAmount > 0 ? collectedAmount / expectedAmount : 0,
      occupiedCount,
      paidCount,
      dueCount,
      overdueCount,
      blockedCount,
      unitCount: units.length,
    };
  });

  const recentMonths = monthStarts.map((monthStart) => {
    const monthKey = formatMonthKey(monthStart);
    let expectedAmount = 0;
    let collectedAmount = 0;

    for (const unit of input.units) {
      const period = periodsByUnitAndMonth.get(`${unit.id}:${monthKey}`);
      const isCurrentMonth = monthKey === currentMonthKey;
      const isBlocked = period?.is_blocked ?? unit.is_blocked;
      expectedAmount += isBlocked
        ? 0
        : toMoney(
            period?.expected_amount ??
              (isCurrentMonth && unit.occupancy_status === 'occupied' ? unit.rent_amount : 0)
          );

      if (!period) continue;
      const signedReferences = referencesByPeriod.get(period.id) ?? [];
      collectedAmount += signedReferences
        .filter((reference) => reference.signed_off)
        .reduce((sum, reference) => sum + toMoney(reference.amount), 0);
    }

    return {
      key: monthKey,
      label: new Intl.DateTimeFormat('en-ZA', {
        month: 'short',
        timeZone: 'UTC',
      }).format(monthStart),
      collectionRate: expectedAmount > 0 ? collectedAmount / expectedAmount : 0,
      isCurrent: monthKey === currentMonthKey,
    };
  });

  const rollingTotal = locations.reduce(
    (summary, location) => ({
      collectedAmount: summary.collectedAmount + location.collectedAmount,
      expectedAmount: summary.expectedAmount + location.expectedAmount,
      occupiedCount: summary.occupiedCount + location.occupiedCount,
      blockedCount: summary.blockedCount + location.blockedCount,
      overdueCount: summary.overdueCount + location.overdueCount,
    }),
    {
      collectedAmount: 0,
      expectedAmount: 0,
      occupiedCount: 0,
      blockedCount: 0,
      overdueCount: 0,
    }
  );

  const unmatchedReferenceCount = input.references.filter(
    (reference) =>
      toDateOnlyMonthKey(reference.received_at) === currentMonthKey && !reference.unit_payment_period_id
  ).length;

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
    rollingTotal: {
      ...rollingTotal,
      collectionRate:
        rollingTotal.expectedAmount > 0
          ? rollingTotal.collectedAmount / rollingTotal.expectedAmount
          : 0,
    },
    locations: locations.sort((left, right) => right.expectedAmount - left.expectedAmount),
    unmatchedReferenceCount,
  };
}

export async function readMonthlyPaymentsDashboard(): Promise<MonthlyPaymentsDashboardSnapshot> {
  const admin = getSupabaseAdmin();
  const currentMonthStart = toMonthStart(new Date());
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
        .select('id,organization_id,property_id,unit_id,unit_payment_period_id,reference,amount,received_at,signed_off')
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

  return buildMonthlyPaymentsDashboardSnapshot({
    organizations: organizationsResult.data ?? [],
    properties: propertiesResult.data ?? [],
    units: unitsResult.data ?? [],
    periods: periodsResult.data ?? [],
    references: referencesResult.data ?? [],
  });
}
