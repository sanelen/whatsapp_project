import { WorkspaceRoute } from '@/components/workspace/workspace-route';

export default async function PropertyChatbotPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return <WorkspaceRoute view="chatbot" propertyId={propertyId} />;
}
