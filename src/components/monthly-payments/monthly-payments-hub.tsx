'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Building2,
  ClipboardList,
  Landmark,
  MapPin,
  Pencil,
  ReceiptText,
  Trash2,
  X,
} from 'lucide-react';
import type { MonthlyPaymentsBuildingRecord } from '@/lib/monthly-payments';

type MenuKey = 'admin' | 'references' | 'status-board';

type UnitDraft = {
  id: number;
  label: string;
  price: string;
  reference: string;
  keywords: string;
  occupancy: 'occupied' | 'vacant';
};

const sideMenus: Array<{
  key: MenuKey;
  title: string;
  description: string;
  icon: typeof Landmark;
}> = [
  {
    key: 'admin',
    title: 'Admin',
    description: 'Create buildings, set locations, and configure room pricing.',
    icon: Landmark,
  },
  {
    key: 'references',
    title: 'Reference Pool',
    description: 'Incoming payment references and matching will live here next.',
    icon: ReceiptText,
  },
  {
    key: 'status-board',
    title: 'Status Board',
    description: 'Monthly collection status and arrears tracking will surface here.',
    icon: ClipboardList,
  },
];

const DEFAULT_UNIT_COUNT = 1;

function parseUnitPrice(price: string): number {
  const parsedPrice = Number(price || 0);
  return Number.isFinite(parsedPrice) ? parsedPrice : 0;
}

