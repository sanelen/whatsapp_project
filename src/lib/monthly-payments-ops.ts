import { getSupabaseAdmin } from '@/lib/supabase';
import { getBillingPeriodForDate, getBillingWindowForPeriod } from '@/lib/bank-import';
import { computeUnitStatus } from '@/lib/monthly-payment-status';
import {
  computeCreditAllocationOptions,
  computeOverpaymentAllocation,
  roundMoney,
  shiftPeriodStart,
} from '@/lib/payment-allocation';
import {
  resolveAutoMatch,
  shouldOfferReferenceRule,
  unitHintsCoverReference,
  type AutoMatchHint,
} from '@/lib/auto-match';

function toMoney(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusForUnitPeriod(input: {
  occupancyStatus: 'occupied' | 'vacant';
  isBlocked: boolean;
}) {
  if (input.isBlocked || input.occupancyStatus === 'vacant') return 'blocked';
  return 'unpaid';
}

export async function ensurePaymentPeriodsForPeriod(input: {
  periodKey: string;
  propertyId?: string;
}) {
  const admin = getSupabaseAdmin();
  const periodStart = `${input.periodKey}-01`;
  const nextPeriod = new Date(`${input.periodKey}-01T00:00:00Z`);
  nextPeriod.setUTCMonth(nextPeriod.getUTCMonth() + 1);
  const nextPeriodStart = nextPeriod.toISOString().slice(0, 10);
  const billingWindow = getBillingWindowForPeriod(input.periodKey);

  let query = admin
    .from('property_units')
    .select('id,property_id,rent_amount,occupancy_status,is_blocked')
    .order('display_order', { ascending: true });
  if (input.propertyId) {
    query = query.eq('property_id', input.propertyId);
  }

  const { data: units, error: unitsError } = await query;
  if (unitsError) {
    throw new Error(`Failed to load property units for period bootstrap: ${unitsError.message}`);
  }

  if ((units ?? []).length === 0) return { created: 0, updated: 0 };

  const unitIds = (units ?? []).map((unit) => unit.id as string);
  const { data: existingPeriods, error: periodsError } = await admin
    .from('unit_payment_periods')
    .select('id,unit_id,due_date')
    .in('unit_id', unitIds)
    .gte('period_start', periodStart)
    .lt('period_start', nextPeriodStart);

  if (periodsError) {
    throw new Error(`Failed to load existing payment periods: ${periodsError.message}`);
  }

  const existingByUnit = new Map((existingPeriods ?? []).map((period) => [period.unit_id as string, period]));
  const inserts = (units ?? [])
    .filter((unit) => !existingByUnit.has(unit.id as string))
    .map((unit) => ({
      unit_id: unit.id,
      period_start: periodStart,
      expected_amount:
        unit.is_blocked || unit.occupancy_status === 'vacant' ? 0 : toMoney(unit.rent_amount as number | string),
      status: statusForUnitPeriod({
        occupancyStatus: unit.occupancy_status as 'occupied' | 'vacant',
        isBlocked: Boolean(unit.is_blocked),
      }),
      is_blocked: Boolean(unit.is_blocked) || unit.occupancy_status === 'vacant',
      due_date: billingWindow.endDate,
      note: '',
    }));

  if (inserts.length > 0) {
    const { error: insertError } = await admin.from('unit_payment_periods').insert(inserts);
    if (insertError) {
      throw new Error(`Failed to create payment periods: ${insertError.message}`);
    }
  }

  const missingDueDateIds = (existingPeriods ?? [])
    .filter((period) => !period.due_date)
    .map((period) => period.id as string);

  if (missingDueDateIds.length > 0) {
    const { error: dueDateError } = await admin
      .from('unit_payment_periods')
      .update({ due_date: billingWindow.endDate })
      .in('id', missingDueDateIds);
    if (dueDateError) {
      throw new Error(`Failed to backfill period due dates: ${dueDateError.message}`);
    }
  }

  return { created: inserts.length, updated: missingDueDateIds.length };
}

async function logPaymentMatchEvent(input: {
  organizationId: string;
  propertyId: string | null;
  unitId: string | null;
  unitPaymentPeriodId: string | null;
  paymentReferenceId: string | null;
  eventType:
    | 'matched'
    | 'unmatched'
    | 'signed_off'
    | 'reverse_signed_off'
    | 'blocked'
    | 'unblocked'
    | 'status_changed'
    | 'note_added'
    | 'deposit_split_accepted'
    | 'deposit_split_reversed'
    | 'credit_held'
    | 'credit_allocated'
    | 'credit_allocation_reversed';
  actor: string;
  referenceText: string;
  amount: number;
  expectedAmount: number;
  previousStatus?: string | null;
  newStatus?: string | null;
  note?: string;
}) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('payment_match_events').insert({
    organization_id: input.organizationId,
    property_id: input.propertyId,
    unit_id: input.unitId,
    unit_payment_period_id: input.unitPaymentPeriodId,
    payment_reference_id: input.paymentReferenceId,
    event_type: input.eventType,
    actor: input.actor,
    reference_text: input.referenceText,
    amount: input.amount,
    expected_amount: input.expectedAmount,
    previous_status: input.previousStatus ?? '',
    new_status: input.newStatus ?? '',
    note: input.note ?? '',
  });
  if (error) {
    throw new Error(`Failed to log payment event: ${error.message}`);
  }
}

function persistedPeriodStatusFromComputed(
  status: ReturnType<typeof computeUnitStatus>['status']
): 'unpaid' | 'partial' | 'paid' | 'overdue' | 'blocked' | 'mismatch' {
  switch (status) {
    case 'paid':
      return 'paid';
    case 'partial':
      return 'partial';
    case 'overdue':
      return 'overdue';
    case 'blocked':
      return 'blocked';
    case 'overpaid':
      return 'mismatch';
    case 'pending':
    case 'unpaid':
    default:
      return 'unpaid';
  }
}

