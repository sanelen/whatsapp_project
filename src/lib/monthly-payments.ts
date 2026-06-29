import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';

export type MonthlyPaymentsUnitRecord = {
  id: number;
  label: string;
  price: string;
  collectedAmount: string;
  reference: string;
  keywords: string[];
  occupancy: 'occupied' | 'vacant';
};

export type MonthlyPaymentsBuildingRecord = {
  id: string;
  name: string;
  location: string;
  unitCount: number;
  units: MonthlyPaymentsUnitRecord[];
};

const MONTHLY_PAYMENTS_DATA_PATH = join(cwd(), 'data', 'monthly-payments-buildings.json');

function normalizeMonthlyPaymentsUnitRecord(
  unit: Partial<MonthlyPaymentsUnitRecord>,
  index: number
): MonthlyPaymentsUnitRecord {
  const roomNumber = Number(unit.id) || index + 1;
  return {
    id: roomNumber,
    label: unit.label?.trim() || `Room ${roomNumber}`,
    price: typeof unit.price === 'string' ? unit.price : '',
    collectedAmount: typeof unit.collectedAmount === 'string' ? unit.collectedAmount : '0',
    reference: typeof unit.reference === 'string' ? unit.reference : '',
    keywords: Array.isArray(unit.keywords)
      ? unit.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
      : [],
    occupancy: unit.occupancy === 'vacant' ? 'vacant' : 'occupied',
  };
}

function normalizeMonthlyPaymentsBuildingRecord(
  building: Partial<MonthlyPaymentsBuildingRecord>
): MonthlyPaymentsBuildingRecord {
  const units = Array.isArray(building.units)
    ? building.units.map((unit, index) => normalizeMonthlyPaymentsUnitRecord(unit, index))
    : [];

  return {
    id: typeof building.id === 'string' ? building.id : '',
    name: typeof building.name === 'string' ? building.name : '',
    location: typeof building.location === 'string' ? building.location : '',
    unitCount: Number(building.unitCount) || units.length,
    units,
  };
}

export function normalizeBuildingName(name: string): string {
  return name.trim().toLowerCase();
}

export function hasDuplicateBuildingName(
  buildings: Array<{ id?: string; name: string }>,
  candidateName: string,
  options?: { excludeId?: string }
): boolean {
  const normalizedCandidate = normalizeBuildingName(candidateName);
  return buildings.some((building) => {
    if (options?.excludeId && 'id' in building && building.id === options.excludeId) {
      return false;
    }
    return normalizeBuildingName(building.name) === normalizedCandidate;
  });
}

export async function readMonthlyPaymentsBuildings(): Promise<MonthlyPaymentsBuildingRecord[]> {
  try {
    const raw = await readFile(MONTHLY_PAYMENTS_DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((building) =>
          normalizeMonthlyPaymentsBuildingRecord(
            building as Partial<MonthlyPaymentsBuildingRecord>
          )
        )
      : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function writeMonthlyPaymentsBuildings(
  buildings: MonthlyPaymentsBuildingRecord[]
): Promise<void> {
  await mkdir(join(cwd(), 'data'), { recursive: true });
  await writeFile(MONTHLY_PAYMENTS_DATA_PATH, JSON.stringify(buildings, null, 2) + '\n', 'utf8');
}
