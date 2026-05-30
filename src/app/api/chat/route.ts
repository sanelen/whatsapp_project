import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getPromptSettings } from '@/lib/supabase';
import { requireApiAuth } from '@/lib/auth/api-guard';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequest = {
  messages?: ChatMessage[];
  stream?: boolean;
  systemPrompt?: string;
};

type UsageShape = {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
  };
};

// Default pricing (OpenAI gpt-4o) — used as fallback
const PRICE_IN = 2.5 / 1_000_000;
const PRICE_IN_CACHED = 0.25 / 1_000_000;
const PRICE_OUT = 10 / 1_000_000;
const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant for a simple hello-world chatbot app.';

function calculateCost(usage: UsageShape): number {
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  const uncached = Math.max(0, usage.prompt_tokens - cached);
  return uncached * PRICE_IN + cached * PRICE_IN_CACHED + usage.completion_tokens * PRICE_OUT;
}

/** Resolve which API key to use: DB setting takes priority, then env var fallback */
function resolveApiKey(provider: string, dbKey: string): string {
  if (dbKey) return dbKey;
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY ?? '';
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY ?? '';
  return process.env.OPENAI_API_KEY ?? '';
}

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = (await request.json()) as ChatRequest;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    // Load persisted settings from DB directly (avoids an internal HTTP round-trip)
    const settings = await getPromptSettings();
    const dbSystemPrompt = settings.system_prompt || DEFAULT_SYSTEM_PROMPT;
    const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.4;
    const llmProvider = settings.llm_provider || 'openai';
    const llmModel = settings.llm_model || 'gpt-4o';
    const llmApiKey = settings.llm_api_key || '';
    let llmBaseUrl = settings.llm_base_url || '';

    const resolvedApiKey = resolveApiKey(llmProvider, llmApiKey);
    // Default base URLs for known providers when not explicitly set
    if (llmProvider === 'deepseek' && !llmBaseUrl) llmBaseUrl = 'https://api.deepseek.com/v1';

    if (!resolvedApiKey) {
      return NextResponse.json(
        { error: `No API key configured for provider "${llmProvider}". Set it in LLM Settings or in your .env.local file.` },
        { status: 500 }
      );
    }

    // Per-thread system prompt takes priority over DB global
    const systemPrompt =
      typeof body.systemPrompt === 'string' && body.systemPrompt.trim().length > 0
        ? body.systemPrompt.trim().slice(0, 6000)
        : dbSystemPrompt;

    const filtered = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.trim() }))
      .filter((m) => m.content.length > 0)
      .slice(-20);

    if (filtered.length === 0) {
      return NextResponse.json(
        { error: 'At least one chat message is required' },
        { status: 400 }
      );
    }

    // Fetch relevant KB entries
    let kbContext = '';
    const lastUserMessage = filtered.findLast((m) => m.role === 'user')?.content || '';
    if (lastUserMessage) {
      try {
        const kbRes = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/kb/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: lastUserMessage }),
        });
        if (kbRes.ok) {
          const kbData = await kbRes.json() as {
            retrieval?: 'vector' | 'text';
            data?: Array<{
              category: string;
              title: string;
              content: string;
              source_type?: string;
              source_name?: string;
              similarity?: number;
            }>;
          };
          if (Array.isArray(kbData.data) && kbData.data.length > 0) {
            const retrievalLabel = kbData.retrieval === 'vector' ? 'Vector-retrieved' : 'Text-matched';
            kbContext = `\n\n--- Relevant Knowledge Base (${retrievalLabel}) ---\n` +
              kbData.data.map((kb) => {
                const source = kb.source_name || kb.category;
                const score = typeof kb.similarity === 'number' ? ` score=${kb.similarity.toFixed(3)}` : '';
                return `[${source}] ${kb.title}${score}\n${kb.content}`;
              }).join('\n---\n');
          }
        }
      } catch (err) {
        console.error('KB search failed:', err);
      }
    }

    const composedSystemPrompt = systemPrompt === DEFAULT_SYSTEM_PROMPT
      ? `${DEFAULT_SYSTEM_PROMPT}${kbContext}`
      : ['Follow these instructions with highest priority unless they request unsafe content:', systemPrompt, kbContext].join('\n\n');

    // ── ANTHROPIC ────────────────────────────────────────────────────────────
    if (llmProvider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey: resolvedApiKey });

      if (body.stream) {
        const encoder = new TextEncoder();
        const anthropicMessages = filtered.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

        const stream = await anthropic.messages.create({
          model: llmModel,
          max_tokens: 4096,
          temperature: Math.min(1, temperature), // Anthropic clamps at 1
          system: composedSystemPrompt,
          messages: anthropicMessages,
          stream: true,
        });

        let inputTokens = 0;
        let outputTokens = 0;
        const readable = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const chunk of stream) {
                if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'delta', delta: chunk.delta.text })}\n\n`)
                  );
                }
                if (chunk.type === 'message_start') {
                  inputTokens = chunk.message.usage.input_tokens;
                }
                if (chunk.type === 'message_delta') {
                  outputTokens = chunk.usage.output_tokens;
                }
                if (chunk.type === 'message_stop') {
                  const usage = { prompt_tokens: inputTokens, completion_tokens: outputTokens };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'usage', usage, cost: calculateCost(usage) })}\n\n`)
                  );
                }
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
              controller.close();
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Streaming failed';
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`));
              controller.close();
            }
          },
        });

        return new Response(readable, {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
        });
      }

      // Non-streaming Anthropic
      const completion = await anthropic.messages.create({
        model: llmModel,
        max_tokens: 4096,
        temperature: Math.min(1, temperature),
        system: composedSystemPrompt,
        messages: filtered.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      });
      const reply = completion.content[0]?.type === 'text' ? completion.content[0].text : 'No response.';
      const usage = { prompt_tokens: completion.usage.input_tokens, completion_tokens: completion.usage.output_tokens };
      return NextResponse.json({ reply, usage, cost: calculateCost(usage) });
    }

    // ── OPENAI-COMPATIBLE (OpenAI, Groq, Mistral, Together, custom) ──────────
    const openaiClientOptions: ConstructorParameters<typeof OpenAI>[0] = { apiKey: resolvedApiKey };
    if (llmBaseUrl) openaiClientOptions.baseURL = llmBaseUrl;
    const openai = new OpenAI(openaiClientOptions);

    if (body.stream) {
      const encoder = new TextEncoder();
      const completionStream = await openai.chat.completions.create({
        model: llmModel,
        messages: [{ role: 'system', content: composedSystemPrompt }, ...filtered],
        temperature,
        stream: true,
        stream_options: { include_usage: true },
      });

      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of completionStream) {
              const delta = chunk.choices[0]?.delta?.content ?? '';
              if (delta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', delta })}\n\n`));
              }
              if (chunk.usage) {
                const usage = chunk.usage as UsageShape;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'usage',
                  usage: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 },
                  cost: calculateCost(usage),
                })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
            controller.close();
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Streaming failed';
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
      });
    }

    const completion = await openai.chat.completions.create({
      model: llmModel,
      messages: [{ role: 'system', content: composedSystemPrompt }, ...filtered],
      temperature,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || 'Sorry, I could not generate a response.';
    const usage = completion.usage as UsageShape | undefined;
    const normalizedUsage = usage ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 } : undefined;

    return NextResponse.json({ reply, usage: normalizedUsage, cost: usage ? calculateCost(usage) : undefined });
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;

    const rawMessage = error instanceof Error ? error.message : 'Unknown error';

    if (status === 429) {
      return NextResponse.json(
        {
          error:
            'OpenAI quota exceeded for this API key. Add billing/credits in OpenAI, or switch to a key with available quota.',
        },
        { status: 429 }
      );
    }

    if (status === 401) {
      return NextResponse.json(
        { error: 'OpenAI API key is invalid or unauthorized. Update OPENAI_API_KEY and restart the app.' },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: rawMessage }, { status: 500 });
  }
}
