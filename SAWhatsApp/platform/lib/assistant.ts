import type { AssistantSettings, Conversation, KnowledgeBase, Message } from '@/lib/types';

interface BuildReplyInput {
  inboundText: string;
  customer?: { name?: string } | null;
  knowledgeEntries: KnowledgeBase[];
  recentMessages: Message[];
  settings?: AssistantSettings;
}

interface DecideAssistantResponseInput extends BuildReplyInput {
  conversation: Conversation;
  now?: Date;
}

export interface AssistantDecision {
  shouldReply: boolean;
  reason: 'auto_reply_disabled' | 'bot_paused' | 'handoff_active' | 'human_recently_active' | 'tenant_requested_handoff' | 'reply';
  replyText?: string;
  handoffReason?: string;
}

export const DEFAULT_ASSISTANT_SETTINGS: Omit<AssistantSettings, 'id' | 'created_at' | 'updated_at'> = {
  name: 'default',
  auto_reply_enabled: true,
  greeting_enabled: true,
  handoff_pause_minutes: 30,
  greeting_text:
    'Hi, thanks for contacting Hamba Trading. Please send your name, property or unit, what you need help with, and whether it is urgent.',
  intake_prompt:
    'To help quickly, please include your full name, property or unit, the issue or request, and the best number to reach you on.',
  fallback_response_text:
    'Thanks, I received your message. A team member will follow up shortly.',
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function scoreKnowledgeEntry(entry: KnowledgeBase, tokens: string[]): number {
  const haystack = `${entry.title} ${entry.content} ${(entry.tags || []).join(' ')}`.toLowerCase();
  let score = 0;

  tokens.forEach((token) => {
    if (haystack.includes(token)) score += 1;
  });

  return score;
}

function compactText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3).trim()}...`;
}

function isFutureTimestamp(value?: string | null, now = new Date()): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

function minutesSince(value?: string | null, now = new Date()): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.floor((now.getTime() - timestamp) / 60000);
}

export function isGreeting(text: string): boolean {
  return /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howzit|sawubona|sanibonani|dumela)\b[\s!.?]*$/i.test(
    text.trim()
  );
}

export function isHandoffRequest(text: string): boolean {
  return /\b(human|person|agent|consultant|call me|phone me|stop bot|not a bot|real person|speak to someone)\b/i.test(
    text
  );
}

/** Try to generate a reply using the OpenAI API. Returns null on failure or if no key is set. */
async function buildAIGroundedReply(input: BuildReplyInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const { inboundText, customer, knowledgeEntries, recentMessages } = input;
  const customerName = customer?.name?.trim() || '';

  // Build KB context (cap at 10 entries to stay within token budget)
  const kbContext =
    knowledgeEntries.length > 0
      ? 'Relevant business information:\n' +
        knowledgeEntries
          .slice(0, 10)
          .map((e) => `[${e.category}] ${e.title}: ${e.content}`)
          .join('\n')
      : '';

  // Build conversation history (oldest-first, last 6 turns)
  const history = [...recentMessages]
    .reverse()
    .slice(-6)
    .map((m) => ({
      role: m.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

  const systemPrompt = [
    'You are a helpful WhatsApp support assistant. Reply concisely — keep responses under 300 characters.',
    'Be warm, professional, and to the point. If you cannot fully resolve the query, tell the customer a team member will follow up shortly.',
    customerName ? `The customer's name is ${customerName}.` : '',
    kbContext,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 120,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: inboundText },
        ],
      }),
    });

    if (!res.ok) {
      console.error('OpenAI request failed:', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('OpenAI call error:', err);
    return null;
  }
}

/** Keyword-matching fallback used when no AI key is configured or the AI call fails. */
function buildKeywordReply(input: BuildReplyInput): string {
  const { inboundText, customer, knowledgeEntries, recentMessages, settings } = input;
  const tokens = tokenize(inboundText);

  const ranked = knowledgeEntries
    .map((entry) => ({ entry, score: scoreKnowledgeEntry(entry, tokens) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked.find((row) => row.score > 0)?.entry;
  const customerName = customer?.name?.trim() || 'there';

  if (best) {
    const answer = compactText(best.content.replace(/\s+/g, ' ').trim(), 340);
    return `Hi ${customerName}, thanks for your message. Based on our information: ${answer}`;
  }

  const lastInbound = recentMessages.find((m) => m.direction === 'inbound')?.content || inboundText;
  const shortInbound = compactText(lastInbound.replace(/\s+/g, ' ').trim(), 120);

  const fallback = settings?.fallback_response_text || DEFAULT_ASSISTANT_SETTINGS.fallback_response_text;
  return `Hi ${customerName}, ${fallback} I got your message: "${shortInbound}".`;
}

export async function buildGroundedReply(input: BuildReplyInput): Promise<string> {
  const aiReply = await buildAIGroundedReply(input);
  if (aiReply) return aiReply;
  return buildKeywordReply(input);
}

export function buildGreetingReply(settings?: AssistantSettings): string {
  const config = settings || (DEFAULT_ASSISTANT_SETTINGS as AssistantSettings);
  return `${config.greeting_text}\n\n${config.intake_prompt}`;
}

export async function decideAssistantResponse(input: DecideAssistantResponseInput): Promise<AssistantDecision> {
  const { conversation, inboundText, recentMessages, settings, now = new Date() } = input;
  const config = settings || (DEFAULT_ASSISTANT_SETTINGS as AssistantSettings);

  if (!config.auto_reply_enabled) {
    return { shouldReply: false, reason: 'auto_reply_disabled' };
  }

  if (conversation.bot_paused) {
    return { shouldReply: false, reason: 'bot_paused' };
  }

  if (isFutureTimestamp(conversation.handoff_until, now)) {
    return { shouldReply: false, reason: 'handoff_active' };
  }

  const humanMinutesAgo = minutesSince(conversation.last_human_message_at, now);
  if (humanMinutesAgo !== null && humanMinutesAgo >= 0 && humanMinutesAgo < config.handoff_pause_minutes) {
    return { shouldReply: false, reason: 'human_recently_active' };
  }

  if (isHandoffRequest(inboundText)) {
    return {
      shouldReply: false,
      reason: 'tenant_requested_handoff',
      handoffReason: 'Tenant requested a human response',
    };
  }

  const hasOutbound = recentMessages.some((message) => message.direction === 'outbound');
  if (config.greeting_enabled && (!conversation.first_response_sent_at || !hasOutbound || isGreeting(inboundText))) {
    return {
      shouldReply: true,
      reason: 'reply',
      replyText: buildGreetingReply(config as AssistantSettings),
    };
  }

  return {
    shouldReply: true,
    reason: 'reply',
    replyText: await buildGroundedReply(input),
  };
}
