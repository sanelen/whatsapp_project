import { NextRequest, NextResponse } from 'next/server';
import { ASSISTANT_PROVIDERS } from '@/lib/assistant/model-catalog';
import { requireApiAuth } from '@/lib/auth/api-guard';

// The model picker and runtime use one curated catalog. The route deliberately
// does not accept API keys in query strings and does not need a provider network
// call merely to render settings.
export async function GET(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;

  const providerId = request.nextUrl.searchParams.get('provider') || 'openai';
  const provider = ASSISTANT_PROVIDERS.find((item) => item.value === providerId);
  if (!provider) {
    return NextResponse.json({ models: [], source: 'catalog', error: 'Unsupported assistant provider.' }, { status: 400 });
  }

  return NextResponse.json({
    provider: provider.value,
    models: provider.models.map((model) => ({
      id: model.value,
      name: model.label,
      description: model.description,
      contextWindow: model.contextWindow,
      maxOutput: model.maxOutput,
      inputPricePerM: model.inputPricePerM,
      outputPricePerM: model.outputPricePerM,
      badge: model.badge || null,
    })),
    source: 'catalog',
  });
}
