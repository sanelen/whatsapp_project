import { WorkspaceRoute } from '@/components/workspace/workspace-route';

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return <WorkspaceRoute view="property" propertyId={propertyId} />;
}
