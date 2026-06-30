import { requireUser } from '@/lib/auth/dal';
import { readMonthlyPaymentsLocations } from '@/lib/monthly-payments';
import { LocationsAdmin } from '@/components/monthly-payments/locations-admin';

export default async function MonthlyPaymentsLocationsPage() {
  await requireUser();
  const view = await readMonthlyPaymentsLocations();

  return <LocationsAdmin view={view} />;
}