async function activeContributionAmountsByReference(paymentReferenceIds: string[]): Promise<Map<string, number>> {
  if (paymentReferenceIds.length === 0) return new Map();
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('deposit_contributions')
    .select('payment_reference_id,amount,reversed_at')
    .in('payment_reference_id', paymentReferenceIds)
    .is('reversed_at', null);
  if (error) {
    if (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205') return new Map();
    throw new Error(`Failed to load deposit contributions: ${error.message}`);
  }
  const amounts = new Map<string, number>();
  for (const row of data ?? []) {
    const referenceId = row.payment_reference_id as string | null;
    if (!referenceId) continue;
    amounts.set(referenceId, toMoney(row.amount as number | string) + (amounts.get(referenceId) ?? 0));
  }
  return amounts;
}

async function activeContributionBalanceForUnit(unitId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('deposit_contributions')
    .select('amount,reversed_at')
    .eq('unit_id', unitId)
    .is('reversed_at', null);
  if (error) {
    if (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205') return 0;
    throw new Error(`Failed to load unit deposit balance: ${error.message}`);
  }
  return roundMoney((data ?? []).reduce((sum, row) => sum + toMoney(row.amount as number | string), 0));
}

const MISSING_TABLE_CODES = new Set(['42P01', '42703', 'PGRST205']);

/** Held credit = non-reversed credits − non-reversed allocations (FR-2.8 rulings 2026-07-03). */
async function activeCreditBalanceForUnit(unitId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const [credits, allocations] = await Promise.all([
    admin.from('unit_credits').select('amount').eq('unit_id', unitId).is('reversed_at', null),
    admin.from('unit_credit_allocations').select('amount').eq('unit_id', unitId).is('reversed_at', null),
  ]);
  if (credits.error && !MISSING_TABLE_CODES.has(credits.error.code ?? '')) {
    throw new Error(`Failed to load unit credits: ${credits.error.message}`);
  }
  if (allocations.error && !MISSING_TABLE_CODES.has(allocations.error.code ?? '')) {
    throw new Error(`Failed to load credit allocations: ${allocations.error.message}`);
  }
  const earned = (credits.data ?? []).reduce((sum, row) => sum + toMoney(row.amount as number | string), 0);
  const spent = (allocations.data ?? []).reduce((sum, row) => sum + toMoney(row.amount as number | string), 0);
  return roundMoney(earned - spent);
}

/** Credit applied to a period (arrears/advance allocations) counts toward its received side. */
async function activeCreditAppliedForPeriod(periodId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('unit_credit_allocations')
    .select('amount,destination')
    .eq('target_period_id', periodId)
    .in('destination', ['arrears', 'advance'])
    .is('reversed_at', null);
  if (error) {
    if (MISSING_TABLE_CODES.has(error.code ?? '')) return 0;
    throw new Error(`Failed to load credit applied to period: ${error.message}`);
  }
  return roundMoney((data ?? []).reduce((sum, row) => sum + toMoney(row.amount as number | string), 0));
}

async function recomputeAndPersistPeriodStatus(periodId: string) {
  const admin = getSupabaseAdmin();
  const { data: period, error: periodError } = await admin
    .from('unit_payment_periods')
    .select('id,unit_id,expected_amount,status,is_blocked,due_date')
    .eq('id', periodId)
    .maybeSingle<{
      id: string;
      unit_id: string;
      expected_amount: number | string;
      status: string;
      is_blocked: boolean;
      due_date: string | null;
    }>();
  if (periodError || !period) throw new Error(periodError?.message ?? 'Unit payment period not found');

  const { data: unit, error: unitError } = await admin
    .from('property_units')
    .select('id,occupancy_status,is_blocked,deposit_amount')
    .eq('id', period.unit_id)
    .maybeSingle<{ id: string; occupancy_status: 'occupied' | 'vacant'; is_blocked: boolean; deposit_amount: number | string }>();
  if (unitError || !unit) throw new Error(unitError?.message ?? 'Unit not found for period recompute');

  const { data: matchedReferences, error: referencesError } = await admin
    .from('payment_references')
    .select('id,amount,signed_off')
    .eq('unit_payment_period_id', periodId);
  if (referencesError) throw new Error(`Failed to load matched references for period recompute: ${referencesError.message}`);

  const referenceIds = (matchedReferences ?? []).map((reference) => reference.id as string);
  const contributionsByReference = await activeContributionAmountsByReference(referenceIds);
  const depositContributedAmount = roundMoney(
    referenceIds.reduce((sum, referenceId) => sum + (contributionsByReference.get(referenceId) ?? 0), 0)
  );
  const depositBalance = await activeContributionBalanceForUnit(unit.id);
  const creditAppliedAmount = await activeCreditAppliedForPeriod(periodId);

  const computed = computeUnitStatus({
    occupancyStatus: unit.occupancy_status,
    isBlocked: Boolean(unit.is_blocked) || Boolean(period.is_blocked),
    expectedAmount: toMoney(period.expected_amount),
    depositAmount: roundMoney(Math.max(0, toMoney(unit.deposit_amount) - depositBalance)),
    depositContributedAmount,
    creditAppliedAmount,
    matchedReferences: (matchedReferences ?? []).map((reference) => ({
      amount: reference.amount as number | string,
      signed_off: Boolean(reference.signed_off),
    })),
    dueDate: period.due_date,
    now: new Date(),
  });

  const persistedStatus = persistedPeriodStatusFromComputed(computed.status);
  if (persistedStatus !== period.status) {
    const { error: updateError } = await admin.from('unit_payment_periods').update({ status: persistedStatus }).eq('id', periodId);
    if (updateError) throw new Error(`Failed to recompute unit payment period status: ${updateError.message}`);
  }

  return {
    previousStatus: period.status,
    computedStatus: computed.status,
    persistedStatus,
    expectedAmount: toMoney(period.expected_amount),
  };
}

export async function recomputePaymentPeriodStatuses(periodIds: string[]) {
  const uniqueIds = Array.from(new Set(periodIds.filter(Boolean)));
  for (const periodId of uniqueIds) await recomputeAndPersistPeriodStatus(periodId);
  return { recomputed: uniqueIds.length };
}

export async function matchReferenceToUnit(input: {
  propertyId: string;
  unitId: string;
  paymentReferenceId: string;
  actor: string;
  /** 'manual' (default) for operator drawer; 'auto_reference' for the auto-match job. */
  matchMethod?: 'manual' | 'auto_reference' | 'auto_keyword' | 'auto_amount';
}) {
  const admin = getSupabaseAdmin();
  const { data: reference, error: referenceError } = await admin
    .from('payment_references')
    .select('id,organization_id,property_id,unit_id,unit_payment_period_id,reference,amount,received_at,signed_off')
    .eq('id', input.paymentReferenceId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      property_id: string | null;
      unit_id: string | null;
      unit_payment_period_id: string | null;
      reference: string;
      amount: number | string;
      received_at: string;
      signed_off: boolean;
    }>();
  if (referenceError || !reference) {
    throw new Error(referenceError?.message ?? 'Payment reference not found');
  }
  if (reference.signed_off) {
    throw new Error('Signed-off references must be reversed before re-matching');
  }
  if (reference.property_id && reference.property_id !== input.propertyId) {
    throw new Error('Reference belongs to a different property');
  }

  const periodKey = getBillingPeriodForDate(reference.received_at);
  await ensurePaymentPeriodsForPeriod({ periodKey, propertyId: input.propertyId });

  const periodStart = `${periodKey}-01`;
  const nextPeriod = new Date(`${periodKey}-01T00:00:00Z`);
  nextPeriod.setUTCMonth(nextPeriod.getUTCMonth() + 1);
  const nextPeriodStart = nextPeriod.toISOString().slice(0, 10);

  const { data: unit, error: unitError } = await admin
    .from('property_units')
    .select('id,property_id,rent_amount,occupancy_status,is_blocked')
    .eq('id', input.unitId)
    .eq('property_id', input.propertyId)
    .maybeSingle<{ id: string; property_id: string; rent_amount: number | string; occupancy_status: 'occupied' | 'vacant'; is_blocked: boolean }>();
  if (unitError || !unit) {
    throw new Error(unitError?.message ?? 'Unit not found');
  }

  const { data: period, error: periodError } = await admin
    .from('unit_payment_periods')
    .select('id,expected_amount,status,is_blocked')
    .eq('unit_id', input.unitId)
    .gte('period_start', periodStart)
    .lt('period_start', nextPeriodStart)
    .maybeSingle<{ id: string; expected_amount: number | string; status: string; is_blocked: boolean }>();
  if (periodError || !period) {
    throw new Error(periodError?.message ?? 'Unit payment period not found');
  }

  const amount = toMoney(reference.amount);

  const { error: updateReferenceError } = await admin
    .from('payment_references')
    .update({
      property_id: input.propertyId,
      unit_id: input.unitId,
      unit_payment_period_id: period.id,
      matched_at: new Date().toISOString(),
      matched_by: input.actor,
      match_method: input.matchMethod ?? 'manual',
      signed_off: false,
      signed_off_at: null,
      signed_off_by: '',
    })
    .eq('id', input.paymentReferenceId);
  if (updateReferenceError) {
    throw new Error(`Failed to match payment reference: ${updateReferenceError.message}`);
  }

  const recomputed = await recomputeAndPersistPeriodStatus(period.id);

  await logPaymentMatchEvent({
    organizationId: reference.organization_id,
    propertyId: input.propertyId,
    unitId: input.unitId,
    unitPaymentPeriodId: period.id,
    paymentReferenceId: reference.id,
    eventType: 'matched',
    actor: input.actor,
    referenceText: reference.reference,
    amount,
    expectedAmount: recomputed.expectedAmount,
    previousStatus: period.status,
    newStatus: recomputed.persistedStatus,
  });

  if (period.status !== recomputed.persistedStatus) {
    await logPaymentMatchEvent({
      organizationId: reference.organization_id,
      propertyId: input.propertyId,
      unitId: input.unitId,
      unitPaymentPeriodId: period.id,
      paymentReferenceId: reference.id,
      eventType: 'status_changed',
      actor: input.actor,
      referenceText: reference.reference,
      amount,
      expectedAmount: recomputed.expectedAmount,
      previousStatus: period.status,
      newStatus: recomputed.persistedStatus,
    });
  }

  return { matched: true, status: recomputed.computedStatus, persistedStatus: recomputed.persistedStatus };
}

/**
 * Auto-match job (owner request 2026-07-02): re-runnable matching for
 * already-imported references, so refs imported before rooms/rules existed get
 * a second chance. Runs after every import and on demand from the units page.
 *
 * Rules: only an UNAMBIGUOUS rule hit matches (all firing rules agree on one
 * unit); ambiguous refs stay in the pool for operator review; nothing is ever
 * signed off automatically.
 */
export async function autoMatchUnmatchedReferences(input: {
  propertyId?: string;
  actor: string;
}) {
  const admin = getSupabaseAdmin();

  let referenceQuery = admin
    .from('payment_references')
    .select('id,property_id,reference,amount,bank_import_entry_id')
    .is('unit_id', null)
    .eq('signed_off', false);
  if (input.propertyId) referenceQuery = referenceQuery.eq('property_id', input.propertyId);
  const { data: references, error: referencesError } = await referenceQuery;
  if (referencesError) throw new Error(`Failed to load unmatched references: ${referencesError.message}`);
  if (!references || references.length === 0) {
    return { scanned: 0, matched: 0, ambiguous: 0, unmatched: 0, failed: 0 };
  }

  let hintQuery = admin
    .from('bank_import_unit_match_hints')
    .select('id,unit_id,property_id,matcher_type,matcher_value,amount_value,priority,is_active')
    .eq('is_active', true);
  if (input.propertyId) hintQuery = hintQuery.eq('property_id', input.propertyId);
  const { data: hints, error: hintsError } = await hintQuery;
  if (hintsError) throw new Error(`Failed to load match hints: ${hintsError.message}`);

  // Payer names (for payer_name_contains rules) come from the bank entries.
  const entryIds = references.map((reference) => reference.bank_import_entry_id).filter(Boolean) as string[];
  const payerByEntry = new Map<string, string>();
  if (entryIds.length > 0) {
    const { data: entries } = await admin
      .from('bank_import_entries')
      .select('id,payer_name')
      .in('id', entryIds);
    for (const entry of entries ?? []) {
      payerByEntry.set(entry.id as string, (entry.payer_name as string) ?? '');
    }
  }

  const hintById = new Map((hints ?? []).map((hint) => [hint.id as string, hint]));
  let matched = 0;
  let ambiguous = 0;
  let unmatchedCount = 0;
  let failed = 0;

  for (const reference of references) {
    const resolution = resolveAutoMatch(
      {
        id: reference.id as string,
        property_id: reference.property_id as string | null,
        reference: (reference.reference as string) ?? '',
        payerName: reference.bank_import_entry_id
          ? (payerByEntry.get(reference.bank_import_entry_id as string) ?? '')
          : '',
        amount: toMoney(reference.amount as number | string),
      },
      (hints ?? []) as AutoMatchHint[]
    );

    if (resolution.kind === 'none') {
      unmatchedCount += 1;
      continue;
    }
    if (resolution.kind === 'ambiguous') {
      ambiguous += 1;
      continue;
    }

    const winningHint = hintById.get(resolution.hintId);
    const targetPropertyId = (reference.property_id as string | null) ?? (winningHint?.property_id as string | null);
    if (!targetPropertyId) {
      // Cannot place a propertyless reference without a property-scoped rule.
      unmatchedCount += 1;
      continue;
    }

    try {
      await matchReferenceToUnit({
        propertyId: targetPropertyId,
        unitId: resolution.unitId,
        paymentReferenceId: reference.id as string,
        actor: input.actor,
        matchMethod: 'auto_reference',
      });
      matched += 1;
    } catch {
      // e.g. blocked unit / missing period — leave for manual review.
      failed += 1;
    }
  }

  return { scanned: references.length, matched, ambiguous, unmatched: unmatchedCount, failed };
}

/**
 * FR-2.7b: after a sign-off, decide whether to ask the operator "Add this
 * reference to this unit's reference list?". Suggest only when none of the
 * unit's active rules would have auto-matched the reference (payer name is
 * looked up from the bank entry so payer_name_contains rules count too).
 * Degrades to "no suggestion" when the hints table is missing — a rule could
 * not be stored anyway.
 */
async function computeReferenceRuleSuggestion(input: {
  unitId: string;
  propertyId: string | null;
  referenceText: string;
  amount: number;
  bankImportEntryId: string | null;
}): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: hints, error: hintsError } = await admin
    .from('bank_import_unit_match_hints')
    .select('id,unit_id,property_id,matcher_type,matcher_value,amount_value,priority,is_active')
    .eq('unit_id', input.unitId)
    .eq('is_active', true);
  if (hintsError) {
    if (MISSING_TABLE_CODES.has(hintsError.code ?? '')) return false;
    throw new Error(`Failed to load unit match hints: ${hintsError.message}`);
  }

  let payerName = '';
  if (input.bankImportEntryId) {
    const { data: entry } = await admin
      .from('bank_import_entries')
      .select('payer_name')
      .eq('id', input.bankImportEntryId)
      .maybeSingle<{ payer_name: string | null }>();
    payerName = entry?.payer_name ?? '';
  }

  return shouldOfferReferenceRule(
    {
      id: 'sign-off-check',
      property_id: input.propertyId,
      reference: input.referenceText,
      payerName,
      amount: input.amount,
    },
    (hints ?? []) as AutoMatchHint[],
    input.unitId
  );
}

