import { handleFlowRequest } from '@/lib/waiting-list/endpoint';
import { createSheetsTransport, saveSubmission } from '@/lib/waiting-list/sheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleFlowRequest(request, async (id, input) => saveSubmission(await createSheetsTransport(), id, input));
}
