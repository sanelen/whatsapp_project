'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImageIcon,
  Lock,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import type { RoomManagerRoomRow, RoomManagerRule, RoomManagerView } from '@/lib/monthly-payments';
import { MonthlyPaymentsShell } from './monthly-payments-shell';

function formatCurrency(amount: number) {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function roomStatus(room: RoomManagerView['rooms'][number]) {
  if (room.isBlocked) return { label: 'blocked', className: 'bg-stone-200 text-stone-700' };
  if (room.isAvailable || room.occupancy === 'vacant') return { label: 'on market', className: 'bg-sky-100 text-sky-800' };
  return { label: 'occupied', className: 'bg-emerald-100 text-emerald-800' };
}

type EditableRule = {
  id?: string;
  matcherType: RoomManagerRule['matcherType'];
  matcherValue: string;
  amountValue: string;
  isActive: boolean;
};

type RoomDraft = {
  unitId: string | null;
  label: string;
  contactPrimary: string;
  contactSecondary: string;
  rentAmount: string;
  depositAmount: string;
  occupancy: 'occupied' | 'vacant';
  isBlocked: boolean;
  isAvailable: boolean;
  parking: string;
  ensuite: boolean;
  maxOccupants: string;
  featuresText: string;
  expectedReference: string;
  matchKeywordsText: string;
  rules: EditableRule[];
};

type EditorMode = 'edit' | 'create';

function createDraft(room: RoomManagerRoomRow): RoomDraft {
  return {
    unitId: room.unitId,
    label: room.label,
    contactPrimary: room.contactPrimary,
    contactSecondary: room.contactSecondary,
    rentAmount: String(room.rentAmount),
    depositAmount: String(room.depositAmount),
    occupancy: room.occupancy,
    isBlocked: room.isBlocked,
    isAvailable: room.isAvailable,
    parking: room.parking,
    ensuite: room.ensuite,
    maxOccupants: String(room.maxOccupants),
    featuresText: room.features.join(', '),
    expectedReference: room.expectedReference,
    matchKeywordsText: room.matchKeywords.join(', '),
    rules:
      room.rules.length > 0
        ? room.rules.map((rule) => ({
            id: rule.id,
            matcherType: rule.matcherType,
            matcherValue: rule.matcherValue,
            amountValue: rule.amountValue === null ? '' : String(rule.amountValue),
            isActive: rule.isActive,
          }))
        : [
            {
              matcherType: 'reference_regex',
              matcherValue: '',
              amountValue: '',
              isActive: true,
            },
          ],
  };
}

function createNewDraft(view: RoomManagerView): RoomDraft {
  const nextRoomNumber = String(view.summary.roomCount + 1).padStart(2, '0');
  return {
    unitId: null,
    label: `Room ${nextRoomNumber}`,
    contactPrimary: '',
    contactSecondary: '',
    rentAmount: '0',
    depositAmount: '0',
    occupancy: 'occupied',
    isBlocked: false,
    isAvailable: false,
    parking: '',
    ensuite: false,
    maxOccupants: '1',
    featuresText: '',
    expectedReference: '',
    matchKeywordsText: '',
    rules: [
      {
        matcherType: 'reference_contains',
        matcherValue: '',
        amountValue: '',
        isActive: true,
      },
    ],
  };
}

function parseCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function createEmptyRule(): EditableRule {
  return {
    matcherType: 'reference_contains',
    matcherValue: '',
    amountValue: '',
    isActive: true,
  };
}

function matcherTypeLabel(value: EditableRule['matcherType']) {
  switch (value) {
    case 'reference_equals':
      return 'Reference equals';
    case 'reference_regex':
      return 'Reference regex';
    case 'payer_name_contains':
      return 'Payer contains';
    case 'amount_equals':
      return 'Amount equals';
    case 'reference_contains':
    default:
      return 'Reference contains';
  }
}

async function saveRoom(body: Record<string, unknown>) {
  const response = await fetch('/api/monthly-payments/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to save room');
  }

  return payload as { success: true; unitId?: string };
}

