import { ImportConfigurationPanel } from '@/components/monthly-payments/import-configuration-view';
import { requireUser } from '@/lib/auth/dal';
import { readImportConfiguration } from '@/lib/import-configuration';

export default async function MonthlyPaymentsImportConfigurationPage() {
  await requireUser();
  const view = await readImportConfiguration();
  return <ImportConfigurationPanel view={view} />;
}
