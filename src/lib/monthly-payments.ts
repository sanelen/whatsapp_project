import { getSupabaseAdmin } from '@/lib/supabase';
import { getBillingPeriodForDate, getBillingWindowForPeriod } from '@/lib/bank-import';
import { ensurePaymentPeriodsForPeriod } from '@/lib/monthly-payments-ops';

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

function billingPeriodKeyForReferenceDate(value: string): string {
  try {
    return getBillingPeriodForDate(value);
  } catch {
    return toDateOnlyMonthKey(value);
  }
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
  const referencesByPropertyAndMonth = new Map<string, MonthlyPaymentsReferenceRow[]>();
  const referencesByMonth = new Map<string, MonthlyPaymentsReferenceRow[]>();
  const referencesByInferredLocationAndMonth = new Map<string, MonthlyPaymentsReferenceRow[]>();

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

    if (!reference.unit_payment_period_id) continue;
    const current = referencesByPeriod.get(reference.unit_payment_period_id) ?? [];
    current.push(reference);
    referencesByPeriod.set(reference.unit_payment_period_id, current);
  }

  const propertyLocations = properties.map((property) => {
    const units = unitsByProperty.get(property.id) ?? [];
    const currentMonthReferences =
      referencesByPropertyAndMonth.get(`${property.id}:${currentMonthKey}`) ?? [];
    let expectedAmount = 0;
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
      const status =
        period?.status ?? (isBlocked ? 'blocked' : unit.occupancy_status === 'occupied' ? 'unpaid' : 'blocked');

      expectedAmount += expected;

      if (isBlocked || status === 'blocked') {
        blockedCount += 1;
      } else if (unit.occupancy_status === 'occupied') {
        occupiedCount += 1;
      }

      if (status === 'overdue') overdueCount += 1;
      if (status === 'paid') paidCount += 1;
      if (status === 'unpaid' || status === 'partial' || status === 'mismatch') dueCount += 1;
    }

    const collectedAmount = currentMonthReferences.reduce(
      (sum, reference) => sum + toMoney(reference.amount),
      0
    );

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

  const inferredLocationNames = Array.from(
    new Set(
      (referencesByMonth.get(currentMonthKey) ?? [])
        .filter((reference) => !reference.property_id && reference.inferred_location_name)
        .map((reference) => reference.inferred_location_name as string)
    )
  );

  const inferredLocations = inferredLocationNames.map((name) => {
    const references = referencesByInferredLocationAndMonth.get(`${name}:${currentMonthKey}`) ?? [];
    const collectedAmount = references.reduce((sum, reference) => sum + toMoney(reference.amount), 0);

    return {
      id: `inferred:${name}`,
      name,
      location: 'Imported bank references',
      collectedAmount,
      expectedAmount: 0,
      collectionRate: 0,
      occupiedCount: 0,
      paidCount: 0,
      dueCount: references.length,
      overdueCount: 0,
      blockedCount: 0,
      unitCount: 0,
    };
  });

  const locations = [...propertyLocations, ...inferredLocations];

  const recentMonths = monthStarts.map((monthStart) => {
    const monthKey = formatMonthKey(monthStart);
    let expectedAmount = 0;

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
    }

    const collectedAmount = (referencesByMonth.get(monthKey) ?? []).reduce(
      (sum, reference) => sum + toMoney(reference.amount),
      0
    );

    return {
      key: monthKey,
      label: new Intl.DateTimeFormat('en-ZA', {
        month: 'short',
        timeZone: 'UTC',
      }).format(monthStart),
      collectedAmount,
      expectedAmount,
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

  const unmatchedPropertylessCollectedAmount = (referencesByMonth.get(currentMonthKey) ?? [])
    .filter((reference) => !reference.property_id && !reference.inferred_location_name)
    .reduce((sum, reference) => sum + toMoney(reference.amount), 0);

  const unmatchedReferenceCount = input.references.filter(
    (reference) =>
      billingPeriodKeyForReferenceDate(reference.received_at) === currentMonthKey && !reference.unit_payment_period_id
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
      collectedAmount: rollingTotal.collectedAmount + unmatchedPropertylessCollectedAmount,
      collectionRate:
        rollingTotal.expectedAmount > 0
          ? (rollingTotal.collectedAmount + unmatchedPropertylessCollectedAmount) / rollingTotal.expectedAmount
          : 0,
    },
    locations: locations.sort((left, right) => right.expectedAmount - left.expectedAmount),
    unmatchedReferenceCount,
  };
}

export async function readMonthlyPaymentsDashboard(): Promise<MonthlyPaymentsDashboardSnapshot> {
  const admin = getSupabaseAdmin();
  const currentMonthStart = toMonthStart(new Date());
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

export type UnitTableStatus = 'paid' | 'unpaid' | 'partial' | 'mismatch' | 'overdue' | 'blocked';

export type UnitTableRow = {
  unitId: string;
  label: string;
  occupancy: 'occupied' | 'vacant';
  contacts: string[];
  expectedAmount: number;
  expectedReference: string;
  matchKeywords: string[];
  periodId: string | null;
  reference: string | null;
  referenceId: string | null;
  transactionDate: string | null;
  receivedAmount: number | null;
  signedOff: boolean;
  locked: boolean;
  status: UnitTableStatus;
  overdueDays: number | null;
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
  totals: { unitCount: number; blockedCount: number; collected: number; expected: number };
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
    if (unit.occupancy_status === 'occupied') occupiedCount += 1;
    if (unit.occupancy_status === 'vacant') vacantCount += 1;
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

  const [propertyResult, unitsResult, referencesResult] = await Promise.all([
    admin
      .from('properties')
      .select('id,organization_id,name, organizations(name)')
      .eq('id', propertyId)
      .maybeSingle<{ id: string; organization_id: string; name: string; organizations: { name: string } | null }>(),
    admin
      .from('property_units')
      .select('id,property_id,label,contact_primary,contact_secondary,rent_amount,occupancy_status,is_blocked,expected_reference,match_keywords,display_order')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true }),
    admin
      .from('payment_references')
      .select('id,property_id,unit_id,unit_payment_period_id,bank_import_entry_id,reference,amount,received_at,transaction_at,signed_off')
      .eq('property_id', propertyId)
      .gte('received_at', billingWindow.startDate)
      .lte('received_at', billingWindow.endDate),
  ]);

  if (unitsResult.error?.code === '42P01' || referencesResult.error?.code === '42P01') {
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
      totals: { unitCount: 0, blockedCount: 0, collected: 0, expected: 0 },
    };
  }
  if (propertyResult.error) throw new Error(`Failed to load property: ${propertyResult.error.message}`);
  if (unitsResult.error) throw new Error(`Failed to load property units: ${unitsResult.error.message}`);
  if (referencesResult.error) throw new Error(`Failed to load payment references: ${referencesResult.error.message}`);

  const units = (unitsResult.data ?? []) as Array<{
    id: string;
    label: string;
    contact_primary: string;
    contact_secondary: string;
    rent_amount: number | string;
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

  // Periods for these units in the selected month.
  const unitIds = units.map((unit) => unit.id);
  const periodsByUnit = new Map<string, { id: string; expected_amount: number | string; status: string; is_blocked: boolean; due_date: string | null }>();
  if (unitIds.length > 0) {
    const { data: periods, error: periodsError } = await admin
      .from('unit_payment_periods')
      .select('id,unit_id,expected_amount,status,is_blocked,due_date')
      .in('unit_id', unitIds)
      .gte('period_start', monthStartDate)
      .lt('period_start', nextMonthDate);
    if (periodsError && periodsError.code !== '42P01') {
      throw new Error(`Failed to load unit payment periods: ${periodsError.message}`);
    }
    for (const period of periods ?? []) {
      periodsByUnit.set(period.unit_id as string, period as never);
    }
  }

  // Bank-entry metadata (account suffix + payer) for the reference pool display.
  const entryIds = references.map((reference) => reference.bank_import_entry_id).filter(Boolean) as string[];
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

  let collected = 0;
  let expectedTotal = 0;
  let blockedCount = 0;

  const rows: UnitTableRow[] = units.map((unit) => {
    const period = periodsByUnit.get(unit.id);
    const isBlocked = unit.is_blocked || (period?.is_blocked ?? false) || unit.occupancy_status === 'vacant';
    const expectedAmount = isBlocked ? 0 : toMoney(period?.expected_amount ?? unit.rent_amount);
    expectedTotal += expectedAmount;
    if (isBlocked) blockedCount += 1;

    const matched = (referencesByUnit.get(unit.id) ?? []).slice().sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
    const primary = matched[0] ?? null;
    const receivedAmount = matched.length ? matched.reduce((sum, r) => sum + toMoney(r.amount), 0) : null;
    const signedOff = matched.length > 0 && matched.every((r) => r.signed_off);
    if (signedOff && receivedAmount) collected += receivedAmount;

    let status: UnitTableStatus;
    let overdueDays: number | null = null;
    if (isBlocked) {
      status = 'blocked';
    } else if (primary) {
      status = receivedAmount !== null && Math.abs(receivedAmount - expectedAmount) <= 0.001
        ? (signedOff ? 'paid' : 'unpaid')
        : 'mismatch';
    } else if (period?.due_date && diffDaysUtc(period.due_date, now) > 0) {
      status = 'overdue';
      overdueDays = diffDaysUtc(period.due_date, now);
    } else {
      status = 'unpaid';
    }

    return {
      unitId: unit.id,
      label: unit.label,
      occupancy: unit.occupancy_status,
      contacts: cleanContacts(unit.contact_primary, unit.contact_secondary),
      expectedAmount,
      expectedReference: unit.expected_reference ?? '',
      matchKeywords: unit.match_keywords ?? [],
      periodId: period?.id ?? null,
      reference: primary?.reference ?? null,
      referenceId: primary?.id ?? null,
      transactionDate: transactionDateOnly(primary?.transaction_at, primary?.received_at),
      receivedAmount,
      signedOff,
      locked: signedOff,
      status,
      overdueDays,
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
    totals: { unitCount: units.length, blockedCount, collected, expected: expectedTotal },
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
