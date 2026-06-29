import { requireUser } from '@/lib/auth/dal';
import { readMonthlyPaymentsDashboard } from '@/lib/monthly-payments';
import { MonthlyPaymentsHub } from '@/components/monthly-payments/monthly-payments-hub';

export default async function MonthlyPaymentsPage() {
  await requireUser();
  const dashboard = await readMonthlyPaymentsDashboard();

  return <MonthlyPaymentsHub dashboard={dashboard} />;
}
