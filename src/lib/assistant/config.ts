import type { SupabaseClient } from '@supabase/supabase-js';
import { getPromptSettings } from '@/lib/supabase';
import { DEFAULT_ASSISTANT_MODEL, DEFAULT_ASSISTANT_PROVIDER } from '@/lib/assistant/model-catalog';
import { resolveAssistantGreeting } from '@/lib/assistant/defaults';

type PropertyAssistantSettingsRow = {
  property_id: string;
  provider: string | null;
  model: string | null;
  temperature: number | string | null;
  system_prompt: string | null;
  whatsapp_templates: string[] | null;
  retrieval_top_k: number | string | null;
  retrieval_similarity_threshold: number | string | null;
  retrieval_memory_mode: 'hybrid' | 'rolling_window' | 'summary_memory' | 'retrieval_only' | null;
  retrieval_history_window: number | string | null;
};

export type AssistantRuntimeConfig = {
  propertyId: string;
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  greeting: string;
  retrieval: {
    topK: number;
    similarityThreshold: number;
    memoryMode: 'hybrid' | 'rolling_window' | 'summary_memory' | 'retrieval_only';
    historyWindow: number;
  };
  apiKey: string;
  baseUrl: string;
};

function resolveApiKey(provider: string, storedProvider: string, storedKey: string) {
  if (provider === storedProvider && storedKey) return storedKey;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? '';
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY ?? '';
  return process.env.OPENAI_API_KEY ?? '';
}

export async function loadAssistantRuntimeConfig(admin: SupabaseClient, propertyId?: string): Promise<AssistantRuntimeConfig> {
  const query = () => admin
    .from('property_chatbot_settings')
    .select('property_id,provider,model,temperature,system_prompt,whatsapp_templates,retrieval_top_k,retrieval_similarity_threshold,retrieval_memory_mode,retrieval_history_window');
  const preferred = propertyId
    ? await query().eq('property_id', propertyId).maybeSingle()
    : { data: null, error: null };
  if (preferred.error) throw new Error(`Assistant configuration load failed: ${preferred.error.message}`);

  const fallback = preferred.data
    ? { data: preferred.data, error: null }
    : await query().order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (fallback.error) throw new Error(`Assistant configuration load failed: ${fallback.error.message}`);
  if (!fallback.data) throw new Error('No configured Property Assistant was found.');

  const property = fallback.data as PropertyAssistantSettingsRow;
  const credentials = await getPromptSettings();
  const provider = property.provider || credentials.llm_provider || DEFAULT_ASSISTANT_PROVIDER;
  const model = property.model || credentials.llm_model || DEFAULT_ASSISTANT_MODEL;
  const apiKey = resolveApiKey(provider, credentials.llm_provider, credentials.llm_api_key || '');
  let baseUrl = provider === credentials.llm_provider ? credentials.llm_base_url || '' : '';
  if (provider === 'deepseek' && !baseUrl) baseUrl = 'https://api.deepseek.com/v1';

  return {
    propertyId: property.property_id,
    provider,
    model,
    temperature: Number(property.temperature ?? credentials.temperature ?? 0.4),
    systemPrompt: property.system_prompt?.trim() || credentials.system_prompt?.trim() || 'You are the Hamba Trading property assistant.',
    greeting: resolveAssistantGreeting(property.whatsapp_templates),
    retrieval: {
      topK: Math.max(1, Number(property.retrieval_top_k ?? 5)),
      similarityThreshold: Number(property.retrieval_similarity_threshold ?? 0.2),
      memoryMode: property.retrieval_memory_mode || 'hybrid',
      historyWindow: Math.max(1, Number(property.retrieval_history_window ?? 20)),
    },
    apiKey,
    baseUrl,
  };
}
