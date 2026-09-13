import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth/api-guard';
import { getApiUser } from '@/lib/auth/dal';
import { getSupabaseAdmin } from '@/lib/supabase';

type RoomRuleInput = {
  id?: string;
  matcherType: 'reference_contains' | 'reference_equals' | 'reference_regex' | 'payer_name_contains' | 'amount_equals';
  matcherValue: string;
  amountValue?: number | null;
  isActive?: boolean;
};

type UpdateRoomPayload = {
  action?: 'save_current_stay' | 'add_past_stay' | 'save_past_stay' | 'end_current_stay';
  unitId?: string;
  stayId?: string;
  propertyId: string;
  create?: boolean;
  label: string;
  contactPrimary?: string;
  contactSecondary?: string;
  rentAmount: number;
  occupancy: 'occupied' | 'vacant';
  isBlocked: boolean;
  expectedReference?: string;
  matchKeywords?: string[];
  rules?: RoomRuleInput[];
  depositAmount?: number;
  parking?: string;
  ensuite?: boolean;
  maxOccupants?: number;
  isAvailable?: boolean;
  features?: string[];
  tenantDisplayName?: string;
  startsOn?: string;
  endsOn?: string;
  closeReason?: string;
};

function isMissingRelation(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === '42703' || error?.code === 'PGRST205';
}

