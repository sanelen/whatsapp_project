'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
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

type KbFile = { id: string; name: string; size: string };

type KnowledgeBase = {
  id: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ModelInfo = {
  id: string;
  name: string;
  description: string;
  contextWindow: number | null;
  maxOutput: number | null;
  inputPricePerM: number | null;
  outputPricePerM: number | null;
  badge?: string | null;
  available?: boolean;
  owned_by?: string;
};

// ── Pricing ─────────────────────────────────────────────────────────────────────
// Per-model pricing table ($/1M tokens). Source: developers.openai.com/api/docs/pricing
const MODEL_PRICING: Record<string, { in: number; inCached: number; out: number }> = {
  // GPT-5.4 family
  'gpt-5.4':        { in:  2.50, inCached: 0.250, out:  15.00 },
  'gpt-5.4-mini':   { in:  0.75, inCached: 0.075, out:   4.50 },
  'gpt-5.4-nano':   { in:  0.20, inCached: 0.020, out:   1.25 },
  'gpt-5.4-pro':    { in: 30.00, inCached: 0.000, out: 180.00 },
  // GPT-5.3 family
  'gpt-5.3-codex':  { in:  1.75, inCached: 0.175, out:  14.00 },
  // DeepSeek
  'deepseek-v4':    { in:  0.14, inCached: 0.010, out:   1.40 },
  'deepseek-chat':  { in:  0.07, inCached: 0.010, out:   1.10 },
};
const DEFAULT_PRICING = { in: 2.50, inCached: 0.250, out: 15.00 }; // gpt-5.4 fallback

function calcCost(u: MessageUsage, modelId?: string): number {
  const p = (modelId && MODEL_PRICING[modelId]) ? MODEL_PRICING[modelId] : DEFAULT_PRICING;
  const cached = u.cached_tokens ?? 0;
  const uncached = Math.max(0, u.prompt_tokens - cached);
  return (uncached * p.in + cached * p.inCached + u.completion_tokens * p.out) / 1_000_000;
}

function fmtCost(usd: number): string {
  if (usd < 0.0000005) return '$0.000000';
  if (usd < 0.000001)  return '<$0.000001';
  return `$${usd.toFixed(6)}`;
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function newThread(): Thread {
  return {
    id: crypto.randomUUID(),
    name: 'New chat',
    createdAt: Date.now(),
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    messages: [],
  };
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
    </div>
  );
}

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

const STARTER_PROMPTS = [
  'What can you help with?',
  'Tell me a fun fact',
  'Explain RAG in simple terms',
  'What is vector search?',
];

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant for a simple hello-world chatbot app.';

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingOutputTokens, setStreamingOutputTokens] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [kbFiles] = useState<KbFile[]>([]);
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [selectedKbIds, setSelectedKbIds] = useState<string[]>([]);
  const [uploadingKb, setUploadingKb] = useState(false);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [temperature, setTemperature] = useState(0.4);
  const [promptSaveStatus, setPromptSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [llmProvider, setLlmProvider] = useState('openai');
  const [llmModel, setLlmModel] = useState('gpt-5.4');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [llmSaveStatus, setLlmSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const promptSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadsRef = useRef<Thread[]>([]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );
  const activeMessages = useMemo(
    () => activeThread?.messages ?? [],
    [activeThread]
  );
  const activeSystemPrompt = useMemo(
    () => activeThread?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    [activeThread]
  );
  const sessionCost = useMemo(
    () => activeMessages.reduce((sum, m) => sum + (m.cost ?? 0), 0),
    [activeMessages]
  );
  const totalCost = useMemo(
    () => threads.reduce((sum, t) => sum + t.messages.reduce((s, m) => s + (m.cost ?? 0), 0), 0),
    [threads]
  );

  // Load threads from server on mount
  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((data: { threads?: Thread[] }) => {
        const loaded =
          Array.isArray(data.threads) && data.threads.length > 0
            ? data.threads.map((thread) => ({
                ...thread,
                systemPrompt:
                  typeof thread.systemPrompt === 'string' && thread.systemPrompt.trim().length > 0
                    ? thread.systemPrompt
                    : DEFAULT_SYSTEM_PROMPT,
              }))
            : [newThread()];
        threadsRef.current = loaded;
        setThreads(loaded);
        setActiveThreadId(loaded[0].id);
      })
      .catch(() => {
        const t = newThread();
        threadsRef.current = [t];
        setThreads([t]);
        setActiveThreadId(t.id);
      });
    // Load KB list on mount
    fetchKbList();
    // Load persisted prompt settings from DB
    fetch('/api/settings/prompt')
      .then((r) => r.json())
      .then((data: { success: boolean; data?: { system_prompt: string; temperature: number; llm_provider: string; llm_model: string; llm_api_key: string; llm_base_url: string } }) => {
        if (data.success && data.data) {
          const d = data.data;
          setTemperature(d.temperature);
          if (d.llm_provider) setLlmProvider(d.llm_provider);
          if (d.llm_model) setLlmModel(d.llm_model);
          if (d.llm_api_key) setLlmApiKey(d.llm_api_key);
          if (d.llm_base_url) setLlmBaseUrl(d.llm_base_url);
          // Auto-fetch model list using loaded settings
          fetchModels(
            d.llm_provider || 'openai',
            d.llm_api_key || '',
            d.llm_base_url || '',
          );
          // Seed threads with DB system prompt if still using default
          setThreads((prev) =>
            prev.map((t) =>
              t.systemPrompt === DEFAULT_SYSTEM_PROMPT
                ? { ...t, systemPrompt: d.system_prompt }
                : t
            )
          );
        }
      })
      .catch(() => {});
  }, []);

  // Debounced save to server JSON file
  const saveThreads = useCallback((t: Thread[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threads: t }),
      }).catch(() => {});
    }, 400);
  }, []);

  useEffect(() => {
    if (threads.length === 0) return;
    threadsRef.current = threads;
    saveThreads(threads);
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [threads, saveThreads]);

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending]);

  function createThread() {
    const t = newThread();
    setThreads((prev) => [t, ...prev]);
    setActiveThreadId(t.id);
    setInput('');
    setError(null);
  }

  function deleteThread(id: string) {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = newThread();
        setActiveThreadId(fresh.id);
        return [fresh];
      }
      if (id === activeThreadId) setActiveThreadId(next[0].id);
      return next;
    });
  }

  function deleteMessage(msgId: string) {
    if (!activeThreadId) return;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? { ...t, messages: t.messages.filter((m) => m.id !== msgId) }
          : t
      )
    );
  }

  function updateActiveSystemPrompt(nextPrompt: string) {
    if (!activeThreadId) return;
    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? { ...t, systemPrompt: nextPrompt.slice(0, 6000) }
          : t
      )
    );
    // Debounced persist to DB
    if (promptSaveTimeout.current) clearTimeout(promptSaveTimeout.current);
    setPromptSaveStatus('saving');
    promptSaveTimeout.current = setTimeout(() => {
      fetch('/api/settings/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_prompt: nextPrompt }),
      })
        .then(() => {
          setPromptSaveStatus('saved');
          setTimeout(() => setPromptSaveStatus('idle'), 2000);
        })
        .catch(() => setPromptSaveStatus('idle'));
    }, 800);
  }

  function updateTemperature(val: number) {
    setTemperature(val);
    if (promptSaveTimeout.current) clearTimeout(promptSaveTimeout.current);
    setPromptSaveStatus('saving');
    promptSaveTimeout.current = setTimeout(() => {
      fetch('/api/settings/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temperature: val }),
      })
        .then(() => {
          setPromptSaveStatus('saved');
          setTimeout(() => setPromptSaveStatus('idle'), 2000);
        })
        .catch(() => setPromptSaveStatus('idle'));
    }, 400);
  }

  async function saveLlmSettings() {
    setLlmSaveStatus('saving');
    try {
      const res = await fetch('/api/settings/prompt', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llm_provider: llmProvider, llm_model: llmModel, llm_api_key: llmApiKey, llm_base_url: llmBaseUrl }),
      });
      const result = await res.json() as { success: boolean };
      if (!result.success) throw new Error('Save failed');
      setLlmSaveStatus('saved');
      setTimeout(() => setLlmSaveStatus('idle'), 2500);
    } catch {
      setLlmSaveStatus('error');
      setTimeout(() => setLlmSaveStatus('idle'), 3000);
    }
  }

  const fetchModels = useCallback(async (provider: string, apiKey: string, baseUrl: string) => {
    if (provider === 'custom' && !baseUrl) return;
    setLoadingModels(true);
    setModelsError(null);
    try {
      const params = new URLSearchParams({ provider });
      if (apiKey) params.set('apiKey', apiKey);
      if (baseUrl) params.set('baseUrl', baseUrl);
      const res = await fetch(`/api/models?${params}`);
      const data = await res.json() as { models?: ModelInfo[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to load models');
      setAvailableModels(data.models ?? []);
      setModelsFetched(true);
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Failed to load models');
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  async function handleKbUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    
    const form = e.currentTarget;
    const inputs = form.querySelectorAll('input, textarea');
    
    let category = 'General';
    let title = 'Untitled Document';
    let content = '';

    if (inputs.length >= 3) {
      category = ((inputs[0] as HTMLInputElement)?.value?.trim() || 'General');
      title = ((inputs[1] as HTMLInputElement)?.value?.trim() || 'Untitled Document');
      content = ((inputs[2] as HTMLTextAreaElement)?.value?.trim() || '');
    }

    if (!content) {
      alert('Please enter KB content');
      return;
    }

    setUploadingKb(true);
    try {
      const res = await fetch('/api/kb/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          title,
          content,
          tags: [],
        }),
      });

      const result = (await res.json()) as { success: boolean; data?: KnowledgeBase; error?: string };
      if (!result.success) throw new Error(result.error || 'Upload failed');

      alert(`✓ KB uploaded: "${title}"`);
      // Clear form
      if (inputs[0] instanceof HTMLInputElement) inputs[0].value = '';
      if (inputs[1] instanceof HTMLInputElement) inputs[1].value = '';
      if (inputs[2] instanceof HTMLTextAreaElement) inputs[2].value = '';
      
      // Refresh KB list
      fetchKbList();
    } catch (err) {
      alert(`KB upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploadingKb(false);
    }
  }

  async function fetchKbList() {
    try {
      const res = await fetch('/api/kb/list');
      const result = (await res.json()) as { success: boolean; data?: KnowledgeBase[]; error?: string };
      if (result.success && Array.isArray(result.data)) {
        setKbList(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch KB list:', err);
    }
  }

  async function saveKbEdit(id: string) {
    try {
      const res = await fetch('/api/kb/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: editDraft }),
      });
      const result = (await res.json()) as { success: boolean; data?: KnowledgeBase; error?: string };
      if (!result.success) throw new Error(result.error || 'Update failed');
      setKbList(prev => prev.map(kb => kb.id === id ? { ...kb, content: editDraft } : kb));
      setEditingKbId(null);
      setEditDraft('');
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function startKbEdit(kb: KnowledgeBase) {
    setEditingKbId(kb.id);
    setEditDraft(kb.content);
  }

  function cancelKbEdit() {
    setEditingKbId(null);
    setEditDraft('');
  }

  async function clearKbContent(id: string) {
    if (!confirm('Clear content for this KB entry? The record stays but content will be empty.')) return;
    try {
      const res = await fetch('/api/kb/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: '' }),
      });
      const result = (await res.json()) as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error || 'Clear failed');
      setKbList(prev => prev.map(kb => kb.id === id ? { ...kb, content: '' } : kb));
    } catch (err) {
      alert(`Clear failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  function toggleKbSelection(id: string) {
    setSelectedKbIds(prev =>
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        const form = e.currentTarget.closest('form');
        if (form) form.requestSubmit();
      }
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeThreadId) return;
    const threadId = activeThreadId;

    setError(null);
    setInput('');
    setStreamingOutputTokens(0);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    // Auto-name thread from first message
    const isFirst = activeMessages.length === 0;
    const threadName = isFirst ? text.slice(0, 42).trim() : undefined;
    const assistantMessageId = crypto.randomUUID();

    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? {
              ...t,
              ...(threadName ? { name: threadName } : {}),
              messages: [
                ...t.messages,
                userMessage,
                {
                  id: assistantMessageId,
                  role: 'assistant',
                  content: '',
                  timestamp: Date.now(),
                },
              ],
            }
          : t
      )
    );
    setSending(true);

    try {
      const latestThread = threadsRef.current.find((t) => t.id === threadId);
      const promptForRequest = latestThread?.systemPrompt ?? activeSystemPrompt;
      const context = [...(latestThread?.messages ?? activeMessages), userMessage]
        .filter((m) => m.id !== assistantMessageId);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          systemPrompt: promptForRequest,
          messages: context.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (response.status === 429) throw new Error('OpenAI quota exceeded. Add billing credits or use a different key.');
        if (response.status === 401) throw new Error('OpenAI key is invalid. Update OPENAI_API_KEY in .env.local.');
        throw new Error(payload.error || 'Failed to get a response');
      }

      if (!response.body) {
        throw new Error('Streaming is not available in this browser/session.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      let streamedText = '';
      let finalUsage: MessageUsage | undefined;
      let finalCost: number | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const line = chunk
            .split('\n')
            .find((part) => part.startsWith('data: '));
          if (!line) continue;

          const payload = JSON.parse(line.slice(6)) as {
            type: 'delta' | 'usage' | 'done' | 'error';
            delta?: string;
            usage?: MessageUsage;
            cost?: number;
            error?: string;
          };

          if (payload.type === 'error') {
            throw new Error(payload.error || 'Streaming failed');
          }

          if (payload.type === 'delta' && payload.delta) {
            streamedText += payload.delta;
            setStreamingOutputTokens(Math.ceil(streamedText.length / 4));
            setThreads((prev) =>
              prev.map((t) =>
                t.id === threadId
                  ? {
                      ...t,
                      messages: t.messages.map((m) =>
                        m.id === assistantMessageId ? { ...m, content: streamedText } : m
                      ),
                    }
                  : t
              )
            );
          }

          if (payload.type === 'usage' && payload.usage) {
            finalUsage = payload.usage;
            finalCost = payload.cost ?? calcCost(payload.usage, llmModel);
          }
        }
      }

      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? {
                ...t,
                messages: t.messages.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: streamedText || 'Sorry, I could not generate a response.',
                        usage: finalUsage,
                        cost: finalCost,
                      }
                    : m
                ),
              }
            : t
        )
      );
    } catch (err) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId
            ? { ...t, messages: t.messages.filter((m) => m.id !== assistantMessageId) }
            : t
        )
      );
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSending(false);
      setStreamingOutputTokens(0);
      inputRef.current?.focus();
    }
  }

  function clearAllChats() {
    const fresh = newThread();
    setThreads([fresh]);
    setActiveThreadId(fresh.id);
    setError(null);
    fetch('/api/history', { method: 'DELETE' }).catch(() => {});
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0f1117] text-white">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={[
          'fixed lg:relative z-30 top-0 left-0 h-full w-96 flex flex-col shrink-0',
          'bg-[#161b27] border-r border-white/[0.06]',
          'transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Brand + new chat */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold tracking-tight">SAChatbot</h1>
            <p className="text-[10px] text-slate-500 mt-0.5">gpt-5.4 · JSON memory</p>
          </div>
          <button
            onClick={createThread}
            title="New chat"
            className="h-7 w-7 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/[0.1] text-slate-300 hover:text-white flex items-center justify-center text-base font-light transition-colors"
          >
            +
          </button>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-500 hover:text-white text-sm">✕</button>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1 min-h-0">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-600 px-2 mb-1">
            Conversations ({threads.length})
          </p>
          {threads.map((thread) => {
            const tCost = thread.messages.reduce((s, m) => s + (m.cost ?? 0), 0);
            const isActive = thread.id === activeThreadId;
            return (
              <div
                key={thread.id}
                className={`group relative flex items-start gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                  isActive
                    ? 'bg-white/[0.1] border border-white/[0.1]'
                    : 'hover:bg-white/[0.05] border border-transparent'
                }`}
                onClick={() => { setActiveThreadId(thread.id); setSidebarOpen(false); }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-200 truncate leading-4">{thread.name}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {fmtDate(thread.createdAt)} · {thread.messages.length} msg{thread.messages.length !== 1 ? 's' : ''}
                  </p>
                  {tCost > 0 && <p className="text-[10px] font-mono text-emerald-700 mt-0.5">{fmtCost(tCost)}</p>}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteThread(thread.id); }}
                  className="opacity-0 group-hover:opacity-100 shrink-0 text-slate-600 hover:text-red-400 transition-all mt-0.5"
                  title="Delete thread"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* KB scaffold */}
        <div className="px-4 py-3 border-t border-white/[0.06] flex flex-col gap-3 max-h-[32rem] flex-shrink-0 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-0.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Knowledge Base</p>
              <p className="text-[11px] font-medium text-slate-300 mt-0.5">{kbList.length} {kbList.length === 1 ? 'entry' : 'entries'}</p>
            </div>
            {selectedKbIds.length > 0 && (
              <div className="bg-blue-500/20 border border-blue-500/40 rounded-lg px-2.5 py-1.5">
                <p className="text-[9px] font-semibold text-blue-300">{selectedKbIds.length} active</p>
              </div>
            )}
          </div>

          {/* Upload Form */}
          <form onSubmit={handleKbUpload} className="space-y-2.5 flex-shrink-0 bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
            <div>
              <label className="text-[8px] font-semibold uppercase tracking-widest text-slate-500 block mb-1.5">New KB Entry</label>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Category"
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/[0.25] focus:bg-white/[0.08] transition-all disabled:opacity-50"
                  disabled={uploadingKb}
                />
                <input
                  type="text"
                  placeholder="Title"
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/[0.25] focus:bg-white/[0.08] transition-all disabled:opacity-50"
                  disabled={uploadingKb}
                />
                <textarea
                  placeholder="Content..."
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/[0.25] focus:bg-white/[0.08] transition-all resize-none disabled:opacity-50"
                  rows={2}
                  disabled={uploadingKb}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={uploadingKb}
              className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-xs font-semibold text-white hover:from-blue-500 hover:to-blue-600 transition-all disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploadingKb ? (
                <span className="flex items-center justify-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 animate-spin rounded-full border-2 border-white border-r-transparent" />
                  Uploading...
                </span>
              ) : (
                'Upload Entry'
              )}
            </button>
          </form>

          {/* KB List */}
          {kbList.length > 0 && (
            <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-2">
              {kbList.map((kb) => {
                const isSelected = selectedKbIds.includes(kb.id);
                const isEditing = editingKbId === kb.id;
                const isEmpty = !kb.content || kb.content.trim() === '';
                const preview = isEmpty
                  ? '(empty)'
                  : kb.content.substring(0, 60).replace(/\n/g, ' ') + (kb.content.length > 60 ? '...' : '');
                return (
                  <div
                    key={kb.id}
                    className={`group rounded-lg border transition-all duration-200 ${
                      isEditing
                        ? 'bg-amber-500/10 border-amber-500/50'
                        : isSelected
                        ? 'bg-blue-600/20 border-blue-500/60 shadow-sm shadow-blue-500/20'
                        : 'border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.15]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 px-3 pt-2.5 pb-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleKbSelection(kb.id)}
                        disabled={isEditing}
                        className="mt-1 h-4 w-4 rounded border-white/[0.3] bg-white/[0.1] cursor-pointer accent-blue-500 focus:outline-none disabled:opacity-40"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            isEditing
                              ? 'bg-amber-500/30 text-amber-200'
                              : isSelected
                              ? 'bg-blue-500/40 text-blue-200'
                              : 'bg-slate-700/60 text-slate-300'
                          }`}>
                            {kb.category}
                          </span>
                          <p className={`text-[11px] font-semibold truncate ${
                            isEditing ? 'text-amber-100' : isSelected ? 'text-blue-100' : 'text-slate-200'
                          }`}>
                            {kb.title}
                          </p>
                        </div>
                        {!isEditing && (
                          <p className={`text-[9px] mt-1 leading-relaxed ${isEmpty ? 'text-slate-600 italic' : 'text-slate-500'}`}>
                            {preview}
                          </p>
                        )}
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => startKbEdit(kb)}
                            className="text-slate-500 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg p-1 transition-all"
                            title="Edit content"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => clearKbContent(kb.id)}
                            className="text-slate-500 hover:text-slate-300 hover:bg-white/[0.08] rounded-lg p-1 transition-all"
                            title="Clear content"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                              <line x1="18" y1="9" x2="12" y2="15" />
                              <line x1="12" y1="9" x2="18" y2="15" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <div className="px-3 pb-3 space-y-2">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={5}
                          autoFocus
                          className="w-full rounded-lg border border-amber-500/40 bg-white/[0.06] px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/70 resize-y transition-all"
                          placeholder="Enter content..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveKbEdit(kb.id)}
                            className="flex-1 rounded-lg bg-amber-500/80 hover:bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-all"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelKbEdit}
                            className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 text-[11px] text-slate-400 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {kbList.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-2">
              <div className="text-3xl mb-2">📚</div>
              <p className="text-[10px] text-slate-500">No KB entries yet</p>
              <p className="text-[9px] text-slate-600 mt-1">Add one above to get started</p>
            </div>
          )}
        </div>

        {/* Clear all */}
        <div className="px-4 pb-4">
          <button
            onClick={clearAllChats}
            className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] text-[12px] font-medium text-slate-500 hover:text-white hover:border-white/[0.18] hover:bg-white/[0.06] transition-all py-2"
          >
            Clear all conversations
          </button>
        </div>
      </aside>

      {/* ── Main chat area ── */}
      <main className="flex flex-1 flex-col min-w-0 h-full">
        {/* Header */}
        <header className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-[#161b27]/50 backdrop-blur">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-400 hover:text-white p-1" aria-label="Open sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-sm font-bold shrink-0">S</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-none truncate">{activeThread?.name ?? 'SAChatbot'}</p>
            <p className="text-[11px] text-emerald-400 mt-0.5">Online · {llmModel}</p>
          </div>
          {/* Cost summary */}
          <div className="shrink-0 text-right leading-tight">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">Thread</p>
            <p className={`text-[12px] font-mono font-semibold ${sessionCost > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
              {fmtCost(sessionCost)}
            </p>
            <p className="text-[9px] text-slate-700 mt-0.5">All chats: {fmtCost(totalCost)}</p>
          </div>
        </header>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
          {activeMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center max-w-md mx-auto">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-600/20 border border-white/[0.08] flex items-center justify-center text-3xl select-none">
                💬
              </div>
              <div>
                <p className="text-xl font-semibold">Start a conversation</p>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                  Each thread is saved separately. Cost per response is shown inline.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                    className="text-xs border border-white/[0.1] bg-white/[0.04] rounded-full px-3 py-1.5 text-slate-300 hover:border-white/[0.25] hover:text-white hover:bg-white/[0.08] transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeMessages.map((message) => (
              <div key={message.id} className={`group flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex flex-col gap-1 max-w-[75%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 px-1 mb-0.5">
                      <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[9px] font-bold shrink-0">S</div>
                      <span className="text-[11px] text-slate-500 font-medium">SAChatbot</span>
                    </div>
                  )}
                  <div className="relative">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-[#1e2636] text-slate-100 border border-white/[0.06] rounded-bl-sm'
                      }`}
                      style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                    >
                      {message.content}
                    </div>
                    <button
                      onClick={() => deleteMessage(message.id)}
                      title="Delete message"
                      className={`absolute top-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-red-400 bg-[#0f1117] rounded-full p-0.5 border border-white/[0.08] ${
                        message.role === 'user' ? '-left-6' : '-right-6'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  {/* Timestamp + cost + tokens */}
                  <div className="flex items-center gap-2 px-1">
                    <p className="text-[10px] text-slate-600">{fmtTime(message.timestamp)}</p>
                    {message.cost !== undefined && (
                      <p className="text-[10px] font-mono text-emerald-700" title="Estimated cost for this response">
                        {fmtCost(message.cost)}
                      </p>
                    )}
                    {message.usage && (
                      <p className="text-[10px] text-slate-700" title="Tokens used">
                        {message.usage.prompt_tokens + message.usage.completion_tokens} tok
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="flex flex-col gap-1 items-start">
                <div className="flex items-center gap-1.5 px-1 mb-0.5">
                  <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-[9px] font-bold shrink-0">S</div>
                  <span className="text-[11px] text-slate-500 font-medium">SAChatbot</span>
                </div>
                <div className="bg-[#1e2636] border border-white/[0.06] rounded-2xl rounded-bl-sm">
                  <TypingDots />
                </div>
                <p className="text-[10px] text-slate-600 px-1">
                  {streamingOutputTokens > 0
                    ? `Streaming output: ~${streamingOutputTokens} tok`
                    : 'Streaming output...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mb-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 flex items-start gap-3 shrink-0">
            <span className="text-red-400 mt-0.5 text-base shrink-0">⚠</span>
            <p className="text-sm text-red-300 leading-relaxed flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-200 text-sm shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="shrink-0 px-4 pb-4">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-3 bg-[#1e2636] border border-white/[0.08] rounded-2xl px-4 py-3 focus-within:border-white/[0.2] transition-colors"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message SAChatbot…  (Enter to send · Shift+Enter for new line)"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-slate-500 outline-none leading-6 max-h-36"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="shrink-0 h-8 w-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-white/[0.06] disabled:text-slate-600 text-white flex items-center justify-center transition-all"
            >
              <SendIcon />
            </button>
          </form>
          <p className="text-center text-[10px] text-slate-600 mt-2">
            SAChatbot can make mistakes. Responses are AI-generated. Costs use {llmModel} pricing from developers.openai.com and include cached-input discount when usage is reported.
          </p>
        </div>
      </main>

            {/* ── Right panel: Model · LLM Settings · System Prompt ── */}
            <aside className="hidden lg:flex flex-col w-80 shrink-0 h-full bg-[#161b27] border-l border-white/[0.06] overflow-y-auto">
                <div className="px-4 pt-4 pb-3 border-b border-white/[0.06]">
                    <h2 className="text-sm font-semibold text-white">Settings</h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">Model · Prompt · Temperature</p>
                </div>
                <div className="px-4 pt-4 pb-2">
                    <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-3 flex flex-col gap-1">
                        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Active model</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                            <span className="text-sm font-semibold text-white truncate">{llmModel}</span>
                            <span className="text-[9px] text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded-full uppercase shrink-0">{llmProvider}</span>
                        </div>
                        <p className="text-[10px] text-slate-500">Temperature: {temperature.toFixed(2)}</p>
                    </div>
                </div>
                <div className="px-4 pb-3">
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">LLM Settings</p>
                            {llmSaveStatus === 'saving' && (
                                <span className="text-[9px] text-slate-500 flex items-center gap-1">
                                    <span className="inline-block h-1.5 w-1.5 animate-spin rounded-full border border-slate-500 border-r-transparent" />
                                    Saving…
                                </span>
                            )}
                            {llmSaveStatus === 'saved' && <span className="text-[9px] text-emerald-500">✓ Saved</span>}
                            {llmSaveStatus === 'error' && <span className="text-[9px] text-red-400">✕ Failed</span>}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Provider</label>
                            <div className="flex gap-2">
                                {(['openai', 'deepseek', 'custom'] as const).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => {
                                            setLlmProvider(p);
                                            setModelsFetched(false);
                                            setAvailableModels([]);
                                            setModelsError(null);
                                            if (p === 'openai') { setLlmModel('gpt-4o'); setLlmBaseUrl(''); fetchModels('openai', llmApiKey, ''); }
                                            else if (p === 'deepseek') { setLlmModel('deepseek-chat'); setLlmBaseUrl('https://api.deepseek.com/v1'); fetchModels('deepseek', llmApiKey, 'https://api.deepseek.com/v1'); }
                                        }}
                                        className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-all ${
                                            llmProvider === p
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white/[0.05] text-slate-400 hover:bg-white/[0.08] hover:text-white border border-white/[0.07]'
                                        }`}
                                    >
                                        {p === 'deepseek' ? 'DeepSeek' : p === 'openai' ? 'OpenAI' : 'Custom'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Model picker ── */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Model</label>
                                <button
                                    type="button"
                                    onClick={() => fetchModels(llmProvider, llmApiKey, llmBaseUrl)}
                                    disabled={loadingModels || (llmProvider === 'custom' && !llmBaseUrl)}
                                    className="flex items-center gap-1 text-[9px] text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                                    title="Fetch available models from provider"
                                >
                                    {loadingModels ? (
                                        <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-blue-400 border-r-transparent" />
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                    )}
                                    {loadingModels ? 'Loading…' : modelsFetched ? 'Refresh' : 'Load models'}
                                </button>
                            </div>

                            {/* Error state */}
                            {modelsError && (
                                <p className="text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5">{modelsError}</p>
                            )}

                            {/* Model cards list */}
                            {modelsFetched && availableModels.length > 0 ? (
                                <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-1">
                                    {availableModels.map((m) => {
                                        const isSelected = llmModel === m.id;
                                        const unavailable = m.available === false;
                                        const badgeColors: Record<string, string> = {
                                            'Latest':     'bg-emerald-900/50 text-emerald-400',
                                            'Reasoning':  'bg-violet-900/50 text-violet-300',
                                            'Fast':       'bg-sky-900/50 text-sky-300',
                                            'Pro':        'bg-rose-900/50 text-rose-300',
                                            'Code':       'bg-amber-900/50 text-amber-300',
                                            'GPT-4 Gen':  'bg-slate-700/60 text-slate-300',
                                            'DeepSeek V3':'bg-blue-900/50 text-blue-300',
                                        };
                                        const badgeCls = m.badge ? (badgeColors[m.badge] ?? 'bg-slate-700/60 text-slate-400') : '';
                                        return (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => setLlmModel(m.id)}
                                                className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all ${
                                                    isSelected
                                                        ? 'bg-blue-600/20 border-blue-500/60 shadow-sm shadow-blue-500/20'
                                                        : unavailable
                                                        ? 'bg-white/[0.01] border-white/[0.05] opacity-50'
                                                        : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.15]'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className={`text-[11px] font-semibold truncate ${isSelected ? 'text-blue-200' : 'text-slate-200'}`}>
                                                        {m.name !== m.id ? m.name : m.id}
                                                    </span>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {m.badge && (
                                                            <span className={`text-[7px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badgeCls}`}>
                                                                {m.badge}
                                                            </span>
                                                        )}
                                                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                                                        {unavailable && <span className="text-[8px] text-slate-600 italic">not in plan</span>}
                                                    </div>
                                                </div>
                                                <p className="text-[9px] text-slate-500 mt-0.5 leading-relaxed">{m.description}</p>
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {m.contextWindow && (
                                                        <span className="text-[8px] bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded-full">
                                                            {m.contextWindow >= 1000 ? `${(m.contextWindow / 1000).toFixed(0)}K ctx` : `${m.contextWindow} ctx`}
                                                        </span>
                                                    )}
                                                    {m.inputPricePerM != null && (
                                                        <span className="text-[8px] bg-emerald-900/40 text-emerald-400 px-1.5 py-0.5 rounded-full">
                                                            ${m.inputPricePerM.toFixed(2)}/M in
                                                        </span>
                                                    )}
                                                    {m.outputPricePerM != null && (
                                                        <span className="text-[8px] bg-amber-900/40 text-amber-400 px-1.5 py-0.5 rounded-full">
                                                            ${m.outputPricePerM.toFixed(2)}/M out
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* Fallback text input when models not yet fetched */
                                <input
                                    type="text"
                                    value={llmModel}
                                    onChange={(e) => setLlmModel(e.target.value)}
                                    placeholder="e.g. gpt-4o, deepseek-chat"
                                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/[0.25] transition-all"
                                />
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">API Key</label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={llmApiKey}
                                    onChange={(e) => setLlmApiKey(e.target.value)}
                                    placeholder="sk-… or leave blank to use .env"
                                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 pr-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/[0.25] transition-all font-mono"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey((v) => !v)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                    title={showApiKey ? 'Hide key' : 'Show key'}
                                >
                                    {showApiKey ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    )}
                                </button>
                            </div>
                            <p className="text-[9px] text-slate-600">Stored in DB. Leave blank to use env var.</p>
                        </div>
                        {(llmProvider === 'deepseek' || llmProvider === 'custom') && (
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Base URL</label>
                                <input
                                    type="text"
                                    value={llmBaseUrl}
                                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                                    placeholder={llmProvider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://your-provider.com/v1'}
                                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.05] px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/[0.25] transition-all font-mono"
                                />
                            </div>
                        )}
                        <button
                            onClick={saveLlmSettings}
                            disabled={llmSaveStatus === 'saving'}
                            className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {llmSaveStatus === 'saving' ? 'Saving…' : 'Save LLM Settings'}
                        </button>
                    </div>
                </div>
                <div className="px-4 pb-6">
                    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">System prompt</p>
                            <div className="flex items-center gap-2">
                                {promptSaveStatus === 'saving' && (
                                    <span className="text-[9px] text-slate-500 flex items-center gap-1">
                                        <span className="inline-block h-1.5 w-1.5 animate-spin rounded-full border border-slate-500 border-r-transparent" />
                                        Saving…
                                    </span>
                                )}
                                {promptSaveStatus === 'saved' && <span className="text-[9px] text-emerald-500">✓ Saved</span>}
                                <button
                                    type="button"
                                    onClick={() => updateActiveSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                                    className="text-[10px] text-slate-400 hover:text-white"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={activeSystemPrompt}
                            onChange={(e) => updateActiveSystemPrompt(e.target.value)}
                            rows={5}
                            placeholder="Define assistant behavior for this thread"
                            className="w-full resize-y rounded-lg border border-white/[0.08] bg-[#0f1117] px-2.5 py-2 text-[11px] text-slate-200 placeholder:text-slate-600 outline-none focus:border-white/[0.18]"
                        />
                        <div className="flex flex-col gap-1.5 pt-1 border-t border-white/[0.05] mt-1">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Temperature</label>
                                <span className="text-[11px] font-mono font-semibold text-slate-300">{temperature.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={2}
                                step={0.05}
                                value={temperature}
                                onChange={(e) => updateTemperature(parseFloat(e.target.value))}
                                className="w-full h-1.5 rounded-full appearance-none bg-white/[0.1] accent-blue-500 cursor-pointer"
                            />
                            <div className="flex justify-between text-[8px] text-slate-600">
                                <span>Precise (0)</span>
                                <span>Balanced (1)</span>
                                <span>Creative (2)</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-600">Prompt &amp; temperature saved globally to the database.</p>
                    </div>
                </div>
            </aside>
    </div>
  );
}
