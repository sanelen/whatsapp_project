'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/dal';
import {
  hasDuplicateBuildingName,
  readMonthlyPaymentsBuildings,
  writeMonthlyPaymentsBuildings,
  type MonthlyPaymentsBuildingRecord,
  type MonthlyPaymentsUnitRecord,
} from '@/lib/monthly-payments';

function parseKeywords(value: string): string[] {
  return value
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function redirectWithStatus(
  status: 'saved' | 'updated' | 'deleted' | 'duplicate' | 'missing' | 'not-found',
  name = ''
): never {
  const params = new URLSearchParams({ status });
  if (name) {
    params.set('name', name);
  }
  redirect(`/monthly-payments?${params.toString()}`);
}

export async function saveMonthlyPaymentsBuilding(formData: FormData): Promise<void> {
  await requireUser();

  const buildingId = String(formData.get('buildingId') ?? '').trim();
  const buildingName = String(formData.get('buildingName') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();
  const unitCount = Math.min(
    10,
    Math.max(1, Number.parseInt(String(formData.get('unitCount') ?? '1'), 10) || 1)
  );

  if (!buildingName || !location) {
    redirectWithStatus('missing');
  }

  const buildings = await readMonthlyPaymentsBuildings();
  const existingBuilding = buildingId
    ? buildings.find((building) => building.id === buildingId)
    : undefined;

  if (buildingId && !existingBuilding) {
    redirectWithStatus('not-found');
  }

  if (hasDuplicateBuildingName(buildings, buildingName, { excludeId: buildingId || undefined })) {
    redirectWithStatus('duplicate', buildingName);
  }

  const units: MonthlyPaymentsUnitRecord[] = Array.from({ length: unitCount }, (_, index) => {
    const roomNumber = index + 1;
    const existingUnit = existingBuilding?.units.find((unit) => unit.id === roomNumber);
    return {
      id: roomNumber,
      label: `Room ${roomNumber}`,
      price: String(formData.get(`unitPrice-${roomNumber}`) ?? '').trim(),
      collectedAmount: existingUnit?.collectedAmount ?? '0',
      reference: String(formData.get(`unitReference-${roomNumber}`) ?? '').trim(),
      keywords: parseKeywords(String(formData.get(`unitKeywords-${roomNumber}`) ?? '')),
      occupancy:
        String(formData.get(`unitOccupancy-${roomNumber}`) ?? 'occupied') === 'vacant'
          ? 'vacant'
          : 'occupied',
    };
  });

  const nextBuilding: MonthlyPaymentsBuildingRecord = {
    id: existingBuilding?.id ?? `${buildingName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name: buildingName,
    location,
    unitCount,
    units,
  };

  if (existingBuilding) {
    await writeMonthlyPaymentsBuildings(
      buildings.map((building) => (building.id === existingBuilding.id ? nextBuilding : building))
    );
    redirectWithStatus('updated', buildingName);
  }

  await writeMonthlyPaymentsBuildings([nextBuilding, ...buildings]);
  redirectWithStatus('saved', buildingName);
}

export async function deleteMonthlyPaymentsBuilding(formData: FormData): Promise<void> {
  await requireUser();

  const buildingId = String(formData.get('buildingId') ?? '').trim();
  if (!buildingId) {
    redirectWithStatus('not-found');
  }

  const buildings = await readMonthlyPaymentsBuildings();
  const buildingToDelete = buildings.find((building) => building.id === buildingId);

  if (!buildingToDelete) {
    redirectWithStatus('not-found');
  }

  await writeMonthlyPaymentsBuildings(
    buildings.filter((building) => building.id !== buildingToDelete.id)
  );
  redirectWithStatus('deleted', buildingToDelete.name);
}