function cleanText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function cleanMoney(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function cleanDate(value: unknown) {
  const text = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export async function POST(request: Request) {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: UpdateRoomPayload;
  try {
    body = (await request.json()) as UpdateRoomPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.propertyId) {
    return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
  }

  const payload = {
    action: body.action,
    unitId: cleanText(body.unitId),
    stayId: cleanText(body.stayId),
    propertyId: cleanText(body.propertyId),
    create: Boolean(body.create),
    label: cleanText(body.label),
    contactPrimary: cleanText(body.contactPrimary),
    contactSecondary: cleanText(body.contactSecondary),
    rentAmount: cleanMoney(body.rentAmount),
    occupancy: body.occupancy === 'vacant' ? 'vacant' : 'occupied',
    isBlocked: Boolean(body.isBlocked),
    expectedReference: cleanText(body.expectedReference),
    matchKeywords: cleanStringArray(body.matchKeywords),
    rules: Array.isArray(body.rules) ? body.rules : [],
    depositAmount: cleanMoney(body.depositAmount),
    parking: cleanText(body.parking),
    ensuite: Boolean(body.ensuite),
    maxOccupants: Math.max(0, Math.round(cleanMoney(body.maxOccupants, 1))),
    isAvailable: Boolean(body.isAvailable),
    features: cleanStringArray(body.features),
    tenantDisplayName: cleanText(body.tenantDisplayName),
    startsOn: cleanDate(body.startsOn),
    endsOn: cleanDate(body.endsOn),
    closeReason: cleanText(body.closeReason),
  };

  const admin = getSupabaseAdmin();
  const { data: property, error: propertyError } = await admin
    .from('properties')
    .select('id,organization_id')
    .eq('id', payload.propertyId)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (propertyError || !property) {
    return NextResponse.json({ error: propertyError?.message ?? 'Property not found' }, { status: 404 });
  }

  if (payload.action) {
    if (!payload.unitId) {
      return NextResponse.json({ error: 'unitId is required for stay actions' }, { status: 400 });
    }

    const { data: unit, error: unitError } = await admin
      .from('property_units')
      .select('id,deposit_amount')
      .eq('id', payload.unitId)
      .eq('property_id', payload.propertyId)
      .maybeSingle<{ id: string; deposit_amount: number | string | null }>();
    if (unitError) {
      return NextResponse.json({ error: `Failed to load room for stay action: ${unitError.message}` }, { status: 500 });
    }
    if (!unit) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    const actor = user.email ?? user.id;
    const depositTargetAmount = payload.depositAmount || cleanMoney(unit.deposit_amount, 0);

    if (payload.action === 'add_past_stay') {
      if (!payload.endsOn) {
        return NextResponse.json({ error: 'Past stay end date is required' }, { status: 400 });
      }
      if (payload.startsOn && payload.startsOn > payload.endsOn) {
        return NextResponse.json(
          { error: 'Past stay start date must be on or before its end date' },
          { status: 422 }
        );
      }
      const { error: insertError } = await admin.from('unit_occupancies').insert({
        organization_id: property.organization_id,
        property_id: payload.propertyId,
        unit_id: payload.unitId,
        status: 'ended',
        tenant_display_name: payload.tenantDisplayName || 'Previous tenant',
        contact_primary: payload.contactPrimary,
        contact_secondary: payload.contactSecondary,
        starts_on: payload.startsOn,
        ends_on: payload.endsOn,
        deposit_target_amount: depositTargetAmount,
        close_reason: payload.closeReason || 'retrospective stay version',
        actor,
        closed_at: new Date().toISOString(),
      });
      if (insertError) {
        if (isMissingRelation(insertError)) {
          return NextResponse.json({ error: 'Tenant stay versioning is not available in this database yet' }, { status: 409 });
        }
        return NextResponse.json({ error: `Failed to add past stay: ${insertError.message}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, updatedBy: actor, unitId: payload.unitId });
    }

    if (payload.action === 'save_past_stay') {
      if (!payload.stayId) {
        return NextResponse.json({ error: 'stayId is required to edit a past stay' }, { status: 400 });
      }
      if (!payload.endsOn) {
        return NextResponse.json({ error: 'Past stay end date is required' }, { status: 400 });
      }
      if (payload.startsOn && payload.startsOn > payload.endsOn) {
        return NextResponse.json(
          { error: 'Past stay start date must be on or before its end date' },
          { status: 422 }
        );
      }
      const { data: pastStay, error: pastStayError } = await admin
        .from('unit_occupancies')
        .select('id,closed_at')
        .eq('id', payload.stayId)
        .eq('unit_id', payload.unitId)
        .eq('property_id', payload.propertyId)
        .eq('status', 'ended')
        .maybeSingle<{ id: string; closed_at: string | null }>();
      if (pastStayError) {
        return NextResponse.json({ error: `Failed to load past stay: ${pastStayError.message}` }, { status: 500 });
      }
      if (!pastStay) {
        return NextResponse.json({ error: 'Past stay not found for this room' }, { status: 404 });
      }
      const { error: updateError } = await admin
        .from('unit_occupancies')
        .update({
          tenant_display_name: payload.tenantDisplayName || 'Previous tenant',
          contact_primary: payload.contactPrimary,
          contact_secondary: payload.contactSecondary,
          starts_on: payload.startsOn,
          ends_on: payload.endsOn,
          deposit_target_amount: depositTargetAmount,
          close_reason: payload.closeReason || 'retrospective stay correction',
          actor,
          closed_at: pastStay.closed_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pastStay.id);
      if (updateError) {
        return NextResponse.json({ error: `Failed to update past stay: ${updateError.message}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, updatedBy: actor, unitId: payload.unitId, stayId: pastStay.id });
    }

    const { data: currentStay, error: currentError } = await admin
      .from('unit_occupancies')
      .select('id')
      .eq('unit_id', payload.unitId)
      .is('closed_at', null)
      .in('status', ['holding', 'active', 'notice'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (currentError) {
      if (isMissingRelation(currentError)) {
        return NextResponse.json({ error: 'Tenant stay versioning is not available in this database yet' }, { status: 409 });
      }
      return NextResponse.json({ error: `Failed to load current stay: ${currentError.message}` }, { status: 500 });
    }

    if (payload.action === 'save_current_stay') {
      if (currentStay) {
        const { error: updateError } = await admin
          .from('unit_occupancies')
          .update({
            status: 'active',
            tenant_display_name: payload.tenantDisplayName,
            contact_primary: payload.contactPrimary,
            contact_secondary: payload.contactSecondary,
            starts_on: payload.startsOn,
            ends_on: null,
            deposit_target_amount: depositTargetAmount,
            actor,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentStay.id);
        if (updateError) {
          return NextResponse.json({ error: `Failed to update current stay: ${updateError.message}` }, { status: 500 });
        }
      } else {
        const { error: insertError } = await admin.from('unit_occupancies').insert({
          organization_id: property.organization_id,
          property_id: payload.propertyId,
          unit_id: payload.unitId,
          status: 'active',
          tenant_display_name: payload.tenantDisplayName,
          contact_primary: payload.contactPrimary,
          contact_secondary: payload.contactSecondary,
          starts_on: payload.startsOn,
          deposit_target_amount: depositTargetAmount,
          actor,
        });
        if (insertError) {
          return NextResponse.json({ error: `Failed to start current stay: ${insertError.message}` }, { status: 500 });
        }
      }
      return NextResponse.json({ success: true, updatedBy: actor, unitId: payload.unitId });
    }

    if (payload.action === 'end_current_stay') {
      if (!payload.endsOn) {
        return NextResponse.json({ error: 'Current stay end date is required' }, { status: 400 });
      }
      if (!currentStay) {
        return NextResponse.json({ error: 'No current stay is open for this room' }, { status: 404 });
      }
      const { data: currentStayDates, error: currentStayDatesError } = await admin
        .from('unit_occupancies')
        .select('starts_on')
        .eq('id', currentStay.id)
        .maybeSingle<{ starts_on: string | null }>();
      if (currentStayDatesError) {
        return NextResponse.json(
          { error: `Failed to validate current stay dates: ${currentStayDatesError.message}` },
          { status: 500 }
        );
      }
      if (currentStayDates?.starts_on && currentStayDates.starts_on > payload.endsOn) {
        return NextResponse.json(
          { error: 'Tenant version end date must be on or after its billing start date' },
          { status: 422 }
        );
      }
      const { error: updateError } = await admin
        .from('unit_occupancies')
        .update({
          status: 'ended',
          ends_on: payload.endsOn,
          close_reason: payload.closeReason || 'tenant moved out',
          actor,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentStay.id);
      if (updateError) {
        return NextResponse.json({ error: `Failed to end current stay: ${updateError.message}` }, { status: 500 });
      }
      return NextResponse.json({ success: true, updatedBy: actor, unitId: payload.unitId });
    }
  }

  if (!payload.label) {
    return NextResponse.json({ error: 'Room label is required' }, { status: 400 });
  }

  const richUpdate = {
    label: payload.label,
    contact_primary: payload.contactPrimary,
    contact_secondary: payload.contactSecondary,
    rent_amount: payload.rentAmount,
    occupancy_status: payload.occupancy,
    is_blocked: payload.isBlocked,
    expected_reference: payload.expectedReference,
    match_keywords: payload.matchKeywords,
    deposit_amount: payload.depositAmount,
    parking: payload.parking,
    ensuite: payload.ensuite,
    max_occupants: payload.maxOccupants,
    is_available: payload.isAvailable,
    features: payload.features,
  };

  const fallbackUpdate = {
    label: payload.label,
    contact_primary: payload.contactPrimary,
    contact_secondary: payload.contactSecondary,
    rent_amount: payload.rentAmount,
    occupancy_status: payload.occupancy,
    is_blocked: payload.isBlocked,
    expected_reference: payload.expectedReference,
    match_keywords: payload.matchKeywords,
  };
  let targetUnitId = payload.unitId;

  if (payload.create) {
    const { data: existingUnits, error: orderError } = await admin
      .from('property_units')
      .select('display_order')
      .eq('property_id', payload.propertyId)
      .order('display_order', { ascending: false })
      .limit(1);
    if (orderError && !isMissingRelation(orderError)) {
      return NextResponse.json({ error: `Failed to load room ordering: ${orderError.message}` }, { status: 500 });
    }
    const nextDisplayOrder = Number(existingUnits?.[0]?.display_order ?? 0) + 10;

    const richInsert = await admin
      .from('property_units')
      .insert({
        property_id: payload.propertyId,
        display_order: nextDisplayOrder,
        ...richUpdate,
      })
      .select('id')
      .maybeSingle();

    if (richInsert.error && !isMissingRelation(richInsert.error)) {
      return NextResponse.json({ error: `Failed to create room: ${richInsert.error.message}` }, { status: 500 });
    }

    if (richInsert.error && isMissingRelation(richInsert.error)) {
      const fallbackInsert = await admin
        .from('property_units')
        .insert({
          property_id: payload.propertyId,
          display_order: nextDisplayOrder,
          ...fallbackUpdate,
        })
        .select('id')
        .maybeSingle();

      if (fallbackInsert.error || !fallbackInsert.data) {
        return NextResponse.json(
          { error: fallbackInsert.error?.message ?? 'Room create fallback failed' },
          { status: 500 }
        );
      }
      targetUnitId = fallbackInsert.data.id;
    } else {
      targetUnitId = richInsert.data?.id ?? '';
    }
  } else {
    if (!payload.unitId) {
      return NextResponse.json({ error: 'unitId is required for room updates' }, { status: 400 });
    }

    const richResult = await admin
      .from('property_units')
      .update(richUpdate)
      .eq('id', payload.unitId)
      .eq('property_id', payload.propertyId)
      .select('id')
      .maybeSingle();

    if (richResult.error && !isMissingRelation(richResult.error)) {
      return NextResponse.json({ error: `Failed to update room: ${richResult.error.message}` }, { status: 500 });
    }

    if (richResult.error && isMissingRelation(richResult.error)) {
      const fallbackResult = await admin
        .from('property_units')
        .update(fallbackUpdate)
        .eq('id', payload.unitId)
        .eq('property_id', payload.propertyId)
        .select('id')
        .maybeSingle();

      if (fallbackResult.error || !fallbackResult.data) {
        return NextResponse.json(
          { error: fallbackResult.error?.message ?? 'Room update fallback failed' },
          { status: 500 }
        );
      }
    } else if (!richResult.data) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
  }

  const rules = payload.rules
    .map((rule, index) => ({
      organization_id: property.organization_id,
      property_id: payload.propertyId,
      unit_id: targetUnitId,
      matcher_type: rule.matcherType,
      matcher_value: cleanText(rule.matcherValue),
      amount_value: rule.matcherType === 'amount_equals' ? cleanMoney(rule.amountValue, 0) : null,
      priority: (index + 1) * 10,
      notes: '',
      is_active: rule.isActive !== false,
      updated_at: new Date().toISOString(),
    }))
    .filter((rule) => rule.matcher_type === 'amount_equals' || rule.matcher_value);

  const { error: deleteHintsError } = await admin
    .from('bank_import_unit_match_hints')
    .delete()
    .eq('unit_id', targetUnitId);
  if (deleteHintsError && !isMissingRelation(deleteHintsError)) {
    return NextResponse.json({ error: `Failed to replace room rules: ${deleteHintsError.message}` }, { status: 500 });
  }

  if (rules.length > 0) {
    const { error: insertHintsError } = await admin.from('bank_import_unit_match_hints').insert(rules);
    if (insertHintsError && !isMissingRelation(insertHintsError)) {
      return NextResponse.json({ error: `Failed to save room rules: ${insertHintsError.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    updatedBy: user.email ?? user.id,
    unitId: targetUnitId,
  });
}