/**
 * FR-2.7b accept path: persist a reference_equals rule for the unit so next
 * month's auto-match catches the same reference text. No-op (added: false)
 * when an active rule already covers the reference. Only ever called from an
 * explicit operator "yes" — owner wants this as a question, never automatic.
 */
export async function addUnitReferenceRule(input: {
  paymentReferenceId: string;
  unitId: string;
  actor: string;
}) {
  const admin = getSupabaseAdmin();
  const { data: reference, error: referenceError } = await admin
    .from('payment_references')
    .select('id,organization_id,property_id,unit_id,unit_payment_period_id,reference,amount,bank_import_entry_id')
    .eq('id', input.paymentReferenceId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      property_id: string | null;
      unit_id: string | null;
      unit_payment_period_id: string | null;
      reference: string;
      amount: number | string;
      bank_import_entry_id: string | null;
    }>();
  if (referenceError || !reference) throw new Error(referenceError?.message ?? 'Payment reference not found');
  if (reference.unit_id !== input.unitId) {
    throw new Error('Reference is not matched to this unit');
  }
  const referenceText = reference.reference.trim();
  if (referenceText.length < 4) {
    throw new Error('Reference text is too short to become a match rule');
  }

  const { data: unit, error: unitError } = await admin
    .from('property_units')
    .select('id,property_id')
    .eq('id', input.unitId)
    .maybeSingle<{ id: string; property_id: string }>();
  if (unitError || !unit) throw new Error(unitError?.message ?? 'Unit not found');

  const { data: hints, error: hintsError } = await admin
    .from('bank_import_unit_match_hints')
    .select('id,unit_id,property_id,matcher_type,matcher_value,amount_value,priority,is_active')
    .eq('unit_id', input.unitId)
    .eq('is_active', true);
  if (hintsError) throw new Error(`Failed to load unit match hints: ${hintsError.message}`);

  let payerName = '';
  if (reference.bank_import_entry_id) {
    const { data: entry } = await admin
      .from('bank_import_entries')
      .select('payer_name')
      .eq('id', reference.bank_import_entry_id)
      .maybeSingle<{ payer_name: string | null }>();
    payerName = entry?.payer_name ?? '';
  }

  const alreadyCovered = unitHintsCoverReference(
    {
      id: reference.id,
      property_id: reference.property_id,
      reference: referenceText,
      payerName,
      amount: toMoney(reference.amount),
    },
    (hints ?? []) as AutoMatchHint[],
    input.unitId
  );
  if (alreadyCovered) {
    return { added: false, alreadyCovered: true };
  }

  const { error: insertError } = await admin.from('bank_import_unit_match_hints').insert({
    organization_id: reference.organization_id,
    property_id: unit.property_id,
    unit_id: input.unitId,
    matcher_type: 'reference_equals',
    matcher_value: referenceText,
    priority: 100,
    notes: `Added from sign-off (FR-2.7b) by ${input.actor}`,
    is_active: true,
  });
  if (insertError) throw new Error(`Failed to add reference rule: ${insertError.message}`);

  await logPaymentMatchEvent({
    organizationId: reference.organization_id,
    propertyId: reference.property_id,
    unitId: input.unitId,
    unitPaymentPeriodId: reference.unit_payment_period_id,
    paymentReferenceId: reference.id,
    eventType: 'note_added',
    actor: input.actor,
    referenceText,
    amount: toMoney(reference.amount),
    expectedAmount: 0,
    note: `Reference rule added on sign-off (FR-2.7b): "${referenceText}" now auto-matches this unit`,
  });

  return { added: true, alreadyCovered: false };
}

