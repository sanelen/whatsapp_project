import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HambaFlowCatalog } from '@/lib/channels/hamba-flow';
import { resolveOpenAiEmbeddingKey, retrieveKnowledge } from '@/lib/kb/vector';
import { loadAssistantRuntimeConfig } from '@/lib/assistant/config';
import { getAssistantModelPricing } from '@/lib/assistant/model-catalog';
import { propertyMarketingContext } from '@/lib/channels/hamba-property-marketing';
import {
  buildAuthoritativePropertyContext,
  isApprovedDescriptiveKnowledge,
} from '@/lib/property-content';
import { loadPropertyContentSnapshot } from '@/lib/property-content-repository';

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
    const details = location.units.length > 0
      ? location.units.map((unit) => `${unit.label}: ${unit.summary}`).join('; ')
      : 'No unit-level marketing details are recorded.';
    return `- ${location.name} (${location.area || 'area not recorded'}). ${details}`;
  }).join('\n');
}

export function validateProspectAssistantReply(reply: string) {
  const content = reply.trim();
  if (!content) throw new Error('The configured Property Assistant returned an empty reply.');
  if (content.length > 600) throw new Error('The Property Assistant reply exceeded the concise WhatsApp prospect limit.');
  if (/(which unit or room are you in|what do you need help with|maintenance or repairs|payment or statement|lease or notice)/i.test(content)) {
    throw new Error('The Property Assistant attempted to enter an existing-tenant workflow.');
  }
  if (/(send|upload|attach).{0,30}\b(id|identity document|payslip|bank statement)\b/i.test(content)) {
    throw new Error('The Property Assistant attempted to collect documents.');
  }
  if (/\b(?:is|are)\s+(?:currently\s+)?(?:available|vacant)\b/i.test(content)) {
    throw new Error('The Property Assistant stated live availability without staff confirmation.');
  }
  if (/\b(availability|available|vacant|vacancy)\b/i.test(content) && !/\b(staff|team|person)\b.{0,60}\b(confirm|check|verify)/i.test(content)) {
    throw new Error('The Property Assistant mentioned availability without a staff-confirmation guardrail.');
  }
  if (/\bR\s?\d[\d ,.]*\b/i.test(content) && !/\b(staff|team|person)\b.{0,80}\b(confirm|check|verify)/i.test(content)) {
    throw new Error('The Property Assistant mentioned a price without a staff-confirmation guardrail.');
  }
  if (/\bdeposit\b/i.test(content) && !/\b(staff|team|person)\b.{0,80}\b(confirm|check|verify)/i.test(content)) {
    throw new Error('The Property Assistant mentioned a deposit without a staff-confirmation guardrail.');
  }
  if (/\b(viewing|appointment)\b.{0,50}\b(confirmed|booked|scheduled)\b/i.test(content)) {
    throw new Error('The Property Assistant claimed a viewing was confirmed.');
  }
  return content;
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
  let authoritativeContext = '';
  try {
    const structured = await loadPropertyContentSnapshot(input.admin, config.propertyId);
    authoritativeContext = buildAuthoritativePropertyContext(structured);
  } catch (error) {
    console.error('[property-assistant] structured property content failed', error instanceof Error ? error.message : error);
  }
  try {
    const knowledge = await retrieveKnowledge({
      admin: input.admin,
      apiKey: resolveOpenAiEmbeddingKey(),
      query: latestUserMessage,
      propertyId: config.propertyId,
      matchCount: config.retrieval.topK,
      matchThreshold: config.retrieval.similarityThreshold,
    });
    const approvedResults = knowledge.results.filter((item) => {
      if (!isApprovedDescriptiveKnowledge(item)) return false;
      return item.metadata?.propertyId === config.propertyId;
    });
    retrieval = approvedResults.length ? knowledge.retrieval : 'none';
    retrievedCount = approvedResults.length;
    knowledgeContext = approvedResults
      .map((item) => `[${item.source_name || item.title}]\n${item.content}`)
      .join('\n---\n');
  } catch (error) {
    console.error('[property-assistant] retrieval failed', error instanceof Error ? error.message : error);
  }

  const systemPrompt = [
    config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    'You are replying through WhatsApp as the same configured Property Assistant.',
    'Your customer persona is a prospective renter. The deterministic application handles journey state; you only answer a property question conversationally inside that prospect journey.',
    'Lead with the useful verified property information or marketing link, not with internal data caveats.',
    'Answer only what the customer asked. Prefer two to five short sentences and one clear next step. Do not repeat the full property portfolio, an unrelated feature list, or every available link.',
    'When a property is selected, stay focused on that property. The application—not you—will show the customer the next guided buttons.',
    'Use the AUTHORITATIVE STRUCTURED FACTS for all decision-critical answers. Those structured facts override the verified catalogue and descriptive/vector knowledge.',
    'Use only the authoritative structured facts, verified catalogue, approved property links, and approved descriptive knowledge below. Never invent availability, prices, deposits, addresses, viewing times, links, or policy.',
    'Hamba staff must check and confirm all live availability. Never state that a room is available or vacant.',
    'Treat recorded prices and deposits as guidance only and say staff will confirm final terms. Never say a viewing is booked or confirmed.',
    'Do not start or describe maintenance, payments, lease, access, existing-tenant, offboarding, document upload, ID or payslip workflows. Those are handled by staff outside this assistant.',
    'If a verified property fact is missing, say Hamba staff will confirm it. Do not claim an application, payment, lease decision, reservation, or viewing is confirmed.',
    'Never ask for a banking PIN, password, one-time password, ID, payslip or bank statement. Keep the reply under 600 characters and do not use a markdown table or numbered service menu.',
    'The commands MENU, HUMAN and STOP are handled outside the model.',
    `\nAPPROVED PROPERTY MARKETING\n${propertyMarketingContext()}`,
    authoritativeContext ? `\nAUTHORITATIVE STRUCTURED FACTS\n${authoritativeContext}` : '',
    `\nVERIFIED CATALOGUE\n${catalogContext(input.catalog) || 'No property catalogue entries are configured.'}`,
    knowledgeContext ? `\nAPPROVED DESCRIPTIVE KNOWLEDGE\n${knowledgeContext}` : '',
  ].filter(Boolean).join('\n\n');

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const completion = await client.messages.create({
      model,
      max_tokens: 180,
      temperature: Math.min(1, temperature),
      system: systemPrompt,
      messages,
    });
    const reply = validateProspectAssistantReply(completion.content.find((block) => block.type === 'text')?.text ?? '');
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
    max_completion_tokens: 180,
    ...(model.startsWith('gpt-5.6-') ? { reasoning_effort: 'none' as const } : {}),
  });
  const reply = validateProspectAssistantReply(completion.choices[0]?.message?.content ?? '');
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
