import { requireUser } from '@/lib/auth/dal';
import { readPropertyUnitsTable } from '@/lib/monthly-payments';
import { UnitsTable } from '@/components/monthly-payments/units-table';

export default async function PropertyUnitsPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ period?: string; unitId?: string }>;
}) {
  await requireUser();
  const { propertyId } = await params;
  const { period, unitId } = await searchParams;
  const table = await readPropertyUnitsTable(propertyId, period);
  return <UnitsTable table={table} initialUnitId={unitId} />;
}