export async function signOffMatchedReference(input: {
  paymentReferenceId: string;
  actor: string;
}) {
  const admin = getSupabaseAdmin();
  const { data: reference, error: referenceError } = await admin
    .from('payment_references')
    .select('id,organization_id,property_id,unit_id,unit_payment_period_id,reference,amount,signed_off,bank_import_entry_id')
    .eq('id', input.paymentReferenceId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      property_id: string | null;
      unit_id: string | null;
      unit_payment_period_id: string | null;
      reference: string;
      amount: number | string;
      signed_off: boolean;
      bank_import_entry_id: string | null;
    }>();
  if (referenceError || !reference) throw new Error(referenceError?.message ?? 'Payment reference not found');
  if (!reference.unit_id || !reference.unit_payment_period_id) throw new Error('Reference must be matched before sign-off');
  if (reference.signed_off) return { signedOff: true };

  const { data: period, error: periodError } = await admin
    .from('unit_payment_periods')
    .select('id,expected_amount,status')
    .eq('id', reference.unit_payment_period_id)
    .maybeSingle<{ id: string; expected_amount: number | string; status: string }>();
  if (periodError || !period) throw new Error(periodError?.message ?? 'Unit payment period not found');

  const amount = toMoney(reference.amount);

  const contributedAmount = await activeContributionAmountForReference(reference.id);
  const effectiveAmount = roundMoney(amount - contributedAmount);
  if (effectiveAmount > toMoney(period.expected_amount) && Math.abs(effectiveAmount - toMoney(period.expected_amount)) > 0.001) {
    throw new Error('Overpaid rows need the deposit split accepted (or the match reviewed) before sign-off');
  }

  const { error: referenceUpdateError } = await admin
    .from('payment_references')
    .update({
      signed_off: true,
      signed_off_at: new Date().toISOString(),
      signed_off_by: input.actor,
    })
    .eq('id', input.paymentReferenceId);
  if (referenceUpdateError) throw new Error(`Failed to sign off payment reference: ${referenceUpdateError.message}`);

  const recomputed = await recomputeAndPersistPeriodStatus(period.id);

  await logPaymentMatchEvent({
    organizationId: reference.organization_id,
    propertyId: reference.property_id,
    unitId: reference.unit_id,
    unitPaymentPeriodId: period.id,
    paymentReferenceId: reference.id,
    eventType: 'signed_off',
    actor: input.actor,
    referenceText: reference.reference,
    amount,
    expectedAmount: recomputed.expectedAmount,
    previousStatus: period.status,
    newStatus: recomputed.persistedStatus,
  });

  // FR-2.7b: the sign-off is already durable at this point — a failure while
  // computing the learning prompt must not surface as a failed sign-off.
  let suggestReferenceRule = false;
  try {
    suggestReferenceRule = await computeReferenceRuleSuggestion({
      unitId: reference.unit_id,
      propertyId: reference.property_id,
      referenceText: reference.reference,
      amount,
      bankImportEntryId: reference.bank_import_entry_id,
    });
  } catch {
    suggestReferenceRule = false;
  }

  return {
    signedOff: true,
    status: recomputed.computedStatus,
    persistedStatus: recomputed.persistedStatus,
    suggestReferenceRule,
    referenceText: reference.reference,
  };
}