function formatCurrency(amount: number): string {
  return `R ${amount.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

function createUnitDrafts(unitCount: number, existingUnits: UnitDraft[] = []): UnitDraft[] {
  return Array.from({ length: unitCount }, (_, index) => {
    const roomNumber = index + 1;
    return {
      id: roomNumber,
      label: `Room ${roomNumber}`,
      price: existingUnits[index]?.price ?? '',
      reference: existingUnits[index]?.reference ?? '',
      keywords: existingUnits[index]?.keywords ?? '',
      occupancy: existingUnits[index]?.occupancy ?? 'occupied',
    };
  });
}

type MonthlyPaymentsHubProps = {
  buildings: MonthlyPaymentsBuildingRecord[];
  deleteBuildingAction: (formData: FormData) => void;
  initialBuilding?: MonthlyPaymentsBuildingRecord;
  initialMessage: string;
  saveBuildingAction: (formData: FormData) => void;
};

export function MonthlyPaymentsHub({
  buildings,
  deleteBuildingAction,
  initialBuilding,
  initialMessage,
  saveBuildingAction,
}: MonthlyPaymentsHubProps) {
  const initialUnitDrafts = initialBuilding
    ? createUnitDrafts(
        initialBuilding.unitCount,
        initialBuilding.units.map((unit) => ({
          id: unit.id,
          label: unit.label,
          price: unit.price,
          reference: unit.reference,
          keywords: formatKeywords(unit.keywords),
          occupancy: unit.occupancy,
        }))
      )
    : createUnitDrafts(DEFAULT_UNIT_COUNT);
  const [activeMenu, setActiveMenu] = useState<MenuKey>('admin');
  const [editingBuildingId, setEditingBuildingId] = useState(initialBuilding?.id ?? '');
  const [selectedUnitId, setSelectedUnitId] = useState(1);
  const [buildingName, setBuildingName] = useState(initialBuilding?.name ?? '');
  const [location, setLocation] = useState(initialBuilding?.location ?? '');
  const [unitCount, setUnitCount] = useState(initialBuilding?.unitCount ?? DEFAULT_UNIT_COUNT);
  const [units, setUnits] = useState<UnitDraft[]>(initialUnitDrafts);
  const message = initialMessage;

  function handleUnitCountChange(nextCount: number) {
    setUnitCount(nextCount);
    setUnits((currentUnits) => createUnitDrafts(nextCount, currentUnits));
    setSelectedUnitId((currentSelectedUnitId) => Math.min(currentSelectedUnitId, nextCount));
  }

  function handleUnitPriceChange(unitId: number, nextPrice: string) {
    setUnits((currentUnits) =>
      currentUnits.map((unit) => (unit.id === unitId ? { ...unit, price: nextPrice } : unit))
    );
  }

  function handleUnitOccupancyChange(unitId: number, nextOccupancy: 'occupied' | 'vacant') {
    setUnits((currentUnits) =>
      currentUnits.map((unit) =>
        unit.id === unitId ? { ...unit, occupancy: nextOccupancy } : unit
      )
    );
  }

  function handleUnitReferenceChange(unitId: number, nextReference: string) {
    setUnits((currentUnits) =>
      currentUnits.map((unit) =>
        unit.id === unitId ? { ...unit, reference: nextReference } : unit
      )
    );
  }

  function handleUnitKeywordsChange(unitId: number, nextKeywords: string) {
    setUnits((currentUnits) =>
      currentUnits.map((unit) =>
        unit.id === unitId ? { ...unit, keywords: nextKeywords } : unit
      )
    );
  }

  function resetAdminForm() {
    setEditingBuildingId('');
    setSelectedUnitId(DEFAULT_UNIT_COUNT);
    setBuildingName('');
    setLocation('');
    setUnitCount(DEFAULT_UNIT_COUNT);
    setUnits(createUnitDrafts(DEFAULT_UNIT_COUNT));
  }

  function handleEditBuilding(building: MonthlyPaymentsBuildingRecord) {
    setActiveMenu('admin');
    setEditingBuildingId(building.id);
    setSelectedUnitId(1);
    setBuildingName(building.name);
    setLocation(building.location);
    setUnitCount(building.unitCount);
    setUnits(
      createUnitDrafts(
        building.unitCount,
        building.units.map((unit) => ({
          id: unit.id,
          label: unit.label,
          price: unit.price,
          reference: unit.reference,
          keywords: formatKeywords(unit.keywords),
          occupancy: unit.occupancy,
        }))
      )
    );
  }

  const activeMenuDetails = sideMenus.find((menu) => menu.key === activeMenu) ?? sideMenus[0];
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? units[0];
  const buildingSummaries = buildings.map((building) => ({
    ...building,
    occupiedCount: building.units.filter((unit) => unit.occupancy === 'occupied').length,
    expectedTotal: building.units.reduce(
      (sum, unit) => sum + (unit.occupancy === 'occupied' ? parseUnitPrice(unit.price) : 0),
      0
    ),
    actualCollectedTotal: building.units.reduce(
      (sum, unit) =>
        sum + (unit.occupancy === 'occupied' ? parseUnitPrice(unit.collectedAmount) : 0),
      0
    ),
  }));
  const buildingStatusSummaries = buildingSummaries.map((building) => ({
    ...building,
    outstandingTotal: Math.max(0, building.expectedTotal - building.actualCollectedTotal),
  }));
  const isEditing = editingBuildingId.length > 0;
  const expectedMonthTotal = buildingStatusSummaries.reduce(
    (sum, building) => sum + building.expectedTotal,
    0
  );
  const actualCollectedMonthTotal = buildingStatusSummaries.reduce(
    (sum, building) => sum + building.actualCollectedTotal,
    0
  );
  const outstandingMonthTotal = Math.max(0, expectedMonthTotal - actualCollectedMonthTotal);
  const configuredUnitCount = buildingSummaries.reduce((sum, building) => sum + building.unitCount, 0);
  const occupiedUnitCount = buildingSummaries.reduce(
    (sum, building) => sum + building.occupiedCount,
    0
  );
  const currentMonthLabel = new Intl.DateTimeFormat('en-ZA', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  const panelHeading =
    activeMenu === 'status-board' ? 'Monthly collection status' : 'Building administration';
  const panelDescription =
    activeMenu === 'status-board'
      ? `Track what has been configured for ${currentMonthLabel}. Compare expected occupied-room income against the actual amount collected across all configured buildings.`
      : 'Create a building, add its location, choose how many rooms it contains, and define the expected amount, occupancy, reference, and search keywords for each room.';

  return (
    <main className="payments-page-scroll h-screen overflow-y-scroll bg-[linear-gradient(180deg,#e0f2fe_0%,#f8fafc_42%,#dbeafe_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="rounded-[28px] border border-white/70 bg-slate-950 p-5 text-white shadow-[0_24px_90px_rgba(15,23,42,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
            Monthly Payments
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Operations hub</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Start with the admin setup. That is where we create each building, set its
            location, choose unit count, and define the current price for every room.
          </p>

          <nav className="mt-8 space-y-3">
            {sideMenus.map((menu) => {
              const Icon = menu.icon;
              const isActive = menu.key === activeMenu;

              return (
                <button
                  key={menu.key}
                  type="button"
                  onClick={() => setActiveMenu(menu.key)}
                  className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                    isActive
                      ? 'border-sky-300 bg-sky-400/20 text-white'
                      : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-sky-400/50 hover:text-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
                        isActive ? 'bg-sky-300/20 text-sky-100' : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{menu.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">{menu.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="mt-8 rounded-[22px] border border-slate-800 bg-slate-900/80 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Quick links</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/"
                className="inline-flex items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-100"
              >
                Home
              </Link>
              <Link
                href="/property-assistance"
                className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:border-sky-300 hover:text-sky-100"
              >
                Property Assistance
              </Link>
            </div>
          </div>
        </aside>

        <section className="rounded-[30px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              {activeMenuDetails.title}
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              {panelHeading}
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              {panelDescription}
            </p>
          </div>

          {activeMenu === 'admin' ? (
            <form className="mt-8 space-y-8" action={saveBuildingAction}>
              <input type="hidden" name="buildingId" value={editingBuildingId} />
              <div className="grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Building name</span>
                  <input
                    type="text"
                    name="buildingName"
                    required
                    value={buildingName}
                    onChange={(event) => setBuildingName(event.target.value)}
                    placeholder="Breer"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Location</span>
                  <div className="relative mt-2">
                    <MapPin
                      size={16}
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      name="location"
                      required
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      placeholder="La Lucia, Durban"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    />
                  </div>
                </label>
              </div>

              <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Number of units</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Choose between 1 and 10 rooms. Each room gets its own expected amount,
                      occupancy, and payment matching references.
                    </p>
                  </div>

                  <label className="block md:w-48">
                    <span className="sr-only">Unit count</span>
                    <select
                      name="unitCount"
                      value={unitCount}
                      onChange={(event) => handleUnitCountChange(Number(event.target.value))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                    >
                      {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>
                          {count} {count === 1 ? 'unit' : 'units'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="payments-panel-scroll mt-6 max-h-[28rem] overflow-y-auto pr-2">
                  <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="flex gap-3 overflow-x-auto pb-2 lg:max-h-[28rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
                      {units.map((unit) => {
                        const isSelected = unit.id === selectedUnit.id;

                        return (
                          <button
                            key={unit.id}
                            type="button"
                            onClick={() => setSelectedUnitId(unit.id)}
                            className={`min-w-[140px] rounded-[20px] border px-4 py-4 text-left shadow-sm transition lg:min-w-0 ${
                              isSelected
                                ? 'border-sky-300 bg-white text-slate-950'
                                : 'border-slate-200 bg-slate-100/90 text-slate-600 hover:border-sky-200 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold">{unit.label}</p>
                              <span className="text-xs font-medium text-slate-400">{unit.id}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-slate-950">{selectedUnit.label}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            Edit one unit at a time so payment matching details have room to breathe.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                            {selectedUnit.id} / {units.length}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              selectedUnit.occupancy === 'occupied'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {selectedUnit.occupancy === 'occupied' ? 'Occupied' : 'Vacant'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-5 xl:grid-cols-2">
                        <label className="block">
                          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                            Expected amount
                          </span>
                          <div className="relative mt-3">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                              R
                            </span>
                            <input
                              type="number"
                              name={`unitPrice-${selectedUnit.id}`}
                              min="0"
                              step="0.01"
                              value={selectedUnit.price}
                              onChange={(event) =>
                                handleUnitPriceChange(selectedUnit.id, event.target.value)
                              }
                              placeholder="0.00"
                              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-4 text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                            />
                          </div>
                        </label>

                        <label className="block">
                          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                            Occupancy
                          </span>
                          <select
                            name={`unitOccupancy-${selectedUnit.id}`}
                            value={selectedUnit.occupancy}
                            onChange={(event) =>
                              handleUnitOccupancyChange(
                                selectedUnit.id,
                                event.target.value === 'vacant' ? 'vacant' : 'occupied'
                              )
                            }
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
                          >
                            <option value="occupied">Occupied</option>
                            <option value="vacant">Vacant</option>
                          </select>
                        </label>

                        <label className="block xl:col-span-2">
                          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                            Expected reference
                          </span>
                          <input
                            type="text"
                            name={`unitReference-${selectedUnit.id}`}
                            value={selectedUnit.reference}
                            onChange={(event) =>
                              handleUnitReferenceChange(selectedUnit.id, event.target.value)
                            }
                            placeholder="SX Room 1"
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                          />
                        </label>

                        <label className="block xl:col-span-2">
                          <span className="text-xs uppercase tracking-[0.16em] text-slate-400">
                            Match keywords
                          </span>
                          <textarea
                            name={`unitKeywords-${selectedUnit.id}`}
                            value={selectedUnit.keywords}
                            onChange={(event) =>
                              handleUnitKeywordsChange(selectedUnit.id, event.target.value)
                            }
                            placeholder="SX Room 1, Berea Room 1, Essex Road Room 1"
                            rows={5}
                            className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                          />
                        </label>
                      </div>
                    </div>

                    <div className="hidden">
                      {units
                        .filter((unit) => unit.id !== selectedUnit.id)
                        .map((unit) => (
                          <div key={`hidden-unit-${unit.id}`}>
                            <input type="hidden" name={`unitPrice-${unit.id}`} value={unit.price} />
                            <input
                              type="hidden"
                              name={`unitOccupancy-${unit.id}`}
                              value={unit.occupancy}
                            />
                            <input
                              type="hidden"
                              name={`unitReference-${unit.id}`}
                              value={unit.reference}
                            />
                            <input
                              type="hidden"
                              name={`unitKeywords-${unit.id}`}
                              value={unit.keywords}
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-[24px] border border-sky-100 bg-sky-50 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <p className="text-sm leading-6 text-sky-900">{message}</p>
                  {isEditing ? (
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-sky-700">
                      Editing existing building
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={resetAdminForm}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-sky-400 hover:text-sky-800"
                    >
                      <X size={16} />
                      Cancel edit
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
                  >
                    {isEditing ? 'Update building' : 'Save building'}
                  </button>
                </div>
              </div>
            </form>
          ) : activeMenu === 'status-board' ? (
            <div className="mt-8 space-y-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
                <section className="rounded-[26px] border border-slate-200 bg-slate-50 p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Current month
                  </p>
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-3xl font-semibold tracking-tight text-slate-950">
                          {formatCurrency(expectedMonthTotal)}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Expected from occupied units for {currentMonthLabel}.
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                        {buildingStatusSummaries.length} configured{' '}
                        {buildingStatusSummaries.length === 1 ? 'building' : 'buildings'}
                      </span>
                    </div>

                    <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                      <article className="rounded-[22px] bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          Actual collected
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {formatCurrency(actualCollectedMonthTotal)}
                        </p>
                      </article>
                      <article className="rounded-[22px] bg-white p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          Outstanding
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-950">
                          {formatCurrency(outstandingMonthTotal)}
                        </p>
                      </article>
                    </div>
                  </div>
                </section>

                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Occupied rooms
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-slate-950">
                      {occupiedUnitCount}
                    </p>
                  </article>
                  <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Configured rooms
                    </p>
                    <p className="mt-3 text-2xl font-semibold text-slate-950">
                      {configuredUnitCount}
                    </p>
                  </article>
                </section>
              </div>

              <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-slate-950">Building totals</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      Each building shows the expected occupied-room income, the actual amount collected, and the remaining balance for this month.
                    </p>
                  </div>
                  <p className="text-sm font-medium text-slate-500">{currentMonthLabel}</p>
                </div>

                {buildingSummaries.length === 0 ? (
                  <div className="mt-6 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-6">
                    <p className="text-sm font-semibold text-slate-800">No buildings configured yet</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Save a building in the admin menu and the current month total will appear here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-4 xl:grid-cols-2">
                    {buildingStatusSummaries.map((building) => (
                      <article
                        key={building.id}
                        className="rounded-[22px] border border-slate-200 bg-slate-50 p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-950">{building.name}</h3>
                            <p className="mt-1 text-sm text-slate-500">{building.location}</p>
                          </div>
                          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                            {building.occupiedCount} occupied
                          </span>
                        </div>

                        <div className="mt-4 rounded-[20px] bg-white p-4 shadow-sm">
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                            Expected total
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-950">
                            {formatCurrency(building.expectedTotal)}
                          </p>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-[18px] bg-white p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                              Actual collected
                            </p>
                            <p className="mt-2 text-xl font-semibold text-slate-950">
                              {formatCurrency(building.actualCollectedTotal)}
                            </p>
                          </div>
                          <div className="rounded-[18px] bg-white p-4 shadow-sm">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                              Outstanding
                            </p>
                            <p className="mt-2 text-xl font-semibold text-slate-950">
                              {formatCurrency(building.outstandingTotal)}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="mt-8 rounded-[26px] border border-dashed border-slate-300 bg-slate-50 p-8">
              <p className="text-lg font-semibold text-slate-900">{activeMenuDetails.title}</p>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                This menu is parked for the next step. The admin menu is live now so we can
                define buildings, locations, unit counts, and room pricing before building
                reference matching and the monthly status board.
              </p>
            </div>
          )}
        </section>

        <aside className="rounded-[30px] border border-white/70 bg-white/90 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
              <Building2 size={20} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Configured buildings
              </p>
              <p className="text-lg font-semibold text-slate-950">{buildings.length}</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {buildings.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-800">No buildings yet</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Save your first building from the admin menu and it will appear here with
                  its units and pricing summary.
                </p>
              </div>
            ) : (
              buildingSummaries.map((building) => {
                return (
                  <article
                    key={building.id}
                    className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">{building.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">{building.location}</p>
                      </div>
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                        {building.unitCount} {building.unitCount === 1 ? 'unit' : 'units'}
                      </span>
                    </div>

                    <div className="mt-4 rounded-[20px] bg-white p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        Expected total
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {formatCurrency(building.expectedTotal)}
                      </p>
                    </div>

                    <div className="mt-4 space-y-2">
                      {building.units.map((unit) => (
                        <div
                          key={`${building.id}-${unit.id}`}
                          className="rounded-2xl bg-white px-4 py-3 text-sm shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-700">{unit.label}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    unit.occupancy === 'occupied'
                                      ? 'bg-sky-100 text-sky-700'
                                      : 'bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {unit.occupancy === 'occupied' ? 'Occupied' : 'Vacant'}
                                </span>
                              </div>
                              {unit.reference ? (
                                <p className="mt-1 text-xs text-slate-500">Ref: {unit.reference}</p>
                              ) : null}
                              {unit.keywords.length > 0 ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  Keywords: {formatKeywords(unit.keywords)}
                                </p>
                              ) : null}
                            </div>
                            <span className="font-semibold text-slate-950">
                              {formatCurrency(parseUnitPrice(unit.price))}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleEditBuilding(building)}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:text-sky-800"
                      >
                        <Pencil size={16} />
                        Edit
                      </button>
                      <form action={deleteBuildingAction}>
                        <input type="hidden" name="buildingId" value={building.id} />
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
