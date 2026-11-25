import { requireUser } from '@/lib/auth/dal';
import { readMonthlyPaymentsDashboard } from '@/lib/monthly-payments';
import { RentCollectionsDashboard } from '@/components/monthly-payments/rent-collections-dashboard';
import { managementAlertConfig } from '@/lib/rent-management-alerts';

export default async function RentCollectionsPage({ searchParams }: { searchParams: Promise<{ period?: string; building?: string; filter?: string }> }) {
  await requireUser();
  const params = await searchParams;
  const dashboard = await readMonthlyPaymentsDashboard();
  const manager = managementAlertConfig(process.env);
  return <RentCollectionsDashboard dashboard={dashboard} initialPeriod={params.period} initialBuilding={params.building} initialFilter={params.filter} managerRecipientSuffix={manager?.recipient.slice(-4)} />;
}