async function activeContributionAmountForReference(paymentReferenceId: string): Promise<number> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('deposit_contributions')
    .select('amount,reversed_at')
    .eq('payment_reference_id', paymentReferenceId)
    .is('reversed_at', null);
  // Missing table/column (migration not applied yet) degrades to zero.
  if (error) {
    if (error.code === '42P01' || error.code === '42703' || error.code === 'PGRST205') return 0;
    throw new Error(`Failed to load deposit contributions: ${error.message}`);
  }
  return (data ?? []).reduce((sum, row) => sum + toMoney(row.amount as number | string), 0);
}

/**
 * Accept an overpayment split (FR-2.8 slice 2, owner ruling 2026-07-02):
 * rent-first allocation; the deposit portion (capped at the unit's REMAINING
 * deposit headroom) is written to the deposit ledger, the reference is signed
 * off, and the period is marked paid. Surplus beyond the deposit target blocks
 * acceptance — that money still needs a human decision.
 */
export async function acceptDepositSplit(input: {
  paymentReferenceId: string;
  actor: string;
}) {
  const admin = getSupabaseAdmin();
  const { data: reference, error: referenceError } = await admin
    .from('payment_references')
    .select('id,organization_id,property_id,unit_id,unit_payment_period_id,reference,amount,signed_off')
    .eq('id', input.paymentReferenceId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      property_id: string | null;
      unit_id: string | null;
      unit_payment_period_id: string | null;
      reference: string;
      amount: number | string;
      signed_off: boolean;
    }>();
  if (referenceError || !reference) throw new Error(referenceError?.message ?? 'Payment reference not found');
  if (!reference.unit_id || !reference.unit_payment_period_id) {
    throw new Error('Reference must be matched to a unit before accepting a deposit split');
  }
  if (reference.signed_off) throw new Error('Reference is already signed off');

  const existingContribution = await activeContributionAmountForReference(reference.id);
  if (existingContribution > 0) throw new Error('A deposit split has already been accepted for this reference');

  const [{ data: period, error: periodError }, { data: unit, error: unitError }] = await Promise.all([
    admin
      .from('unit_payment_periods')
      .select('id,expected_amount,status')
      .eq('id', reference.unit_payment_period_id)
      .maybeSingle<{ id: string; expected_amount: number | string; status: string }>(),
    admin
      .from('property_units')
      .select('id,deposit_amount')
      .eq('id', reference.unit_id)
      .maybeSingle<{ id: string; deposit_amount: number | string }>(),
  ]);
  if (periodError || !period) throw new Error(periodError?.message ?? 'Unit payment period not found');
  if (unitError || !unit) throw new Error(unitError?.message ?? 'Unit not found');

  // Remaining headroom = deposit target minus the unit's active ledger balance.
  const { data: balanceRows, error: balanceError } = await admin
    .from('deposit_contributions')
    .select('amount')
    .eq('unit_id', reference.unit_id)
    .is('reversed_at', null);
  if (balanceError && balanceError.code !== '42P01' && balanceError.code !== 'PGRST205') {
    throw new Error(`Failed to load deposit balance: ${balanceError.message}`);
  }
  const depositBalance = (balanceRows ?? []).reduce((sum, row) => sum + toMoney(row.amount as number | string), 0);
  const depositTarget = toMoney(unit.deposit_amount);
  const remainingDeposit = roundMoney(Math.max(0, depositTarget - depositBalance));

  const expectedAmount = toMoney(period.expected_amount);
  const amount = toMoney(reference.amount);
  // FR-2.8 rulings 2026-07-03: surplus no longer blocks — rent first, deposit
  // up to remaining headroom, remainder HELD as unit credit for the operator
  // to allocate later (arrears ≤ 3 months / next-month advance / deposit).
  const split = computeOverpaymentAllocation({
    receivedAmount: amount,
    expectedAmount,
    depositHeadroom: remainingDeposit,
  });
  if (!split) {
    throw new Error('No split applies: payment does not exceed expected rent');
  }

  if (split.depositPortion > 0.001) {
    const { error: insertError } = await admin.from('deposit_contributions').insert({
      organization_id: reference.organization_id,
      property_id: reference.property_id,
      unit_id: reference.unit_id,
      unit_payment_period_id: period.id,
      payment_reference_id: reference.id,
      amount: split.depositPortion,
      rent_portion: split.rentPortion,
      surplus_amount: split.creditAmount,
      reference_text: reference.reference,
      actor: input.actor,
    });
    if (insertError) throw new Error(`Failed to record deposit contribution: ${insertError.message}`);

    await logPaymentMatchEvent({
      organizationId: reference.organization_id,
      propertyId: reference.property_id,
      unitId: reference.unit_id,
      unitPaymentPeriodId: period.id,
      paymentReferenceId: reference.id,
      eventType: 'deposit_split_accepted',
      actor: input.actor,
      referenceText: reference.reference,
      amount: split.depositPortion,
      expectedAmount,
      previousStatus: period.status,
      newStatus: 'paid',
      note: `rent R${split.rentPortion.toFixed(2)} + deposit R${split.depositPortion.toFixed(2)} (balance R${roundMoney(depositBalance + split.depositPortion).toFixed(2)} / R${depositTarget.toFixed(2)})`,
    });
  }

  if (split.creditAmount > 0.001) {
    const { error: creditError } = await admin.from('unit_credits').insert({
      organization_id: reference.organization_id,
      property_id: reference.property_id,
      unit_id: reference.unit_id,
      unit_payment_period_id: period.id,
      payment_reference_id: reference.id,
      amount: split.creditAmount,
      reference_text: reference.reference,
      actor: input.actor,
    });
    if (creditError) throw new Error(`Failed to hold surplus as credit: ${creditError.message}`);

    await logPaymentMatchEvent({
      organizationId: reference.organization_id,
      propertyId: reference.property_id,
      unitId: reference.unit_id,
      unitPaymentPeriodId: period.id,
      paymentReferenceId: reference.id,
      eventType: 'credit_held',
      actor: input.actor,
      referenceText: reference.reference,
      amount: split.creditAmount,
      expectedAmount,
      previousStatus: period.status,
      newStatus: 'paid',
      note: `surplus R${split.creditAmount.toFixed(2)} held as unit credit (allocate: arrears ≤ 3 months / next month / deposit)`,
    });
  }

  // Rent portion now matches expected — sign off through the standard path so
  // the paid rule stays in one place.
  return await signOffMatchedReference({ paymentReferenceId: reference.id, actor: input.actor });
}

