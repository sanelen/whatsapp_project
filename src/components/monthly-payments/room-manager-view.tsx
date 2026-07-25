'use client';

import type { ReactNode } from 'react';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import type { RoomManagerRoomRow, RoomManagerRule, RoomManagerView } from '@/lib/monthly-payments';
import { MonthlyPaymentsNavigation } from './monthly-payments-navigation';

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

type StayDraft = {
  tenantDisplayName: string;
  contactPrimary: string;
  contactSecondary: string;
  startsOn: string;
  endsOn: string;
  depositTargetAmount: string;
  closeReason: string;
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

function combinedTenantName(stay: Pick<StayDraft, 'tenantDisplayName' | 'contactPrimary' | 'contactSecondary'>) {
  return [stay.contactPrimary, stay.contactSecondary].map((part) => part.trim()).filter(Boolean).join(' ') || stay.tenantDisplayName;
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
  if (room.isAvailable || room.occupancy === 'vacant' || (room.stayLifecycleMode === 'occupancy' && !room.currentStay)) {
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
    matcherType: 'reference_equals',
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

function createCurrentStayDraft(room: RoomManagerRoomRow, draft: RoomDraft): StayDraft {
  const stay = room.currentStay;
  return {
    tenantDisplayName: stay?.tenantDisplayName || [draft.contactPrimary, draft.contactSecondary].filter(Boolean).join(' '),
    contactPrimary: stay?.contactPrimary || draft.contactPrimary,
    contactSecondary: stay?.contactSecondary || draft.contactSecondary,
    startsOn: stay?.startsOn ?? '',
    endsOn: stay?.endsOn ?? '',
    depositTargetAmount: String(stay?.depositTargetAmount ?? Number(draft.depositAmount || 0)),
    closeReason: '',
  };
}

function createPastStayDraft(draft: RoomDraft): StayDraft {
  return {
    tenantDisplayName: 'Previous tenant',
    contactPrimary: '',
    contactSecondary: '',
    startsOn: '',
    endsOn: '',
    depositTargetAmount: draft.depositAmount,
    closeReason: 'retrospective stay version',
  };
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
    <main className="hamba-dashboard min-h-screen text-[#1c1a17]">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <MonthlyPaymentsNavigation
          active="room-manager"
          operationsHref={`/monthly-payments/${view.propertyId}?period=${view.periodKey}`}
          referencePoolHref={`/monthly-payments/reference-pool?period=${view.periodKey}`}
          importAuditHref={`/monthly-payments/import-audit?period=${view.periodKey}`}
        />

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
                  Room cards feed the payments unit table - names, rent, primary reference and known references all live here.
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
                  room={undefined}
                  propertyId={view.propertyId}
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
                        room={room}
                        propertyId={view.propertyId}
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
  room,
  propertyId,
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
  room?: RoomManagerRoomRow;
  propertyId: string;
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
  const router = useRouter();
  const [stayNotice, setStayNotice] = useState<string | null>(null);
  const [stayError, setStayError] = useState<string | null>(null);
  const [isSavingStay, startSavingStay] = useTransition();
  const [currentStayDraft, setCurrentStayDraft] = useState<StayDraft | null>(
    room ? createCurrentStayDraft(room, draft) : null
  );
  const [pastStayDraft, setPastStayDraft] = useState<StayDraft>(createPastStayDraft(draft));
  const [endStayDate, setEndStayDate] = useState(room?.currentStay?.endsOn ?? '');

  function updateCurrentStay<K extends keyof StayDraft>(key: K, value: StayDraft[K]) {
    setCurrentStayDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function updatePastStay<K extends keyof StayDraft>(key: K, value: StayDraft[K]) {
    setPastStayDraft((current) => ({ ...current, [key]: value }));
  }

  function submitStayAction(action: 'save_current_stay' | 'add_past_stay' | 'end_current_stay', stay: StayDraft) {
    if (!draft.unitId) return;
    setStayError(null);
    setStayNotice(null);
    startSavingStay(async () => {
      try {
        await saveRoom({
          action,
          unitId: draft.unitId,
          propertyId,
          tenantDisplayName: action === 'add_past_stay' ? stay.tenantDisplayName : combinedTenantName(stay),
          contactPrimary: stay.contactPrimary,
          contactSecondary: stay.contactSecondary,
          startsOn: stay.startsOn || undefined,
          endsOn: stay.endsOn || undefined,
          closeReason: stay.closeReason || undefined,
          depositAmount: Number(stay.depositTargetAmount || draft.depositAmount || 0),
        });
      } catch (error) {
        setStayError(error instanceof Error ? error.message : 'Failed to save tenant stay');
        return;
      }
      setStayNotice(
        action === 'add_past_stay'
          ? 'Past stay added'
          : action === 'end_current_stay'
            ? 'Current stay ended'
            : 'Current stay saved'
      );
      router.refresh();
    });
  }

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

      {room && currentStayDraft ? (
        <div className="mt-3.5 border-t border-[#f0ece0] pt-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[13px] font-bold text-[#1c1a17]">Stay history</p>
              <p className="mt-0.5 text-[11.5px] text-[#8a8578]">
                {room.stayLifecycleMode === 'occupancy'
                  ? 'Tenant versions for deposits and payment history. Use Billing from for the month the stay should own money.'
                  : 'Tenant stay migration required.'}
              </p>
            </div>
            {room.stayLifecycleMode === 'occupancy' ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#0f7b53]">
                {room.stays.length} stay{room.stays.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          {stayError ? <p className="mt-2 text-[12px] font-semibold text-rose-700">{stayError}</p> : null}
          {stayNotice ? <p className="mt-2 text-[12px] font-semibold text-emerald-700">{stayNotice}</p> : null}

          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-[#e7e3d6] bg-white p-3">
              <p className="text-[12px] font-bold text-[#1c1a17]">Active tenant version</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <FieldLabel label="Tenant">
                  <input
                    value={combinedTenantName(currentStayDraft)}
                    readOnly
                    aria-readonly="true"
                    className={`${inputClassName} bg-[#f8f6ef]`}
                  />
                </FieldLabel>
                <FieldLabel label="Billing from">
                  <input
                    type="date"
                    value={currentStayDraft.startsOn}
                    onChange={(event) => updateCurrentStay('startsOn', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
                <FieldLabel label="Name">
                  <input
                    value={currentStayDraft.contactPrimary}
                    onChange={(event) => updateCurrentStay('contactPrimary', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
                <FieldLabel label="Surname">
                  <input
                    value={currentStayDraft.contactSecondary}
                    onChange={(event) => updateCurrentStay('contactSecondary', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
                <FieldLabel label="Deposit target">
                  <input
                    type="number"
                    min="0"
                    value={currentStayDraft.depositTargetAmount}
                    onChange={(event) => updateCurrentStay('depositTargetAmount', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
                <FieldLabel label="Ends after">
                  <input
                    type="date"
                    value={endStayDate}
                    onChange={(event) => setEndStayDate(event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingStay || room.stayLifecycleMode !== 'occupancy'}
                  onClick={() => submitStayAction('save_current_stay', currentStayDraft)}
                  className="rounded-full border border-[#e7e3d6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#292524] disabled:cursor-not-allowed disabled:text-[#a39d8d]"
                >
                  Save tenant version
                </button>
                <button
                  type="button"
                  disabled={isSavingStay || room.stayLifecycleMode !== 'occupancy' || !endStayDate}
                  onClick={() =>
                    submitStayAction('end_current_stay', {
                      ...currentStayDraft,
                      endsOn: endStayDate,
                      closeReason: currentStayDraft.closeReason || 'tenant moved out',
                    })
                  }
                  className="rounded-full border border-[#e7e3d6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#7c2d12] disabled:cursor-not-allowed disabled:text-[#a39d8d]"
                >
                  End tenant version
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-[#e7e3d6] bg-white p-3">
              <p className="text-[12px] font-bold text-[#1c1a17]">Add past stay</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <FieldLabel label="Tenant">
                  <input
                    value={pastStayDraft.tenantDisplayName}
                    onChange={(event) => updatePastStay('tenantDisplayName', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
                <FieldLabel label="Ended on">
                  <input
                    type="date"
                    value={pastStayDraft.endsOn}
                    onChange={(event) => updatePastStay('endsOn', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
                <FieldLabel label="Billing from">
                  <input
                    type="date"
                    value={pastStayDraft.startsOn}
                    onChange={(event) => updatePastStay('startsOn', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
                <FieldLabel label="Deposit target">
                  <input
                    type="number"
                    min="0"
                    value={pastStayDraft.depositTargetAmount}
                    onChange={(event) => updatePastStay('depositTargetAmount', event.target.value)}
                    disabled={room.stayLifecycleMode !== 'occupancy'}
                    className={inputClassName}
                  />
                </FieldLabel>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={isSavingStay || room.stayLifecycleMode !== 'occupancy' || !pastStayDraft.endsOn}
                  onClick={() => submitStayAction('add_past_stay', pastStayDraft)}
                  className="rounded-full border border-[#e7e3d6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#292524] disabled:cursor-not-allowed disabled:text-[#a39d8d]"
                >
                  Add past stay
                </button>
              </div>
            </div>
          </div>

          {room.stays.length > 0 ? (
            <div className="mt-2 divide-y divide-[#f0ece0] rounded-xl border border-[#e7e3d6] bg-white px-3">
              {room.stays.map((stay) => (
                <div key={stay.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[12px] font-bold text-[#292524]">
                      {stay.tenantDisplayName || 'Unnamed stay'} · {stay.status}
                    </p>
                    <p className="text-[11.5px] text-[#8a8578]">
                      {[stay.startsOn ? `Billing from ${stay.startsOn}` : null, stay.endsOn ? `ended ${stay.endsOn}` : null, stay.closedAt ? 'closed' : null]
                        .filter(Boolean)
                        .join(' · ') || 'Dates not captured'}
                    </p>
                  </div>
                  <span className="self-start rounded-full bg-[#e8f6ee] px-2.5 py-1 text-[11px] font-bold text-[#0f7b53]">
                    Deposit paid {formatCurrency(stay.depositBalance)} / {formatCurrency(stay.depositTargetAmount)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3.5 border-t border-[#f0ece0] pt-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] font-bold text-[#1c1a17]">Known references</p>
            <p className="mt-0.5 text-[11.5px] text-[#8a8578]">
              Primary reference stays above. Add tenant-used variants here; remove a bad one with X.
            </p>
          </div>
          <button
            type="button"
            onClick={addRule}
            className="rounded-full border border-[#e7e3d6] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#292524]"
          >
            + Add known ref
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
                <option value="reference_equals">Exact reference</option>
                <option value="reference_contains">Contains text</option>
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
                aria-label="Delete known reference"
              >
                <X size={14} />
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
