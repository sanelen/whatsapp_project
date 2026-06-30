import { getSupabaseAdmin } from '@/lib/supabase';
import { getBillingPeriodForDate, getBillingWindowForPeriod } from '@/lib/bank-import';

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
    | 'note_added';
  actor: string;
  referenceText: string;
  amount: number;
  expectedAmount: number;
  previousStatus?: string;
  newStatus?: string;
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

export async function matchReferenceToUnit(input: {
  propertyId: string;
  unitId: string;
  paymentReferenceId: string;
  actor: string;
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

  const expectedAmount = toMoney(period.expected_amount);
  const amount = toMoney(reference.amount);
  const nextStatus = Math.abs(amount - expectedAmount) <= 0.001 ? 'unpaid' : 'mismatch';

  const { error: updateReferenceError } = await admin
    .from('payment_references')
    .update({
      property_id: input.propertyId,
      unit_id: input.unitId,
      unit_payment_period_id: period.id,
      matched_at: new Date().toISOString(),
      matched_by: input.actor,
      match_method: 'manual',
      signed_off: false,
      signed_off_at: null,
      signed_off_by: '',
    })
    .eq('id', input.paymentReferenceId);
  if (updateReferenceError) {
    throw new Error(`Failed to match payment reference: ${updateReferenceError.message}`);
  }

  const { error: updatePeriodError } = await admin
    .from('unit_payment_periods')
    .update({ status: nextStatus })
    .eq('id', period.id);
  if (updatePeriodError) {
    throw new Error(`Failed to update unit payment period status: ${updatePeriodError.message}`);
  }

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
    expectedAmount,
    previousStatus: period.status,
    newStatus: nextStatus,
  });

  if (period.status !== nextStatus) {
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
      expectedAmount,
      previousStatus: period.status,
      newStatus: nextStatus,
    });
  }

  return { matched: true, status: nextStatus };
}

export async function signOffMatchedReference(input: {
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
  if (!reference.unit_id || !reference.unit_payment_period_id) throw new Error('Reference must be matched before sign-off');
  if (reference.signed_off) return { signedOff: true };

  const { data: period, error: periodError } = await admin
    .from('unit_payment_periods')
    .select('id,expected_amount,status')
    .eq('id', reference.unit_payment_period_id)
    .maybeSingle<{ id: string; expected_amount: number | string; status: string }>();
  if (periodError || !period) throw new Error(periodError?.message ?? 'Unit payment period not found');

  const expectedAmount = toMoney(period.expected_amount);
  const amount = toMoney(reference.amount);
  if (Math.abs(amount - expectedAmount) > 0.001) {
    throw new Error('Mismatch rows cannot be signed off until the amount matches');
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

  const { error: periodUpdateError } = await admin
    .from('unit_payment_periods')
    .update({ status: 'paid' })
    .eq('id', period.id);
  if (periodUpdateError) throw new Error(`Failed to mark unit payment period as paid: ${periodUpdateError.message}`);

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
    expectedAmount,
    previousStatus: period.status,
    newStatus: 'paid',
  });

  return { signedOff: true };
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

  if (period.data) {
    const { error: periodUpdateError } = await admin
      .from('unit_payment_periods')
      .update({ status: 'unpaid' })
      .eq('id', period.data.id);
    if (periodUpdateError) throw new Error(`Failed to unlock unit payment period: ${periodUpdateError.message}`);
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
      newStatus: 'unpaid',
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
    newStatus: 'unpaid',
  });

  return { reversed: true };
}