/**
 * Allocate held unit credit (FR-2.8, owner rulings 2026-07-03). Explicit
 * operator action only — never called automatically. Destinations:
 * 'arrears' (a short period ≤ 3 months before the selected period),
 * 'advance' (exactly one month ahead), 'deposit' (while headroom > 0).
 * Amount defaults to the destination's max and is validated against the
 * option set computed from live data.
 */
export async function allocateUnitCredit(input: {
  unitId: string;
  destination: 'arrears' | 'advance' | 'deposit';
  /** Period the operator is viewing, YYYY-MM key. */
  selectedPeriodKey: string;
  /** Required for 'arrears'. */
  targetPeriodId?: string;
  /** Defaults to the destination's max allowed. */
  amount?: number;
  actor: string;
}) {
  const admin = getSupabaseAdmin();
  const { data: unit, error: unitError } = await admin
    .from('property_units')
    .select('id,property_id,deposit_amount')
    .eq('id', input.unitId)
    .maybeSingle<{ id: string; property_id: string; deposit_amount: number | string }>();
  if (unitError || !unit) throw new Error(unitError?.message ?? 'Unit not found');

  const { data: property, error: propertyError } = await admin
    .from('properties')
    .select('id,organization_id')
    .eq('id', unit.property_id)
    .maybeSingle<{ id: string; organization_id: string }>();
  if (propertyError || !property) throw new Error(propertyError?.message ?? 'Property not found');

  const selectedPeriodStart = `${input.selectedPeriodKey}-01`;
  const creditBalance = await activeCreditBalanceForUnit(unit.id);
  const depositBalance = await activeContributionBalanceForUnit(unit.id);
  const depositHeadroom = roundMoney(Math.max(0, toMoney(unit.deposit_amount) - depositBalance));

  // Arrears candidates: the unit's periods in the 3-month window with money still owed.
  const windowStart = shiftPeriodStart(selectedPeriodStart, -3);
  const { data: pastPeriods, error: pastError } = await admin
    .from('unit_payment_periods')
    .select('id,period_start,expected_amount,status,is_blocked')
    .eq('unit_id', unit.id)
    .gte('period_start', windowStart)
    .lt('period_start', selectedPeriodStart);
  if (pastError) throw new Error(`Failed to load arrears candidates: ${pastError.message}`);

  const pastPeriodIds = (pastPeriods ?? []).map((row) => row.id as string);
  const arrearsCandidates: Array<{ periodId: string; periodStart: string; outstandingAmount: number }> = [];
  if (pastPeriodIds.length > 0) {
    const [{ data: pastRefs, error: pastRefsError }, ...creditApplied] = await Promise.all([
      admin
        .from('payment_references')
        .select('unit_payment_period_id,amount')
        .in('unit_payment_period_id', pastPeriodIds),
      ...pastPeriodIds.map((periodId) => activeCreditAppliedForPeriod(periodId)),
    ]);
    if (pastRefsError) throw new Error(`Failed to load arrears references: ${pastRefsError.message}`);
    const receivedByPeriod = new Map<string, number>();
    for (const row of pastRefs ?? []) {
      const periodId = row.unit_payment_period_id as string | null;
      if (!periodId) continue;
      receivedByPeriod.set(periodId, (receivedByPeriod.get(periodId) ?? 0) + toMoney(row.amount as number | string));
    }
    (pastPeriods ?? []).forEach((row, index) => {
      if (row.is_blocked) return;
      const outstanding = roundMoney(
        toMoney(row.expected_amount) - (receivedByPeriod.get(row.id as string) ?? 0) - (creditApplied[index] ?? 0)
      );
      if (outstanding > 0.001) {
        arrearsCandidates.push({
          periodId: row.id as string,
          periodStart: row.period_start as string,
          outstandingAmount: outstanding,
        });
      }
    });
  }

  const options = computeCreditAllocationOptions({
    creditBalance,
    selectedPeriodStart,
    arrearsCandidates,
    depositHeadroom,
  });
  if (!options) throw new Error('This unit has no held credit to allocate');

  let targetPeriodId: string | null = null;
  let maxAmount = 0;
  let noteTarget = '';

  if (input.destination === 'arrears') {
    const option = options.arrears.find((candidate) => candidate.periodId === input.targetPeriodId);
    if (!option) {
      throw new Error('That month is not an allocatable arrears target (must be short and within the last 3 months)');
    }
    targetPeriodId = option.periodId;
    maxAmount = option.maxAmount;
    noteTarget = `arrears ${option.periodStart.slice(0, 7)}`;
  } else if (input.destination === 'advance') {
    // Exactly one month ahead; create the period row if it doesn't exist yet.
    const advanceKey = options.advance.periodStart.slice(0, 7);
    await ensurePaymentPeriodsForPeriod({ periodKey: advanceKey, propertyId: unit.property_id });
    const { data: advancePeriod, error: advanceError } = await admin
      .from('unit_payment_periods')
      .select('id')
      .eq('unit_id', unit.id)
      .eq('period_start', options.advance.periodStart)
      .maybeSingle<{ id: string }>();
    if (advanceError || !advancePeriod) {
      throw new Error(advanceError?.message ?? 'Could not create next month\'s period for the advance');
    }
    targetPeriodId = advancePeriod.id;
    maxAmount = options.advance.maxAmount;
    noteTarget = `advance ${advanceKey}`;
  } else {
    if (!options.deposit) throw new Error('Deposit is already fully funded — no headroom for credit');
    maxAmount = options.deposit.maxAmount;
    noteTarget = 'deposit';
  }

  const amount = roundMoney(input.amount ?? maxAmount);
  if (!(amount > 0.001)) throw new Error('Allocation amount must be positive');
  if (amount > maxAmount + 0.001) {
    throw new Error(`Allocation exceeds the maximum for this destination (R${maxAmount.toFixed(2)})`);
  }

  const { data: allocation, error: allocationError } = await admin
    .from('unit_credit_allocations')
    .insert({
      organization_id: property.organization_id,
      property_id: unit.property_id,
      unit_id: unit.id,
      amount,
      destination: input.destination,
      target_period_id: targetPeriodId,
      note: noteTarget,
      actor: input.actor,
    })
    .select('id')
    .single<{ id: string }>();
  if (allocationError || !allocation) {
    throw new Error(`Failed to allocate credit: ${allocationError?.message ?? 'insert failed'}`);
  }

  // Deposit destination also feeds the deposit ledger so both balances stay truthful.
  if (input.destination === 'deposit') {
    const { error: depositError } = await admin.from('deposit_contributions').insert({
      organization_id: property.organization_id,
      property_id: unit.property_id,
      unit_id: unit.id,
      amount,
      rent_portion: 0,
      surplus_amount: 0,
      reference_text: `credit:${allocation.id}`,
      actor: input.actor,
    });
    if (depositError) throw new Error(`Failed to record deposit contribution from credit: ${depositError.message}`);
  }

  const recomputed = targetPeriodId ? await recomputeAndPersistPeriodStatus(targetPeriodId) : null;

  await logPaymentMatchEvent({
    organizationId: property.organization_id,
    propertyId: unit.property_id,
    unitId: unit.id,
    unitPaymentPeriodId: targetPeriodId,
    paymentReferenceId: null,
    eventType: 'credit_allocated',
    actor: input.actor,
    referenceText: `credit → ${noteTarget}`,
    amount,
    expectedAmount: recomputed?.expectedAmount ?? 0,
    previousStatus: null,
    newStatus: recomputed?.persistedStatus ?? null,
    note: `R${amount.toFixed(2)} of held credit → ${noteTarget}; remaining balance R${roundMoney(creditBalance - amount).toFixed(2)}`,
  });

  return {
    allocated: amount,
    destination: input.destination,
    targetPeriodId,
    remainingCredit: roundMoney(creditBalance - amount),
    targetStatus: recomputed?.persistedStatus ?? null,
  };
}

