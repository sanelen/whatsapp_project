'use client';

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import type { RoomManagerRoomRow, RoomManagerRule, RoomManagerView } from '@/lib/monthly-payments';

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
type StatusFilter = 'all' | 'occupied' | 'vacant' | 'blocked';

const inputClassName =
  'mt-1 w-full rounded-[10px] border border-[#e7e3d6] bg-white px-3 py-2 text-[13px] text-[#1c1a17] outline-none disabled:cursor-not-allowed disabled:bg-[#f1efe9]';

function formatCurrency(amount: number) {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function roomStatus(room: RoomManagerView['rooms'][number]) {
  if (room.isBlocked) {
    return {
      key: 'blocked' as const,
      label: 'blocked',
      pillClass: 'bg-[#f1efe9] text-[#78716c]',
      barClass: 'bg-[#78716c]',
    };
  }
  if (room.isAvailable || room.occupancy === 'vacant') {
    return {
      key: 'vacant' as const,
      label: 'on market',
      pillClass: 'bg-[#e6f3fb] text-[#0369a1]',
      barClass: 'bg-[#0369a1]',
    };
  }
  return {
    key: 'occupied' as const,
    label: 'occupied',
    pillClass: 'bg-[#e8f6ee] text-[#0f7b53]',
    barClass: 'bg-[#0f7b53]',
  };
}

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
        : [createEmptyRule()],
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
    rules: [createEmptyRule()],
  };
}

function createEmptyRule(): EditableRule {
  return {
    matcherType: 'reference_contains',
    matcherValue: '',
    amountValue: '',
    isActive: true,
  };
}

function parseCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const advancedFieldsLocked = view.setupState === 'missing_tables';

  const filteredRooms = view.rooms.filter((room) => {
    const status = roomStatus(room);
    if (statusFilter !== 'all' && status.key !== statusFilter) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [
      room.label,
      room.contactPrimary,
      room.contactSecondary,
      room.expectedReference,
      ...room.matchKeywords,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

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
    const target = launchedFromUnits
      ? `/monthly-payments/${view.propertyId}?period=${view.periodKey}&unitId=${initialUnitId}`
      : `/monthly-payments/locations/${view.propertyId}?period=${view.periodKey}`;
    router.replace(target, { scroll: false });
  }

  function toggleRoom(room: RoomManagerRoomRow) {
    if (editingUnitId === room.unitId) {
      closeEditor();
      return;
    }
    openEditor(room);
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
    <main className="min-h-screen bg-[#f6f4ef] text-[#1c1a17]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 flex-col gap-5 bg-[#0f172a] px-[18px] py-[18px] text-white lg:flex">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7dd3fc]">
              Monthly Payments
            </p>
            <p className="mt-2 text-[22px] font-bold tracking-normal">Workspace</p>
          </div>

          <nav className="flex flex-col gap-1.5">
            <Link href="/monthly-payments" className="rounded-xl px-3 py-2 text-[13px] font-semibold text-slate-400">
              Dashboard
            </Link>
            <Link href="/monthly-payments/locations" className="rounded-xl bg-sky-300/15 px-3 py-2 text-[13px] font-semibold text-white">
              Locations
            </Link>
            <Link href={`/monthly-payments/${view.propertyId}?period=${view.periodKey}`} className="rounded-xl px-3 py-2 text-[13px] font-semibold text-slate-400">
              Match & sign off
            </Link>
            <Link href={`/monthly-payments/reference-pool?period=${view.periodKey}`} className="rounded-xl px-3 py-2 text-[13px] font-semibold text-slate-400">
              Reference pool
            </Link>
          </nav>

          <div className="mt-auto flex gap-2 border-t border-white/10 pt-4">
            <Link href="/" className="flex-1 rounded-full bg-white py-2 text-center text-[12.5px] font-bold text-[#0f172a]">
              Home
            </Link>
            <Link href="/property-assistance" className="flex-1 rounded-full border border-white/20 py-2 text-center text-[12.5px] font-bold text-white">
              Chatbox
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-[1080px]">
            <nav className="text-[13px] text-[#8a8578]">
              <Link href="/monthly-payments" className="hover:text-[#292524]">
                {view.organizationLabel}
              </Link>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <Link href="/monthly-payments/locations" className="hover:text-[#292524]">
                locations
              </Link>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <span>{view.propertyName}</span>
              <span className="mx-1.5 text-[#c7c2b4]">›</span>
              <span className="font-semibold text-[#292524]">Rooms</span>
            </nav>

            <div className="mt-2.5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="m-0 text-[26px] font-bold tracking-normal text-[#1c1a17]">
                  {view.propertyName} room manager
                </h1>
                <p className="mt-1 max-w-[560px] text-[13px] leading-normal text-[#8a8578]">
                  Room cards feed the payments unit table - names, rent and match rules all live here.
                </p>
                <p className="mt-1.5 text-[13px] text-[#a39d8d]">Billing window {view.billingWindowLabel}</p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={openCreateEditor}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#ddd8ca] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#292524]"
                >
                  <Plus size={14} />
                  Create room
                </button>
                <Link
                  href={`/monthly-payments/${view.propertyId}?period=${view.periodKey}`}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#1c1a17] px-3.5 py-2 text-[13px] font-semibold text-white"
                >
                  Open units →
                </Link>
              </div>
            </div>

            <div className="mt-4 grid overflow-hidden rounded-2xl border border-[#e7e3d6] bg-white sm:grid-cols-4">
              <StatCell label="Rooms" value={view.summary.roomCount} />
              <StatCell label="Occupied" value={view.summary.occupiedCount} valueClassName="text-[#0f7b53]" />
              <StatCell label="Vacant" value={view.summary.vacantCount} valueClassName="text-[#0369a1]" />
              <StatCell label="Blocked" value={view.summary.blockedCount} valueClassName="text-[#78716c]" isLast />
            </div>

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search room, name, surname, or reference..."
                className="min-w-[220px] flex-1 rounded-xl border border-[#e7e3d6] bg-white px-3 py-2 text-[13px] text-[#1c1a17] outline-none focus:border-[#1c1a17]"
              />
              <div className="flex gap-1.5">
                {(['all', 'occupied', 'vacant', 'blocked'] as const).map((filter) => {
                  const active = statusFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setStatusFilter(filter)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                        active
                          ? 'border-[#1c1a17] bg-[#1c1a17] text-white'
                          : 'border-[#e7e3d6] bg-white text-[#57534e]'
                      }`}
                    >
                      {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  );
                })}
              </div>
            </div>

            {view.setupState === 'missing_tables' ? (
              <section className="mt-3.5 rounded-2xl border border-dashed border-[#ddd8ca] bg-white px-4 py-3 text-[13px] text-[#6f6a5e]">
                Advanced room-manager columns are not available in the connected database yet. Core fields remain editable.
              </section>
            ) : null}

            {editorMode === 'create' && draft ? (
              <section className="mt-3.5 overflow-hidden rounded-2xl border border-[#e7e3d6] bg-white">
                <RoomEditor
                  draft={draft}
                  errorMessage={errorMessage}
                  advancedFieldsLocked={advancedFieldsLocked}
                  isSaving={isSaving}
                  mode="create"
                  updateDraft={updateDraft}
                  updateRule={updateRule}
                  addRule={addRule}
                  removeRule={removeRule}
                  handleSave={handleSave}
                  closeEditor={closeEditor}
                />
              </section>
            ) : null}

            <section className="mt-3.5 overflow-hidden rounded-2xl border border-[#e7e3d6] bg-white">
              <div className="hidden grid-cols-[5px_minmax(170px,1.4fr)_minmax(135px,0.9fr)_minmax(135px,0.9fr)_90px_minmax(130px,1.3fr)_28px] items-center gap-3 border-b border-[#f0ece0] bg-[#fbfaf6] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#a39d8d] lg:grid">
                <span />
                <span>Room</span>
                <span>Name</span>
                <span>Surname</span>
                <span>Rent</span>
                <span>Reference</span>
                <span />
              </div>
              {filteredRooms.map((room, index) => {
                const status = roomStatus(room);
                const isExpanded = editingUnitId === room.unitId && editorMode === 'edit' && draft;
                const nameSummary = [room.contactPrimary, room.contactSecondary].filter(Boolean).join(' ');

                return (
                  <article
                    key={room.unitId}
                    className={`${index > 0 ? 'border-t border-[#f0ece0]' : ''} ${isExpanded ? 'bg-[#fbfaf6]' : 'bg-white'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRoom(room)}
                      className="grid w-full cursor-pointer grid-cols-[5px_minmax(170px,1.4fr)_minmax(135px,0.9fr)_minmax(135px,0.9fr)_90px_minmax(130px,1.3fr)_28px] items-center gap-3 px-4 py-2 text-left max-lg:grid-cols-[5px_1fr_28px] max-lg:gap-3"
                    >
                      <span className={`block h-7 w-[5px] rounded-[3px] ${status.barClass}`} />
                      <span>
                        <span className="flex items-center gap-2">
                          <h2 className="text-[14px] font-bold text-[#1c1a17]">{room.label}</h2>
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${status.pillClass}`}>
                            {status.label}
                          </span>
                        </span>
                        {room.expectedReference ? (
                          <span className="block text-[12px] text-[#a39d8d]">ref {room.expectedReference}</span>
                        ) : null}
                        {nameSummary ? <span className="block text-[12px] text-[#c7c2b4] lg:hidden">{nameSummary}</span> : null}
                      </span>
                      <span className="text-[12.5px] text-[#6f6a5e] max-lg:hidden">
                        {room.contactPrimary || <span className="text-[#c7c2b4]">no name</span>}
                      </span>
                      <span className="text-[12.5px] text-[#6f6a5e] max-lg:hidden">
                        {room.contactSecondary || <span className="text-[#c7c2b4]">no surname</span>}
                      </span>
                      <span className="text-[13px] font-semibold text-[#1c1a17] max-lg:hidden">{formatCurrency(room.rentAmount)}</span>
                      <span className="max-lg:hidden">
                        {room.expectedReference ? (
                          <span className="inline-flex whitespace-nowrap rounded-full bg-[#faf6e8] px-2 py-0.5 text-[11.5px] font-semibold text-[#8a6d1a]">
                            {room.expectedReference}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[#c7c2b4]">no reference set</span>
                        )}
                      </span>
                      <span className={`text-center text-base text-[#a39d8d] transition ${isExpanded ? 'rotate-180' : ''}`}>
                        ⌄
                      </span>
                    </button>

                    {isExpanded ? (
                      <RoomEditor
                        draft={draft}
                        errorMessage={errorMessage}
                        advancedFieldsLocked={advancedFieldsLocked}
                        isSaving={isSaving}
                        mode="edit"
                        updateDraft={updateDraft}
                        updateRule={updateRule}
                        addRule={addRule}
                        removeRule={removeRule}
                        handleSave={handleSave}
                        closeEditor={closeEditor}
                      />
                    ) : null}
                  </article>
                );
              })}

              {filteredRooms.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-[#a39d8d]">No rooms match your search.</div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCell({
  label,
  value,
  valueClassName = 'text-[#1c1a17]',
  isLast = false,
}: {
  label: string;
  value: number;
  valueClassName?: string;
  isLast?: boolean;
}) {
  return (
    <div className={`border-b border-[#e7e3d6] px-3.5 py-2 sm:border-b-0 ${isLast ? '' : 'sm:border-r'}`}>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#a39d8d]">{label}</p>
      <p className={`mt-0.5 text-[17px] font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function RoomEditor({
  draft,
  errorMessage,
  advancedFieldsLocked,
  isSaving,
  mode,
  updateDraft,
  updateRule,
  addRule,
  removeRule,
  handleSave,
  closeEditor,
}: {
  draft: RoomDraft;
  errorMessage: string | null;
  advancedFieldsLocked: boolean;
  isSaving: boolean;
  mode: EditorMode;
  updateDraft: <K extends keyof RoomDraft>(key: K, value: RoomDraft[K]) => void;
  updateRule: (index: number, patch: Partial<EditableRule>) => void;
  addRule: () => void;
  removeRule: (index: number) => void;
  handleSave: () => void;
  closeEditor: () => void;
}) {
  return (
    <div className="border-t border-[#f0ece0] bg-[#fbfaf6] px-4 pb-4 pt-3.5">
      {errorMessage ? <p className="mb-2.5 text-[13px] font-semibold text-rose-700">{errorMessage}</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <FieldLabel label="Room label">
          <input aria-label="Room label" value={draft.label} onChange={(event) => updateDraft('label', event.target.value)} className={inputClassName} />
        </FieldLabel>
        <FieldLabel label="Primary reference">
          <input
            value={draft.expectedReference}
            aria-label="Primary reference"
            onChange={(event) => updateDraft('expectedReference', event.target.value)}
            placeholder="e.g. ESSEX ROOM 2"
            className={inputClassName}
          />
        </FieldLabel>
        <FieldLabel label="Name">
          <input aria-label="Name" value={draft.contactPrimary} onChange={(event) => updateDraft('contactPrimary', event.target.value)} className={inputClassName} />
        </FieldLabel>
        <FieldLabel label="Surname">
          <input aria-label="Surname" value={draft.contactSecondary} onChange={(event) => updateDraft('contactSecondary', event.target.value)} className={inputClassName} />
        </FieldLabel>
        <FieldLabel label="Rent">
          <input aria-label="Rent" type="number" min="0" value={draft.rentAmount} onChange={(event) => updateDraft('rentAmount', event.target.value)} className={inputClassName} />
        </FieldLabel>
        <FieldLabel label="Deposit">
          <input
            type="number"
            min="0"
            aria-label="Deposit"
            value={draft.depositAmount}
            onChange={(event) => updateDraft('depositAmount', event.target.value)}
            disabled={advancedFieldsLocked}
            className={inputClassName}
          />
        </FieldLabel>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <FieldLabel label="Occupancy" className="min-w-[180px]">
          <select
            value={draft.occupancy}
            aria-label="Occupancy"
            onChange={(event) => updateDraft('occupancy', event.target.value as RoomDraft['occupancy'])}
            className={inputClassName}
          >
            <option value="occupied">Occupied</option>
            <option value="vacant">Vacant</option>
          </select>
        </FieldLabel>
        <label className="mt-[20px] flex items-center gap-2 text-[12.5px] font-semibold text-[#57534e]">
          <input type="checkbox" checked={draft.isBlocked} onChange={(event) => updateDraft('isBlocked', event.target.checked)} />
          Exclude from expected totals
        </label>
        <label className="mt-[20px] flex items-center gap-2 text-[12.5px] font-semibold text-[#57534e]">
          <input
            type="checkbox"
            checked={draft.ensuite}
            onChange={(event) => updateDraft('ensuite', event.target.checked)}
            disabled={advancedFieldsLocked}
          />
          Ensuite
        </label>
        <FieldLabel label="Parking" className="min-w-[140px]">
          <input
            value={draft.parking}
            aria-label="Parking"
            onChange={(event) => updateDraft('parking', event.target.value)}
            disabled={advancedFieldsLocked}
            className={inputClassName}
          />
        </FieldLabel>
      </div>

      <div className="mt-3.5 border-t border-[#f0ece0] pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-[#1c1a17]">Match rules</p>
          <button
            type="button"
            onClick={addRule}
            className="rounded-full border border-[#e7e3d6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#292524]"
          >
            + Add rule
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {draft.rules.map((rule, index) => (
            <div key={`${rule.id ?? 'new'}-${index}`} className="grid grid-cols-[1fr_1.8fr_auto] items-center gap-2 rounded-[10px] border border-[#e7e3d6] bg-white px-2 py-1.5 max-sm:grid-cols-1">
              <select
                value={rule.matcherType}
                onChange={(event) =>
                  updateRule(index, {
                    matcherType: event.target.value as EditableRule['matcherType'],
                    amountValue: event.target.value === 'amount_equals' ? rule.amountValue : '',
                  })
                }
                className="rounded-lg border border-[#e7e3d6] px-2 py-1 text-[12px]"
              >
                <option value="reference_contains">Ref contains</option>
                <option value="reference_equals">Ref equals</option>
                <option value="reference_regex">Ref regex</option>
                <option value="payer_name_contains">Payer contains</option>
                <option value="amount_equals">Amount equals</option>
              </select>
              <input
                value={rule.matcherType === 'amount_equals' ? rule.amountValue : rule.matcherValue}
                onChange={(event) =>
                  updateRule(
                    index,
                    rule.matcherType === 'amount_equals'
                      ? { amountValue: event.target.value }
                      : { matcherValue: event.target.value }
                  )
                }
                placeholder="Match value"
                className="rounded-lg border border-[#e7e3d6] px-2.5 py-1 text-[12px]"
              />
              <button
                type="button"
                onClick={() => removeRule(index)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#a39d8d]"
                aria-label="Remove rule"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {draft.matchKeywordsText ? (
        <p className="mt-2.5 text-[11.5px] text-[#a39d8d]">Keyword hints: {draft.matchKeywordsText}</p>
      ) : null}

      <div className="mt-3.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={closeEditor}
          className="rounded-full border border-[#e7e3d6] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#57534e]"
        >
          Close
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-[#1c1a17] px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:cursor-wait disabled:bg-[#78716c]"
        >
          {isSaving ? 'Saving...' : mode === 'create' ? 'Create room' : 'Save room'}
        </button>
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#a39d8d]">{label}</span>
      {children}
    </label>
  );
}
