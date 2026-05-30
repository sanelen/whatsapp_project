import { WorkspaceRoute } from '@/components/workspace/workspace-route';

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  return <WorkspaceRoute view="organization" organizationId={organizationId} />;
}