/** Reverse a credit allocation (FR-2.8 — allocations must be reversible like sign-offs). */
export async function reverseUnitCreditAllocation(input: { allocationId: string; actor: string }) {
  const admin = getSupabaseAdmin();
  const { data: allocation, error: allocationError } = await admin
    .from('unit_credit_allocations')
    .select('id,organization_id,property_id,unit_id,amount,destination,target_period_id,reversed_at')
    .eq('id', input.allocationId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      property_id: string | null;
      unit_id: string;
      amount: number | string;
      destination: 'arrears' | 'advance' | 'deposit';
      target_period_id: string | null;
      reversed_at: string | null;
    }>();
  if (allocationError || !allocation) throw new Error(allocationError?.message ?? 'Credit allocation not found');
  if (allocation.reversed_at) throw new Error('This credit allocation is already reversed');

  const { error: reverseError } = await admin
    .from('unit_credit_allocations')
    .update({ reversed_at: new Date().toISOString(), reversed_by: input.actor })
    .eq('id', allocation.id);
  if (reverseError) throw new Error(`Failed to reverse credit allocation: ${reverseError.message}`);

  if (allocation.destination === 'deposit') {
    const { error: depositReverseError } = await admin
      .from('deposit_contributions')
      .update({ reversed_at: new Date().toISOString(), reversed_by: input.actor })
      .eq('reference_text', `credit:${allocation.id}`)
      .is('reversed_at', null);
    if (depositReverseError) {
      throw new Error(`Failed to reverse paired deposit contribution: ${depositReverseError.message}`);
    }
  }

  const recomputed = allocation.target_period_id
    ? await recomputeAndPersistPeriodStatus(allocation.target_period_id)
    : null;

  await logPaymentMatchEvent({
    organizationId: allocation.organization_id,
    propertyId: allocation.property_id,
    unitId: allocation.unit_id,
    unitPaymentPeriodId: allocation.target_period_id,
    paymentReferenceId: null,
    eventType: 'credit_allocation_reversed',
    actor: input.actor,
    referenceText: `credit allocation reversed (${allocation.destination})`,
    amount: toMoney(allocation.amount),
    expectedAmount: recomputed?.expectedAmount ?? 0,
    previousStatus: null,
    newStatus: recomputed?.persistedStatus ?? null,
  });

  return { reversed: true, amount: toMoney(allocation.amount), destination: allocation.destination };
}

