import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HambaFlowCatalog } from '@/lib/channels/hamba-flow';
import { resolveOpenAiEmbeddingKey, retrieveKnowledge } from '@/lib/kb/vector';
import { loadAssistantRuntimeConfig } from '@/lib/assistant/config';
import { getAssistantModelPricing } from '@/lib/assistant/model-catalog';

export type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PropertyAssistantReply = {
  reply: string;
  propertyId: string;
  provider: string;
  model: string;
  retrieval: 'vector' | 'text' | 'none';
  retrievedCount: number;
  usage?: { promptTokens: number; completionTokens: number };
  estimatedCostUsd?: number;
};

const DEFAULT_SYSTEM_PROMPT = 'You are the Hamba Trading property assistant.';
const DEFAULT_INPUT_PRICE_PER_TOKEN = 2.5 / 1_000_000;
const DEFAULT_OUTPUT_PRICE_PER_TOKEN = 10 / 1_000_000;

function estimateCost(model: string, promptTokens: number, completionTokens: number) {
  const pricing = getAssistantModelPricing(model);
  const inputPrice = pricing ? pricing.input / 1_000_000 : DEFAULT_INPUT_PRICE_PER_TOKEN;
  const outputPrice = pricing ? pricing.output / 1_000_000 : DEFAULT_OUTPUT_PRICE_PER_TOKEN;
  return promptTokens * inputPrice + completionTokens * outputPrice;
}

function catalogContext(catalog: HambaFlowCatalog) {
  return catalog.locations.map((location) => {
    const available = location.units.filter((unit) => unit.isAvailable);
    const details = available.length > 0
      ? available.map((unit) => `${unit.label}: ${unit.summary}`).join('; ')
      : 'No unit is currently marked verified and available.';
    return `- ${location.name} (${location.area || 'area not recorded'}). ${details}`;
  }).join('\n');
}

export async function generatePropertyAssistantReply(input: {
  admin: SupabaseClient;
  messages: AssistantMessage[];
  catalog: HambaFlowCatalog;
  propertyId?: string;
}): Promise<PropertyAssistantReply> {
  const config = await loadAssistantRuntimeConfig(input.admin, input.propertyId);
  const { provider, model, temperature, apiKey } = config;
  if (!apiKey) throw new Error(`No API key is configured for the ${provider} Property Assistant.`);

  const messages = input.messages
    .filter((message) => message.content.trim())
    .slice(-config.retrieval.historyWindow)
    .map((message) => ({ ...message, content: message.content.trim().slice(0, 4000) }));
  const latestUserMessage = messages.findLast((message) => message.role === 'user')?.content;
  if (!latestUserMessage) throw new Error('A user message is required for the Property Assistant.');

  let retrieval: PropertyAssistantReply['retrieval'] = 'none';
  let retrievedCount = 0;
  let knowledgeContext = '';
  try {
    const knowledge = await retrieveKnowledge({
      admin: input.admin,
      apiKey: resolveOpenAiEmbeddingKey(),
      query: latestUserMessage,
      propertyId: config.propertyId,
      matchCount: config.retrieval.topK,
      matchThreshold: config.retrieval.similarityThreshold,
    });
    retrieval = knowledge.retrieval;
    retrievedCount = knowledge.results.length;
    knowledgeContext = knowledge.results
      .map((item) => `[${item.source_name || item.title}]\n${item.content}`)
      .join('\n---\n');
  } catch (error) {
    console.error('[property-assistant] retrieval failed', error instanceof Error ? error.message : error);
  }

  const systemPrompt = [
    config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    'You are replying through WhatsApp as the same configured Property Assistant.',
    'Understand natural wording and minor spelling mistakes. Answer the real question directly and concisely.',
    'Use only the verified catalogue and retrieved knowledge below. Never invent availability, prices, deposits, addresses, viewing times, links, or policy.',
    'If a fact is missing, say it needs staff confirmation. Do not claim an application, payment, lease decision, or viewing is confirmed.',
    'Never ask for a banking PIN, password, or one-time password. Keep the reply under 900 characters and do not use a markdown table.',
    'The commands MENU, HUMAN and STOP are handled outside the model.',
    `\nVERIFIED CATALOGUE\n${catalogContext(input.catalog) || 'No property catalogue entries are configured.'}`,
    knowledgeContext ? `\nRELEVANT KNOWLEDGE\n${knowledgeContext}` : '',
  ].filter(Boolean).join('\n\n');

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model,
      max_tokens: 350,
      temperature: Math.min(1, temperature),
      system: systemPrompt,
      messages,
    });
    const reply = completion.content.find((block) => block.type === 'text')?.text.trim();
    if (!reply) throw new Error('The configured Property Assistant returned an empty reply.');
    const usage = { promptTokens: completion.usage.input_tokens, completionTokens: completion.usage.output_tokens };
    return {
      reply,
      propertyId: config.propertyId,
      provider,
      model,
      retrieval,
      retrievedCount,
      usage,
      estimatedCostUsd: estimateCost(model, usage.promptTokens, usage.completionTokens),
    };
  }

  const clientOptions: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
  if (config.baseUrl) clientOptions.baseURL = config.baseUrl;
  const client = new OpenAI(clientOptions);
  const completion = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature,
    max_completion_tokens: 350,
    ...(model.startsWith('gpt-5.6-') ? { reasoning_effort: 'none' as const } : {}),
  });
  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) throw new Error('The configured Property Assistant returned an empty reply.');
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  return {
    reply,
    propertyId: config.propertyId,
    provider,
    model,
    retrieval,
    retrievedCount,
    usage: completion.usage ? { promptTokens, completionTokens } : undefined,
    estimatedCostUsd: completion.usage ? estimateCost(model, promptTokens, completionTokens) : undefined,
  };
}
