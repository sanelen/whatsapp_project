import { requireUser } from '@/lib/auth/dal';
import { readReferencePoolView } from '@/lib/monthly-payments';
import { ReferencePoolViewPanel } from '@/components/monthly-payments/reference-pool-view';

export default async function MonthlyPaymentsReferencePoolPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireUser();
  const { period } = await searchParams;
  const view = await readReferencePoolView(period);

  return <ReferencePoolViewPanel view={view} />;
}