export async function reverseSignOffAndUnmatch(input: {
  paymentReferenceId: string;
  actor: string;
}) {
  const admin = getSupabaseAdmin();
  const { data: reference, error: referenceError } = await admin
    .from('payment_references')
    .select('id,organization_id,property_id,unit_id,unit_payment_period_id,reference,amount,signed_off')
    .eq('id', input.paymentReferenceId)
    .maybeSingle<{
      id: string;
      organization_id: string;
      property_id: string | null;
      unit_id: string | null;
      unit_payment_period_id: string | null;
      reference: string;
      amount: number | string;
      signed_off: boolean;
    }>();
  if (referenceError || !reference) throw new Error(referenceError?.message ?? 'Payment reference not found');

  const period = reference.unit_payment_period_id
    ? await admin
        .from('unit_payment_periods')
        .select('id,expected_amount,status')
        .eq('id', reference.unit_payment_period_id)
        .maybeSingle<{ id: string; expected_amount: number | string; status: string }>()
    : { data: null, error: null };
  if (period.error) throw new Error(`Failed to load unit payment period for reverse sign-off: ${period.error.message}`);

  const expectedAmount = toMoney(period.data?.expected_amount);
  const amount = toMoney(reference.amount);

  // FR-2.8: guard BEFORE any mutation — if credit held from this reference has
  // already been allocated elsewhere, unmatching would drive the unit's credit
  // balance negative. The operator must reverse those allocations first.
  const { data: refCredits, error: refCreditsError } = await admin
    .from('unit_credits')
    .select('id,amount')
    .eq('payment_reference_id', reference.id)
    .is('reversed_at', null);
  if (refCreditsError && !MISSING_TABLE_CODES.has(refCreditsError.code ?? '')) {
    throw new Error(`Failed to load credits for reverse: ${refCreditsError.message}`);
  }
  const creditFromReference = roundMoney(
    (refCredits ?? []).reduce((sum, row) => sum + toMoney(row.amount as number | string), 0)
  );
  if (creditFromReference > 0 && reference.unit_id) {
    const creditBalance = await activeCreditBalanceForUnit(reference.unit_id);
    if (creditBalance - creditFromReference < -0.001) {
      throw new Error(
        `R${roundMoney(creditFromReference - creditBalance).toFixed(2)} of this payment's credit has already been allocated — reverse the credit allocation(s) first`
      );
    }
  }

  const { error: referenceUpdateError } = await admin
    .from('payment_references')
    .update({
      unit_id: null,
      unit_payment_period_id: null,
      signed_off: false,
      signed_off_at: null,
      signed_off_by: '',
      matched_at: null,
      matched_by: '',
      match_method: 'manual',
    })
    .eq('id', input.paymentReferenceId);
  if (referenceUpdateError) throw new Error(`Failed to reverse sign-off: ${referenceUpdateError.message}`);

  if (creditFromReference > 0) {
    const { error: reverseCreditError } = await admin
      .from('unit_credits')
      .update({ reversed_at: new Date().toISOString(), reversed_by: input.actor })
      .eq('payment_reference_id', reference.id)
      .is('reversed_at', null);
    if (reverseCreditError) throw new Error(`Failed to reverse held credit: ${reverseCreditError.message}`);
  }

  // Reverse any deposit contributions recorded against this reference so the
  // unit's deposit balance stays truthful (FR-2.8 ledger rule).
  const contributedAmount = await activeContributionAmountForReference(reference.id);
  if (contributedAmount > 0) {
    const { error: reverseContributionError } = await admin
      .from('deposit_contributions')
      .update({ reversed_at: new Date().toISOString(), reversed_by: input.actor })
      .eq('payment_reference_id', reference.id)
      .is('reversed_at', null);
    if (reverseContributionError) {
      throw new Error(`Failed to reverse deposit contribution: ${reverseContributionError.message}`);
    }
  }

  const recomputed = period.data ? await recomputeAndPersistPeriodStatus(period.data.id) : null;

  if (contributedAmount > 0) {
    await logPaymentMatchEvent({
      organizationId: reference.organization_id,
      propertyId: reference.property_id,
      unitId: reference.unit_id,
      unitPaymentPeriodId: reference.unit_payment_period_id,
      paymentReferenceId: reference.id,
      eventType: 'deposit_split_reversed',
      actor: input.actor,
      referenceText: reference.reference,
      amount: contributedAmount,
      expectedAmount,
      previousStatus: period.data?.status ?? '',
      newStatus: recomputed?.persistedStatus ?? 'unpaid',
      });
  }

  if (reference.signed_off) {
    await logPaymentMatchEvent({
      organizationId: reference.organization_id,
      propertyId: reference.property_id,
      unitId: reference.unit_id,
      unitPaymentPeriodId: reference.unit_payment_period_id,
      paymentReferenceId: reference.id,
      eventType: 'reverse_signed_off',
      actor: input.actor,
      referenceText: reference.reference,
      amount,
      expectedAmount,
      previousStatus: period.data?.status ?? '',
      newStatus: recomputed?.persistedStatus ?? 'unpaid',
    });
  }

  await logPaymentMatchEvent({
    organizationId: reference.organization_id,
    propertyId: reference.property_id,
    unitId: reference.unit_id,
    unitPaymentPeriodId: reference.unit_payment_period_id,
    paymentReferenceId: reference.id,
    eventType: 'unmatched',
    actor: input.actor,
    referenceText: reference.reference,
    amount,
    expectedAmount,
    previousStatus: period.data?.status ?? '',
    newStatus: recomputed?.persistedStatus ?? 'unpaid',
  });

  return { reversed: true };
}