export function RoomManagerPanel({
  view,
  initialUnitId,
}: {
  view: RoomManagerView;
  initialUnitId?: string;
}) {
  const router = useRouter();
  const launchedFromUnits = Boolean(initialUnitId);
  const initialTarget =
    initialUnitId ? view.rooms.find((room) => room.unitId === initialUnitId) ?? null : null;
  const [editorMode, setEditorMode] = useState<EditorMode>(initialTarget ? 'edit' : 'create');
  const [editingUnitId, setEditingUnitId] = useState<string | null>(initialTarget?.unitId ?? null);
  const [draft, setDraft] = useState<RoomDraft | null>(initialTarget ? createDraft(initialTarget) : null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const advancedFieldsLocked = view.setupState === 'missing_tables';

  function openEditor(room: RoomManagerRoomRow) {
    setEditorMode('edit');
    setEditingUnitId(room.unitId);
    setDraft(createDraft(room));
    setErrorMessage(null);
  }

  function openCreateEditor() {
    setEditorMode('create');
    setEditingUnitId(null);
    setDraft(createNewDraft(view));
    setErrorMessage(null);
  }

  function closeEditor() {
    setEditingUnitId(null);
    setDraft(null);
    setErrorMessage(null);
    if (launchedFromUnits) {
      router.replace(`/monthly-payments/${view.propertyId}?period=${view.periodKey}&unitId=${initialUnitId}`, {
        scroll: false,
      });
      return;
    }
    router.replace(`/monthly-payments/locations/${view.propertyId}?period=${view.periodKey}`, {
      scroll: false,
    });
  }

  function updateDraft<K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateRule(index: number, patch: Partial<EditableRule>) {
    setDraft((current) => {
      if (!current) return current;
      const nextRules = current.rules.slice();
      nextRules[index] = { ...nextRules[index], ...patch };
      return { ...current, rules: nextRules };
    });
  }

  function addRule() {
    setDraft((current) => (current ? { ...current, rules: [...current.rules, createEmptyRule()] } : current));
  }

  function removeRule(index: number) {
    setDraft((current) => {
      if (!current) return current;
      const nextRules = current.rules.filter((_, ruleIndex) => ruleIndex !== index);
      return { ...current, rules: nextRules.length > 0 ? nextRules : [createEmptyRule()] };
    });
  }

  function handleSave() {
    if (!draft) return;

    startSaving(async () => {
      try {
        const response = await saveRoom({
          unitId: draft.unitId ?? undefined,
          propertyId: view.propertyId,
          create: editorMode === 'create',
          label: draft.label,
          contactPrimary: draft.contactPrimary,
          contactSecondary: draft.contactSecondary,
          rentAmount: Number(draft.rentAmount || 0),
          occupancy: draft.occupancy,
          isBlocked: draft.isBlocked,
          expectedReference: draft.expectedReference,
          matchKeywords: parseCommaList(draft.matchKeywordsText),
          rules: draft.rules.map((rule) => ({
            id: rule.id,
            matcherType: rule.matcherType,
            matcherValue: rule.matcherValue,
            amountValue: rule.matcherType === 'amount_equals' ? Number(rule.amountValue || 0) : null,
            isActive: rule.isActive,
          })),
          depositAmount: Number(draft.depositAmount || 0),
          parking: draft.parking,
          ensuite: draft.ensuite,
          maxOccupants: Number(draft.maxOccupants || 0),
          isAvailable: draft.isAvailable,
          features: parseCommaList(draft.featuresText),
        });
        const savedUnitId =
          response && typeof response === 'object' && 'unitId' in response && typeof response.unitId === 'string'
            ? response.unitId
            : draft.unitId;
        if (launchedFromUnits) {
          router.push(`/monthly-payments/${view.propertyId}?period=${view.periodKey}&unitId=${savedUnitId}`, {
            scroll: false,
          });
        } else {
          setEditingUnitId(null);
          setDraft(null);
          setErrorMessage(null);
          router.push(`/monthly-payments/locations/${view.propertyId}?period=${view.periodKey}`, {
            scroll: false,
          });
          router.refresh();
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save room');
      }
    });
  }

  return (
    <MonthlyPaymentsShell
      active="room-manager"
      operationsHref={`/monthly-payments/${view.propertyId}?period=${view.periodKey}`}
      referencePoolHref={`/monthly-payments/reference-pool?period=${view.periodKey}`}
    >
      <div className="rounded-[30px] border border-white/80 bg-white/88 px-5 py-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <nav className="text-[0.96rem] font-medium text-slate-500">
              <Link href="/monthly-payments" className="hover:text-slate-800">
                {view.organizationLabel}
              </Link>
              <span className="px-2 text-slate-400">›</span>
              <Link href="/monthly-payments/locations" className="hover:text-slate-800">
                Locations
              </Link>
              <span className="px-2 text-slate-400">›</span>
              <span>{view.propertyName}</span>
              <span className="px-2 text-slate-400">›</span>
              <span className="font-semibold text-slate-950">Rooms</span>
            </nav>
            <h1 className="mt-3 text-[2.2rem] font-semibold tracking-tight text-slate-950">
              {view.propertyName} room manager
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              These room cards come directly from <code>property_units</code>. Edit them here to
              control room naming, contacts, rent, expected references, and match rules that feed
              the payments unit table.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {view.locationLabel || 'Location not set'} · billing window {view.billingWindowLabel}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={openCreateEditor}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900"
            >
              <Plus size={15} />
              Create room
            </button>
            <Link
              href="/monthly-payments/locations"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900"
            >
              <ArrowLeft size={15} />
              Locations
            </Link>
            <Link
              href={`/monthly-payments/${view.propertyId}?period=${view.periodKey}`}
              className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Open units
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-[18px] border border-stone-300 bg-white px-4 py-3">
            <p className="text-sm text-stone-500">Rooms</p>
            <p className="mt-1 text-xl font-semibold text-stone-950">{view.summary.roomCount}</p>
          </div>
          <div className="rounded-[18px] border border-stone-300 bg-white px-4 py-3">
            <p className="text-sm text-stone-500">Occupied</p>
            <p className="mt-1 text-xl font-semibold text-stone-950">{view.summary.occupiedCount}</p>
          </div>
          <div className="rounded-[18px] border border-stone-300 bg-white px-4 py-3">
            <p className="text-sm text-stone-500">Vacant</p>
            <p className="mt-1 text-xl font-semibold text-stone-950">{view.summary.vacantCount}</p>
          </div>
          <div className="rounded-[18px] border border-stone-300 bg-white px-4 py-3">
            <p className="text-sm text-stone-500">Blocked</p>
            <p className="mt-1 text-xl font-semibold text-stone-950">{view.summary.blockedCount}</p>
          </div>
        </div>

        {view.setupState === 'missing_tables' ? (
          <section className="mt-8 rounded-[24px] border border-dashed border-stone-300 bg-white px-5 py-6 text-sm text-stone-500">
            Advanced room-manager columns are not available in the connected database yet. Core
            fields like room label, contacts, rent, expected reference, and match rules are still
            editable now; deposit/spec/media fields unlock after the latest additive migration.
          </section>
        ) : null}

        {draft ? (
          <section className="mt-7 rounded-[24px] border-2 border-stone-700 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(120,113,108,0.08)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                  {editorMode === 'create' ? 'Create room' : 'Editing room'}
                </p>
                <h2 className="mt-2 text-xl font-semibold text-stone-950">{draft.label}</h2>
                <p className="mt-2 max-w-3xl text-sm text-stone-500">
                  This saves back to <code>property_units</code> plus
                  <code> bank_import_unit_match_hints</code>. The units table and monthly matching
                  flow read from these values.
                </p>
                {errorMessage ? <p className="mt-3 text-sm text-rose-700">{errorMessage}</p> : null}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
                >
                  <X size={14} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:bg-stone-500"
                >
                  <Save size={14} />
                  {editorMode === 'create' ? 'Create room' : 'Save room'}
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Room label</span>
                <input
                  value={draft.label}
                  onChange={(event) => updateDraft('label', event.target.value)}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-[#fcfbf7] px-4 py-3 text-sm text-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Primary reference</span>
                <input
                  value={draft.expectedReference}
                  onChange={(event) => updateDraft('expectedReference', event.target.value)}
                  placeholder="e.g. ESSEX ROOM 2"
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-[#fcfbf7] px-4 py-3 text-sm text-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Contact primary</span>
                <input
                  value={draft.contactPrimary}
                  onChange={(event) => updateDraft('contactPrimary', event.target.value)}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-[#fcfbf7] px-4 py-3 text-sm text-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Contact secondary</span>
                <input
                  value={draft.contactSecondary}
                  onChange={(event) => updateDraft('contactSecondary', event.target.value)}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-[#fcfbf7] px-4 py-3 text-sm text-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Rent</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={draft.rentAmount}
                  onChange={(event) => updateDraft('rentAmount', event.target.value)}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-[#fcfbf7] px-4 py-3 text-sm text-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Occupancy</span>
                <select
                  value={draft.occupancy}
                  onChange={(event) => updateDraft('occupancy', event.target.value as RoomDraft['occupancy'])}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-[#fcfbf7] px-4 py-3 text-sm text-stone-900"
                >
                  <option value="occupied">Occupied</option>
                  <option value="vacant">Vacant</option>
                </select>
              </label>

              <label className="block lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Keyword hints</span>
                <input
                  value={draft.matchKeywordsText}
                  onChange={(event) => updateDraft('matchKeywordsText', event.target.value)}
                  placeholder="Comma separated keywords, e.g. Essex, Room 2, R02"
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-[#fcfbf7] px-4 py-3 text-sm text-stone-900"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 rounded-[22px] border border-stone-200 bg-[#fcfbf7] px-4 py-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Deposit</span>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={draft.depositAmount}
                  onChange={(event) => updateDraft('depositAmount', event.target.value)}
                  disabled={advancedFieldsLocked}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Parking</span>
                <input
                  value={draft.parking}
                  onChange={(event) => updateDraft('parking', event.target.value)}
                  disabled={advancedFieldsLocked}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Max occupants</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.maxOccupants}
                  onChange={(event) => updateDraft('maxOccupants', event.target.value)}
                  disabled={advancedFieldsLocked}
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100"
                />
              </label>

              <label className="block lg:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Features</span>
                <input
                  value={draft.featuresText}
                  onChange={(event) => updateDraft('featuresText', event.target.value)}
                  disabled={advancedFieldsLocked}
                  placeholder="Comma separated features"
                  className="mt-2 w-full rounded-[16px] border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100"
                />
              </label>

              <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
                <input
                  type="checkbox"
                  checked={draft.ensuite}
                  onChange={(event) => updateDraft('ensuite', event.target.checked)}
                  disabled={advancedFieldsLocked}
                  className="h-4 w-4 rounded border-stone-300"
                />
                Ensuite
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-stone-700">
                <input
                  type="checkbox"
                  checked={draft.isAvailable}
                  onChange={(event) => updateDraft('isAvailable', event.target.checked)}
                  disabled={advancedFieldsLocked}
                  className="h-4 w-4 rounded border-stone-300"
                />
                On market / available
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-stone-700 lg:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.isBlocked}
                  onChange={(event) => updateDraft('isBlocked', event.target.checked)}
                  className="h-4 w-4 rounded border-stone-300"
                />
                Exclude this room from expected totals for matching
              </label>
            </div>

            <section className="mt-5 rounded-[22px] border border-stone-200 bg-[#fcfbf7] px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-stone-900">Match rules</p>
                  <p className="mt-1 text-sm text-stone-500">
                    These save to <code>bank_import_unit_match_hints</code> and help the inline
                    match drawer rank the right reference for this room.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addRule}
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700"
                >
                  <Plus size={14} />
                  Add rule
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {draft.rules.map((rule, index) => (
                  <div key={`${rule.id ?? 'new'}-${index}`} className="rounded-[18px] border border-stone-200 bg-white px-4 py-4">
                    <div className="grid gap-3 lg:grid-cols-[1.1fr_1.7fr_0.9fr_auto]">
                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Rule type</span>
                        <select
                          value={rule.matcherType}
                          onChange={(event) =>
                            updateRule(index, {
                              matcherType: event.target.value as EditableRule['matcherType'],
                              amountValue:
                                event.target.value === 'amount_equals' ? rule.amountValue : '',
                            })
                          }
                          className="mt-2 w-full rounded-[14px] border border-stone-300 bg-[#fcfbf7] px-3 py-2 text-sm text-stone-900"
                        >
                          <option value="reference_contains">Reference contains</option>
                          <option value="reference_equals">Reference equals</option>
                          <option value="reference_regex">Reference regex</option>
                          <option value="payer_name_contains">Payer contains</option>
                          <option value="amount_equals">Amount equals</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          {rule.matcherType === 'amount_equals' ? 'Rule note' : matcherTypeLabel(rule.matcherType)}
                        </span>
                        <input
                          value={rule.matcherValue}
                          onChange={(event) => updateRule(index, { matcherValue: event.target.value })}
                          placeholder={
                            rule.matcherType === 'reference_regex'
                              ? '^ESSEX[[:space:]]*(ROOM|NO\\.)?[[:space:]]*0?2$'
                              : rule.matcherType === 'amount_equals'
                                ? 'Optional note for this amount rule'
                                : 'Match value'
                          }
                          className="mt-2 w-full rounded-[14px] border border-stone-300 bg-[#fcfbf7] px-3 py-2 text-sm text-stone-900"
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Amount</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={rule.amountValue}
                          onChange={(event) => updateRule(index, { amountValue: event.target.value })}
                          disabled={rule.matcherType !== 'amount_equals'}
                          className="mt-2 w-full rounded-[14px] border border-stone-300 bg-[#fcfbf7] px-3 py-2 text-sm text-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100"
                        />
                      </label>

                      <div className="flex items-end gap-2">
                        <label className="mb-2 flex items-center gap-2 text-sm text-stone-600">
                          <input
                            type="checkbox"
                            checked={rule.isActive}
                            onChange={(event) => updateRule(index, { isActive: event.target.checked })}
                            className="h-4 w-4 rounded border-stone-300"
                          />
                          Active
                        </label>
                        <button
                          type="button"
                          onClick={() => removeRule(index)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-700"
                          aria-label="Remove rule"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 xl:grid-cols-2">
          {view.rooms.map((room) => {
            const status = roomStatus(room);
            const isEditingThisRoom = room.unitId === editingUnitId;

            return (
              <article
                key={room.unitId}
                className="rounded-[24px] border-[2px] border-stone-700 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(120,113,108,0.08)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-semibold text-stone-950">{room.label}</h2>
                      <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600">
                        source: property_units
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-stone-500">
                      {room.contacts.length > 0 ? room.contacts.join(' · ') : 'No contacts yet'}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[18px] bg-[#f5f2eb] px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Rent</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{formatCurrency(room.rentAmount)}</p>
                  </div>
                  <div className="rounded-[18px] bg-[#f5f2eb] px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Deposit</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{formatCurrency(room.depositAmount)}</p>
                  </div>
                  <div className="rounded-[18px] bg-[#f5f2eb] px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-stone-500">Rules</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{room.rules.length + room.keywordCount}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-[18px] border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                    Primary reference
                  </p>
                  <p className="mt-1 text-lg font-semibold text-amber-950">
                    {room.expectedReference || 'No primary reference rule yet'}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                    max {room.maxOccupants}
                  </span>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                    {room.parking ? `parking ${room.parking}` : 'parking unset'}
                  </span>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                    ensuite {room.ensuite ? <Check className="ml-1 inline" size={12} /> : '×'}
                  </span>
                  {room.photoCount > 0 ? (
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">
                      <ImageIcon className="mr-1 inline" size={12} />
                      {room.photoCount} media
                    </span>
                  ) : null}
                  {room.isBlocked ? (
                    <span className="rounded-full bg-stone-200 px-3 py-1 text-stone-700">
                      <Lock className="mr-1 inline" size={12} />
                      excluded from expected
                    </span>
                  ) : null}
                </div>

                {room.features.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {room.features.map((feature, index) => (
                      <span
                        key={`${room.unitId}-feature-${index}-${feature}`}
                        className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-700"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 rounded-[18px] border border-stone-200 bg-[#fcfbf7] px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-stone-900">Match rules</p>
                    <span className="text-xs text-stone-500">{room.keywordCount} keyword hints</span>
                  </div>
                  {room.rules.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {room.rules.slice(0, 3).map((rule) => (
                        <div
                          key={rule.id}
                          className="rounded-[14px] border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700"
                        >
                          {rule.label}
                          {!rule.isActive ? <span className="ml-2 text-xs text-stone-400">off</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-stone-500">No explicit bank-import rules yet.</p>
                  )}
                </div>

                {room.matchKeywords.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {room.matchKeywords.map((keyword, index) => (
                      <span
                        key={`${room.unitId}-keyword-${index}-${keyword}`}
                        className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-stone-500">
                    {room.latestReference ? (
                      <>
                        Latest matched ref <span className="font-semibold text-stone-800">{room.latestReference}</span>
                      </>
                    ) : (
                      'No matched reference yet in this billing window.'
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditor(room)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                      isEditingThisRoom
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-700'
                    }`}
                  >
                    <Pencil size={15} />
                    {isEditingThisRoom ? 'Editing now' : 'Edit room'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </MonthlyPaymentsShell>
  );
}
