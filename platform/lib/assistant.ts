import type { KnowledgeBase, Message } from '@/lib/types';

interface BuildReplyInput {
  inboundText: string;
  customer?: { name?: string } | null;
  knowledgeEntries: KnowledgeBase[];
  recentMessages: Message[];
}

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

export function buildGroundedReply(input: BuildReplyInput): string {
  const { inboundText, customer, knowledgeEntries, recentMessages } = input;
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

  return `Hi ${customerName}, thanks for reaching out. I got your message: "${shortInbound}". A team member will follow up shortly while we improve our AI knowledge responses.`;
}
