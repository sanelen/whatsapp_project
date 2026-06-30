import { requireUser } from '@/lib/auth/dal';
import { readRoomManagerView } from '@/lib/monthly-payments';
import { RoomManagerPanel } from '@/components/monthly-payments/room-manager-view';

export default async function MonthlyPaymentsRoomManagerPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ period?: string; unitId?: string }>;
}) {
  await requireUser();
  const [{ propertyId }, { period, unitId }] = await Promise.all([params, searchParams]);
  const view = await readRoomManagerView(propertyId, period);

  return <RoomManagerPanel view={view} initialUnitId={unitId} />;
}
