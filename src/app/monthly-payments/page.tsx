import { MonthlyPaymentsHub } from '@/components/monthly-payments/monthly-payments-hub';
import { normalizeBuildingName, readMonthlyPaymentsBuildings } from '@/lib/monthly-payments';
import { deleteMonthlyPaymentsBuilding, saveMonthlyPaymentsBuilding } from './actions';

function resolveInitialMessage(status: string | undefined, name: string | undefined): string {
  if (status === 'missing') {
    return 'Add both a building name and a location before saving.';
  }
  if (status === 'not-found') {
    return 'That building could not be found. Refresh and try again.';
  }
  if (status === 'duplicate') {
    return `A building named ${name ?? 'that'} already exists. Use a different building name.`;
  }
  if (status === 'updated') {
    return `${name ?? 'Building'} has been updated successfully.`;
  }
  if (status === 'deleted') {
    return `${name ?? 'Building'} has been removed successfully.`;
  }
  if (status === 'saved') {
    return `${name ?? 'Building'} has been added successfully.`;
  }
  return 'Configure the building, then save it into the monthly payments hub.';
}

export default async function MonthlyPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; name?: string }>;
}) {
  const [buildings, params] = await Promise.all([
    readMonthlyPaymentsBuildings(),
    searchParams,
  ]);
  const initialBuilding =
    params.name && (params.status === 'saved' || params.status === 'updated')
      ? buildings.find(
          (building) => normalizeBuildingName(building.name) === normalizeBuildingName(params.name!)
        )
      : undefined;

  return (
    <MonthlyPaymentsHub
      buildings={buildings}
      initialBuilding={initialBuilding}
      initialMessage={resolveInitialMessage(params.status, params.name)}
      deleteBuildingAction={deleteMonthlyPaymentsBuilding}
      saveBuildingAction={saveMonthlyPaymentsBuilding}
    />
  );
}
