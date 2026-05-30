import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireApiAuth } from '@/lib/auth/api-guard';

type MessageUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens?: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  usage?: MessageUsage;
  cost?: number;
};

type Thread = {
  id: string;
  name: string;
  createdAt: number;
  systemPrompt: string;
  messages: ChatMessage[];
};

type HistoryFile = {
  threads: Thread[];
};

const HISTORY_FILE = path.join(process.cwd(), 'data', 'chat-history.json');

function ensureDir() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readHistory(): Thread[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];

    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;

    if (
      parsed &&
      typeof parsed === 'object' &&
      'threads' in parsed &&
      Array.isArray((parsed as HistoryFile).threads)
    ) {
      return (parsed as HistoryFile).threads;
    }

    return [];
  } catch {
    return [];
  }
}

function writeHistory(threads: Thread[]) {
  ensureDir();
  const payload: HistoryFile = { threads };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2), 'utf-8');
}

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  return NextResponse.json({ threads: readHistory() });
}

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { threads?: Thread[] };
    const threads = Array.isArray(body?.threads) ? body.threads : [];
    writeHistory(threads);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save history' }, { status: 500 });
  }
}

export async function DELETE() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    writeHistory([]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 });
  }
}
