import { requireUser } from '@/lib/auth/dal';
import { readImportAuditView } from '@/lib/import-audit';
import { ImportAuditViewPanel } from '@/components/monthly-payments/import-audit-view';

export default async function MonthlyPaymentsImportAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; source?: string }>;
}) {
  await requireUser();
  const { period, source } = await searchParams;
  const view = await readImportAuditView({ periodKey: period, source });
  return <ImportAuditViewPanel view={view} />;
}
