import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Curated catalog — latest 2-3 major model generations per provider only.
// Prices are USD per 1M tokens. Updated May 2026.
// ---------------------------------------------------------------------------
interface ModelCatalogEntry {
  name: string;
  description: string;
  contextWindow: number;
  maxOutput: number;
  inputPricePerM: number;
  outputPricePerM: number;
  badge?: string; // e.g. "Latest", "Reasoning", "Fast"
}

// Display order within each provider group — defines the picker order.
const PROVIDER_ORDER: Record<string, string[]> = {
  openai: [
    // GPT-5.4 family (full lineup)
    'gpt-5.4',
    'gpt-5.4-mini',
    'gpt-5.4-nano',
    'gpt-5.4-pro',
    // GPT-5.3 family
    'gpt-5.3-codex',
  ],
  deepseek: [
    // DeepSeek chat: latest 2 generations
    'deepseek-v4',
    'deepseek-chat',
  ],
};

const MODEL_CATALOG: Record<string, ModelCatalogEntry> = {
  // ══ OpenAI — GPT-5.4 family (live prices: developers.openai.com/api/docs/pricing) ══
  'gpt-5.4': {
    name: 'GPT-5.4',
    description: 'Affordable flagship for coding and professional work',
    contextWindow: 256000, maxOutput: 32768,
    inputPricePerM: 2.50, outputPricePerM: 15.00,
    badge: 'Latest',
  },
  'gpt-5.4-mini': {
    name: 'GPT-5.4 Mini',
    description: 'Strongest mini model yet — coding, computer use, and subagents',
    contextWindow: 256000, maxOutput: 32768,
    inputPricePerM: 0.75, outputPricePerM: 4.50,
    badge: 'Fast',
  },
  'gpt-5.4-nano': {
    name: 'GPT-5.4 Nano',
    description: 'Smallest and cheapest GPT-5.4 — ultra-low cost at scale',
    contextWindow: 128000, maxOutput: 16384,
    inputPricePerM: 0.20, outputPricePerM: 1.25,
    badge: 'Fast',
  },
  'gpt-5.4-pro': {
    name: 'GPT-5.4 Pro',
    description: 'Maximum capability GPT-5.4 — deep reasoning, complex tasks',
    contextWindow: 256000, maxOutput: 32768,
    inputPricePerM: 30.00, outputPricePerM: 180.00,
    badge: 'Pro',
  },
  // ══ OpenAI — GPT-5.3 family ══════════════════════════════════════════
  'gpt-5.3-codex': {
    name: 'GPT-5.3 Codex',
    description: 'Specialized coding model — optimised for software engineering tasks',
    contextWindow: 256000, maxOutput: 32768,
    inputPricePerM: 1.75, outputPricePerM: 14.00,
    badge: 'Code',
  },
  // ══ DeepSeek ═══════════════════════════════════════════════════════════
  'deepseek-v4': {
    name: 'DeepSeek V4',
    description: 'Latest DeepSeek flagship — improved reasoning and instruction following',
    contextWindow: 128000, maxOutput: 8192,
    inputPricePerM: 0.14, outputPricePerM: 1.40,
    badge: 'Latest',
  },
  'deepseek-chat': {
    name: 'DeepSeek V3',
    description: 'State-of-the-art chat — extremely affordable, strong at coding',
    contextWindow: 64000, maxOutput: 8192,
    inputPricePerM: 0.07, outputPricePerM: 1.10,
    badge: 'DeepSeek V3',
  },
};

// ---------------------------------------------------------------------------
// GET /api/models?provider=openai&apiKey=sk-...&baseUrl=...
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider') ?? 'openai';
  const apiKey =
    searchParams.get('apiKey') ||
    (provider === 'openai' ? process.env.OPENAI_API_KEY : '') ||
    '';
  const baseUrl =
    searchParams.get('baseUrl') ||
    (provider === 'deepseek' ? 'https://api.deepseek.com/v1' : '');

  // Helper: build ordered catalog list for a known provider
  function catalogForProvider(p: string) {
    const order = PROVIDER_ORDER[p] ?? Object.keys(MODEL_CATALOG);
    return order
      .filter((id) => MODEL_CATALOG[id])
      .map((id) => ({ id, ...MODEL_CATALOG[id] }));
  }

  // For known providers with no API key — return catalog immediately (no live fetch needed)
  if (!apiKey && provider !== 'custom') {
    return NextResponse.json({ models: catalogForProvider(provider), source: 'catalog' });
  }

  // Custom with no baseUrl — nothing to fetch
  if (provider === 'custom' && !baseUrl) {
    return NextResponse.json({ models: [], source: 'catalog' });
  }

  const endpoint =
    provider === 'openai'
      ? 'https://api.openai.com/v1/models'
      : provider === 'deepseek'
        ? 'https://api.deepseek.com/v1/models'
        : `${baseUrl}/models`;

  try {
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // Fall back to catalog on auth or network errors for known providers
      if (provider in PROVIDER_ORDER) {
        return NextResponse.json({ models: catalogForProvider(provider), source: 'catalog' });
      }
      const err = await res.text();
      return NextResponse.json({ error: `Provider returned ${res.status}: ${err}` }, { status: 502 });
    }

    const json = await res.json();
    const rawModels: Array<{ id: string; owned_by?: string }> = json.data ?? json.models ?? [];
    const liveIds = new Set(rawModels.map((m) => m.id));

    if (provider in PROVIDER_ORDER) {
      // Known provider: return ordered catalog entries that exist in the live API response.
      // If the live API doesn't have a catalog model (e.g. gpt-5 not yet in account),
      // we still include it so users can manually type/select it.
      const models = catalogForProvider(provider).map((entry) => ({
        ...entry,
        available: liveIds.has(entry.id), // flag if confirmed available
        owned_by: provider,
      }));
      return NextResponse.json({ models, source: 'api' });
    }

    // Custom provider: return everything from the live API
    const models = rawModels
      .map((m) => {
        const catalog = MODEL_CATALOG[m.id];
        return {
          id: m.id,
          name: catalog?.name ?? m.id,
          description: catalog?.description ?? 'No description available',
          contextWindow: catalog?.contextWindow ?? null,
          maxOutput: catalog?.maxOutput ?? null,
          inputPricePerM: catalog?.inputPricePerM ?? null,
          outputPricePerM: catalog?.outputPricePerM ?? null,
          badge: catalog?.badge ?? null,
          available: true,
          owned_by: m.owned_by ?? provider,
        };
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ models, source: 'api' });
  } catch (err) {
    // Network error — fall back to catalog for known providers
    if (provider in PROVIDER_ORDER) {
      return NextResponse.json({ models: catalogForProvider(provider), source: 'catalog' });
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
