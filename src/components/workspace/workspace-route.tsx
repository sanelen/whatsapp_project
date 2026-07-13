'use client';

import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  type LucideIcon,
  MessageSquareText,
  SlidersHorizontal,
  Settings2,
  Users,
} from 'lucide-react';
import { Button, Input, Label, TextArea, TextField } from '@heroui/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { getLocalAuthBypassEmail, isLocalAuthBypassEnabled } from '@/lib/auth/local-testing';
import {
  getOverviewWindowLabel,
  overviewChannels,
  overviewWindows,
  type OverviewAnalyticsSummary,
  type OverviewChannel,
  type OverviewWindow,
} from '@/lib/overview-analytics';
import {
  createSeedWorkspace,
  getPropertiesForOrganization,
  getWorkspaceSummary,
  updatePropertyChatbot,
  type OrganizationWorkspace,
  type PropertyWorkspace,
  type WorkspaceState,
} from '@/lib/workspace';
import { organizationPath, propertyPath } from '@/lib/workspace-routes';
import { createClient } from '@/lib/supabase/client';

type RouteView = 'organizations' | 'organization' | 'property' | 'chatbot';
type SettingsTab = 'llm' | 'instructions' | 'retrieval' | 'knowledge' | 'templates';
type WorkspaceSection =
  | 'Overview'
  | 'Chatbot'
  | 'Agents'
  | 'Conversations'
  | 'Knowledge Base'
  | 'Analytics'
  | 'Usage'
  | 'Settings';

const workspaceSectionIcons: Record<WorkspaceSection, LucideIcon> = {
  Overview: LayoutDashboard,
  Chatbot: Bot,
  Agents: Users,
  Conversations: MessageSquareText,
  'Knowledge Base': BriefcaseBusiness,
  Analytics: BarChart3,
  Usage: Gauge,
  Settings: Settings2,
};

const selectedOrganizationStorageKey = 'hamba.workspace.selectedOrganizationId';
const selectedPropertyStorageKey = 'hamba.workspace.selectedPropertyId';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRetrievalResult = {
  category: string;
  title: string;
  source_type?: string;
  source_id?: string;
  source_name?: string;
  similarity?: number;
  chunk_index?: number;
  chunk_count?: number;
};

type ChatRetrievalLog = {
  retrieval?: 'vector' | 'text';
  propertyId?: string;
  memoryMode: string;
  topK: number;
  similarityThreshold: number;
  historyWindow: number;
  results: ChatRetrievalResult[];
};

type ChunkStrategy = 'recursive_character' | 'sentence' | 'latex' | 'markdown';

type ChunkSettings = {
  strategy: ChunkStrategy;
  chunkSize: number;
  chunkOverlap: number;
};

type LegacyKnowledgeEntry = {
  id: string;
  category: string;
  title: string;
  content: string;
  source_id?: string | null;
  source_name?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

type KnowledgeSourceEntry = LegacyKnowledgeEntry & {
  source_type?: string;
  source_id?: string | null;
  updated_at?: string;
};

type KnowledgeIndexingStatus = {
  status: 'indexed' | 'skipped' | 'failed';
  chunkCount: number;
  model: string;
  dimensions: number;
  error?: string;
};

type KnowledgeSearchPreview = {
  id: string;
  title: string;
  content: string;
  source_type?: string;
  source_name?: string;
  similarity?: number;
};

const defaultChunkSettings: ChunkSettings = {
  strategy: 'recursive_character',
  chunkSize: 2000,
  chunkOverlap: 250,
};

const llmProviders = [
  {
    value: 'openai',
    label: 'OpenAI GPT',
    models: [
      { value: 'gpt-5.5', label: 'GPT-5.5 (Flagship)' },
      { value: 'gpt-5.5-instant', label: 'GPT-5.5 Instant' },
      { value: 'gpt-5.5-mini', label: 'GPT-5.5 Mini' },
      { value: 'gpt-5.4', label: 'GPT-5.4' },
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    ],
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    models: [
      { value: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro' },
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
      { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite' },
      { value: 'gemini-3.5-mini', label: 'Gemini 3.5 Mini' },
      { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro' },
      { value: 'gemini-3.1-flash', label: 'Gemini 3.1 Flash' },
      { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
      { value: 'gemini-3.1-mini', label: 'Gemini 3.1 Mini' },
    ],
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    models: [
      { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
      { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
    ],
  },
] as const;

function getProviderOption(provider: string) {
  return llmProviders.find((option) => option.value === provider) ?? llmProviders[0];
}

function getModelValue(provider: string, model: string) {
  const providerOption = getProviderOption(provider);
  return providerOption.models.some((option) => option.value === model)
    ? model
    : providerOption.models[0].value;
}

function getKnowledgeChunkSettingsStorageKey(propertyId: string) {
  return `hamba.kb.textChunkSettings.${propertyId}`;
}

function getChunkStrategyLabel(strategy: ChunkStrategy) {
  switch (strategy) {
    case 'sentence':
      return 'Sentence Splitter';
    case 'latex':
      return 'LaTeX Splitter';
    case 'markdown':
      return 'Markdown Splitter';
    case 'recursive_character':
    default:
      return 'Recursive Character Splitter';
  }
}

function parseChunkSettings(value: unknown): ChunkSettings {
  if (!value || typeof value !== 'object') {
    return defaultChunkSettings;
  }

  const candidate = value as Partial<ChunkSettings>;
  const strategy = candidate.strategy;
  const chunkSize = Number(candidate.chunkSize);
  const chunkOverlap = Number(candidate.chunkOverlap);

  return {
    strategy:
      strategy === 'sentence' || strategy === 'latex' || strategy === 'markdown' || strategy === 'recursive_character'
        ? strategy
        : defaultChunkSettings.strategy,
    chunkSize: Number.isFinite(chunkSize) && chunkSize > 0 ? Math.round(chunkSize) : defaultChunkSettings.chunkSize,
    chunkOverlap:
      Number.isFinite(chunkOverlap) && chunkOverlap >= 0 ? Math.round(chunkOverlap) : defaultChunkSettings.chunkOverlap,
  };
}

export function WorkspaceRoute({
  view,
  organizationId,
  propertyId,
}: {
  view: RouteView;
  organizationId?: string;
  propertyId?: string;
}) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createSeedWorkspace());
  const [organizationName, setOrganizationName] = useState('');
  const [organizationIcon, setOrganizationIcon] = useState('');
  const [organizationDescription, setOrganizationDescription] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [propertyLocation, setPropertyLocation] = useState('');
  const [propertyIcon, setPropertyIcon] = useState('');
  const [propertyImageUrl, setPropertyImageUrl] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Your property assistant is ready for a test conversation.' },
  ]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastRetrievalLog, setLastRetrievalLog] = useState<ChatRetrievalLog | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('llm');
  const [isCreateOrganizationOpen, setIsCreateOrganizationOpen] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<OrganizationWorkspace | null>(null);
  const [isCreatePropertyOpen, setIsCreatePropertyOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyWorkspace | null>(null);
  const [storedOrganizationId, setStoredOrganizationId] = useState<string | null>(null);
  const [storedPropertyId, setStoredPropertyId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStoredOrganizationId(window.localStorage.getItem(selectedOrganizationStorageKey));
      setStoredPropertyId(window.localStorage.getItem(selectedPropertyStorageKey));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const response = await fetch('/api/workspace', { cache: 'no-store' });
        const payload = (await response.json()) as { success: boolean; data?: WorkspaceState; error?: string };
        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || 'Failed to load workspace');
        }
        if (!cancelled) {
          setWorkspace(payload.data);
          setWorkspaceError(null);
        }
      } catch (error) {
        if (!cancelled) setWorkspaceError(error instanceof Error ? error.message : 'Failed to load workspace');
      } finally {
        if (!cancelled) setIsLoadingWorkspace(false);
      }
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedOrganization = useMemo(() => {
    if (organizationId) {
      return workspace.organizations.find((organization) => organization.id === organizationId) ?? null;
    }
    if (propertyId) {
      const property = workspace.properties.find((item) => item.id === propertyId);
      return workspace.organizations.find((organization) => organization.id === property?.organizationId) ?? null;
    }
    if (storedOrganizationId) {
      const storedOrganization = workspace.organizations.find((organization) => organization.id === storedOrganizationId);
      if (storedOrganization) return storedOrganization;
    }
    return workspace.organizations[0] ?? null;
  }, [organizationId, propertyId, storedOrganizationId, workspace]);

  const selectedProperty = useMemo(() => {
    if (propertyId) return workspace.properties.find((property) => property.id === propertyId) ?? null;
    if (!selectedOrganization || !storedPropertyId) return null;
    const storedProperty = workspace.properties.find((property) => property.id === storedPropertyId);
    return storedProperty?.organizationId === selectedOrganization.id ? storedProperty : null;
  }, [propertyId, selectedOrganization, storedPropertyId, workspace]);

  const organizationProperties = useMemo(
    () => selectedOrganization ? getPropertiesForOrganization(workspace, selectedOrganization.id) : [],
    [selectedOrganization, workspace]
  );

  const summary = useMemo(() => getWorkspaceSummary(workspace), [workspace]);

  useEffect(() => {
    if (!selectedOrganization) return;
    window.localStorage.setItem(selectedOrganizationStorageKey, selectedOrganization.id);
  }, [selectedOrganization]);

  useEffect(() => {
    if (!selectedProperty) return;
    window.localStorage.setItem(selectedPropertyStorageKey, selectedProperty.id);
  }, [selectedProperty]);

  async function saveWorkspaceAction(body: unknown) {
    setIsSavingWorkspace(true);
    setWorkspaceError(null);
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { success: boolean; data?: WorkspaceState; error?: string };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Failed to save workspace');
      }
      setWorkspace(payload.data);
      return payload.data;
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : 'Failed to save workspace');
      throw error;
    } finally {
      setIsSavingWorkspace(false);
    }
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingOrganization) {
      await saveWorkspaceAction({
        action: 'updateOrganization',
        payload: {
          organizationId: editingOrganization.id,
          name: organizationName,
          icon: organizationIcon,
          description: organizationDescription,
        },
      });
      closeOrganizationModal();
      return;
    }

    const next = await saveWorkspaceAction({
      action: 'createOrganization',
      payload: { name: organizationName, icon: organizationIcon, description: organizationDescription },
    });
    const created = next.organizations[next.organizations.length - 1];
    closeOrganizationModal();
    router.push(organizationPath(created.id));
  }

  function openCreateOrganizationModal() {
    setOrganizationName('');
    setOrganizationIcon('');
    setOrganizationDescription('');
    setEditingOrganization(null);
    setIsCreateOrganizationOpen(true);
  }

  function openEditOrganizationModal(organization: OrganizationWorkspace) {
    setOrganizationName(organization.name);
    setOrganizationIcon(organization.icon);
    setOrganizationDescription(organization.description);
    setEditingOrganization(organization);
    setIsCreateOrganizationOpen(true);
  }

  function closeOrganizationModal() {
    setIsCreateOrganizationOpen(false);
    setEditingOrganization(null);
    setOrganizationName('');
    setOrganizationIcon('');
    setOrganizationDescription('');
  }

  function handleOrganizationImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setOrganizationIcon(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganization) return;

    if (editingProperty) {
      await handleUpdateProperty(editingProperty, {
        name: propertyName,
        location: propertyLocation,
        icon: propertyIcon,
        imageUrl: propertyImageUrl,
      });
      closePropertyModal();
      return;
    }

    const next = await saveWorkspaceAction({
      action: 'createProperty',
      payload: {
        organizationId: selectedOrganization.id,
        name: propertyName,
        location: propertyLocation,
        icon: propertyIcon,
        imageUrl: propertyImageUrl,
      },
    });
    const created = next.properties[next.properties.length - 1];
    closePropertyModal();
    router.push(propertyPath(created.id));
  }

  function openCreatePropertyModal() {
    setPropertyName('');
    setPropertyLocation('');
    setPropertyIcon('');
    setPropertyImageUrl('');
    setEditingProperty(null);
    setIsCreatePropertyOpen(true);
  }

  function openEditPropertyModal(property: PropertyWorkspace) {
    setPropertyName(property.name);
    setPropertyLocation(property.location);
    setPropertyIcon(property.icon);
    setPropertyImageUrl(property.imageUrl);
    setEditingProperty(property);
    setIsCreatePropertyOpen(true);
  }

  function closePropertyModal() {
    setIsCreatePropertyOpen(false);
    setEditingProperty(null);
    setPropertyName('');
    setPropertyLocation('');
    setPropertyIcon('');
    setPropertyImageUrl('');
  }

  function handlePropertyImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setPropertyImageUrl(reader.result);
    };
    reader.readAsDataURL(file);
  }

  async function handleUpdateProperty(property: PropertyWorkspace, updates: Pick<PropertyWorkspace, 'name' | 'location' | 'icon' | 'imageUrl'>) {
    await saveWorkspaceAction({
      action: 'updateProperty',
      payload: {
        propertyId: property.id,
        name: updates.name,
        location: updates.location,
        icon: updates.icon,
        imageUrl: updates.imageUrl,
      },
    });
  }

  async function handleDeleteProperty(property: PropertyWorkspace) {
    const confirmed = window.confirm(`Delete ${property.name}? This will also delete its chatbot settings.`);
    if (!confirmed) return;

    await saveWorkspaceAction({
      action: 'deleteProperty',
      payload: { propertyId: property.id },
    });
    router.push(organizationPath(property.organizationId));
  }

  async function handleDeleteOrganization(organization: OrganizationWorkspace) {
    const confirmed = window.confirm(
      `Delete ${organization.name}? This will also delete its child properties and chatbot settings.`
    );
    if (!confirmed) return;

    await saveWorkspaceAction({
      action: 'deleteOrganization',
      payload: { organizationId: organization.id },
    });
    router.push('/');
  }

  function updateSelectedChatbot(updates: Parameters<typeof updatePropertyChatbot>[2]) {
    if (!selectedProperty) return;
    setWorkspace((current) => updatePropertyChatbot(current, selectedProperty.id, updates));
  }

  async function persistSelectedChatbot() {
    if (!selectedProperty) return;
    await saveWorkspaceAction({
      action: 'updateChatbot',
      payload: { propertyId: selectedProperty.id, chatbot: selectedProperty.chatbot },
    });
  }

  async function persistSelectedKnowledgeBase(knowledgeText: string) {
    if (!selectedProperty) return;

    const knowledgeSources = knowledgeText.trim() ? [knowledgeText.trim()] : [];
    setWorkspace((current) => updatePropertyChatbot(current, selectedProperty.id, { knowledgeSources }));
    await saveWorkspaceAction({
      action: 'updateChatbot',
      payload: {
        propertyId: selectedProperty.id,
        chatbot: { knowledgeSources },
      },
    });
  }

  async function sendTestMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatInput.trim();
    if (!text || !selectedProperty || isSending) return;

    const userMessage: ChatMessage = { role: 'user', content: text };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setChatError(null);
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: false,
          propertyId: selectedProperty.id,
          systemPrompt: selectedProperty.chatbot.systemPrompt,
          retrieval: {
            topK: selectedProperty.chatbot.retrievalTopK,
            similarityThreshold: selectedProperty.chatbot.retrievalSimilarityThreshold,
            memoryMode: selectedProperty.chatbot.retrievalMemoryMode,
            historyWindow: selectedProperty.chatbot.retrievalHistoryWindow,
          },
          messages: [...chatMessages.filter((message) => message.role !== 'assistant' || message.content), userMessage],
        }),
      });
      const payload = (await response.json()) as {
        reply?: string;
        error?: string;
        retrieval?: {
          retrieval?: 'vector' | 'text';
          propertyId?: string;
          results?: ChatRetrievalResult[];
        };
      };
      if (!response.ok || payload.error) throw new Error(payload.error || 'Failed to send message');
      setLastRetrievalLog({
        retrieval: payload.retrieval?.retrieval,
        propertyId: payload.retrieval?.propertyId,
        memoryMode: selectedProperty.chatbot.retrievalMemoryMode,
        topK: selectedProperty.chatbot.retrievalTopK,
        similarityThreshold: selectedProperty.chatbot.retrievalSimilarityThreshold,
        historyWindow: selectedProperty.chatbot.retrievalHistoryWindow,
        results: payload.retrieval?.results || [],
      });
      setChatMessages((current) => [...current, { role: 'assistant', content: payload.reply || 'No response returned.' }]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Unexpected chat error');
    } finally {
      setIsSending(false);
    }
  }

  if (isLoadingWorkspace) {
    return (
      <main className="hamba-directory flex min-h-screen items-center justify-center p-6 text-slate-950">
        <CenteredPageLoader />
      </main>
    );
  }

  if (view === 'organizations') {
    return (
      <main className="hamba-directory min-h-screen p-4 text-slate-950 sm:p-6">
        <div className="mx-auto max-w-6xl">
          <TopNav
            organizations={workspace.organizations}
            properties={workspace.properties}
            organization={selectedOrganization}
            property={selectedProperty}
            isSavingWorkspace={isSavingWorkspace}
            showChatbotSelect={false}
            className="mb-6"
          />
          {workspaceError && (
            <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {workspaceError}
            </div>
          )}
          <OrganizationsView
            organizations={workspace.organizations}
            properties={workspace.properties}
            organizationName={organizationName}
            organizationIcon={organizationIcon}
            organizationDescription={organizationDescription}
            isCreateOpen={isCreateOrganizationOpen}
            isSavingWorkspace={isSavingWorkspace}
            editingOrganization={editingOrganization}
            onOrganizationNameChange={setOrganizationName}
            onOrganizationIconChange={setOrganizationIcon}
            onOrganizationDescriptionChange={setOrganizationDescription}
            onOpenCreate={openCreateOrganizationModal}
            onOpenEdit={openEditOrganizationModal}
            onCloseCreate={closeOrganizationModal}
            onDelete={handleDeleteOrganization}
            onOrganizationImageChange={handleOrganizationImageChange}
            onSubmit={handleCreateOrganization}
          />
        </div>
      </main>
    );
  }

  if (view === 'organization' && selectedOrganization) {
    return (
      <main className="hamba-directory min-h-screen p-4 text-slate-950 sm:p-6">
        <div className="mx-auto max-w-7xl">
          <TopNav
            organizations={workspace.organizations}
            properties={workspace.properties}
            organization={selectedOrganization}
            property={selectedProperty}
            isSavingWorkspace={isSavingWorkspace}
            showChatbotSelect={false}
            className="mb-6"
          />
          {workspaceError && (
            <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {workspaceError}
            </div>
          )}
          <OrganizationPropertiesView
            organization={selectedOrganization}
            properties={organizationProperties}
            propertyName={propertyName}
            propertyLocation={propertyLocation}
            propertyIcon={propertyIcon}
            propertyImageUrl={propertyImageUrl}
            isSavingWorkspace={isSavingWorkspace}
            isCreateOpen={isCreatePropertyOpen}
            editingProperty={editingProperty}
            onPropertyNameChange={setPropertyName}
            onPropertyLocationChange={setPropertyLocation}
            onPropertyIconChange={setPropertyIcon}
            onPropertyImageUrlChange={setPropertyImageUrl}
            onSubmit={handleCreateProperty}
            onOpenCreate={openCreatePropertyModal}
            onOpenEdit={openEditPropertyModal}
            onCloseCreate={closePropertyModal}
            onPropertyImageChange={handlePropertyImageChange}
            onDelete={handleDeleteProperty}
          />
        </div>
      </main>
    );
  }

  if ((view === 'property' || view === 'chatbot') && selectedProperty && selectedOrganization) {
    return (
        <PropertyChatbotWorkspaceView
        organizations={workspace.organizations}
        properties={workspace.properties}
        organization={selectedOrganization}
        property={selectedProperty}
        chatInput={chatInput}
          chatMessages={chatMessages}
          chatError={chatError}
          lastRetrievalLog={lastRetrievalLog}
        isSending={isSending}
        isSavingWorkspace={isSavingWorkspace}
        activeSettingsTab={activeSettingsTab}
        onChatInputChange={setChatInput}
        onSendTestMessage={sendTestMessage}
        onChatbotUpdate={updateSelectedChatbot}
        onPersistChatbot={persistSelectedChatbot}
        onPersistKnowledgeBase={persistSelectedKnowledgeBase}
        onDelete={handleDeleteProperty}
        onSettingsTabChange={setActiveSettingsTab}
      />
    );
  }

  return (
    <main className="hamba-assistant flex h-screen overflow-hidden text-slate-950">
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Workspace</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Property Assistants</h1>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          <NavLink href="/" active={false} label="Organizations" />
          <NavLink
            href={selectedOrganization ? organizationPath(selectedOrganization.id) : '/'}
            active={view === 'organization'}
            label="Properties"
          />
          <NavLink
            href={selectedProperty ? propertyPath(selectedProperty.id) : '/'}
            active={view === 'property' || view === 'chatbot'}
            label="Chatbot Workspace"
          />
        </nav>
        <div className="mt-2 border-y border-slate-200 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Selected</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">{selectedOrganization?.name ?? 'No organization'}</p>
          <p className="mt-1 text-xs text-slate-500">{selectedProperty?.name ?? 'No property selected'}</p>
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-slate-200 p-3">
          <Metric label="Orgs" value={summary.organizationCount} />
          <Metric label="Props" value={summary.propertyCount} />
          <Metric label="Bots" value={summary.chatbotCount} />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-slate-200 bg-white px-6 py-4">
          <TopNav
            organizations={workspace.organizations}
            properties={workspace.properties}
            organization={selectedOrganization}
            property={selectedProperty}
            isSavingWorkspace={isSavingWorkspace}
            showChatbotSelect={view === 'property' || view === 'chatbot'}
            className="mb-6"
          />
        </div>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{routeEyebrow(view)}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{routeTitle(view, selectedOrganization, selectedProperty)}</h2>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600">
            {isSavingWorkspace ? 'Saving...' : 'Supabase workspace connected'}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {workspaceError && (
            <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {workspaceError}
            </div>
          )}
          {view === 'organization' && selectedOrganization && (
            <OrganizationPropertiesView
              organization={selectedOrganization}
              properties={organizationProperties}
              propertyName={propertyName}
              propertyLocation={propertyLocation}
              propertyIcon={propertyIcon}
              propertyImageUrl={propertyImageUrl}
              isSavingWorkspace={isSavingWorkspace}
              isCreateOpen={isCreatePropertyOpen}
              editingProperty={editingProperty}
              onPropertyNameChange={setPropertyName}
              onPropertyLocationChange={setPropertyLocation}
              onPropertyIconChange={setPropertyIcon}
              onPropertyImageUrlChange={setPropertyImageUrl}
              onSubmit={handleCreateProperty}
              onOpenCreate={openCreatePropertyModal}
              onOpenEdit={openEditPropertyModal}
              onCloseCreate={closePropertyModal}
              onPropertyImageChange={handlePropertyImageChange}
              onDelete={handleDeleteProperty}
            />
          )}
          {(view === 'property' || view === 'chatbot') && selectedProperty && selectedOrganization && (
            <PropertyChatbotWorkspaceView
              organizations={workspace.organizations}
              properties={workspace.properties}
              organization={selectedOrganization}
              property={selectedProperty}
              chatInput={chatInput}
              chatMessages={chatMessages}
              chatError={chatError}
              lastRetrievalLog={lastRetrievalLog}
              isSending={isSending}
              isSavingWorkspace={isSavingWorkspace}
              activeSettingsTab={activeSettingsTab}
              onChatInputChange={setChatInput}
              onSendTestMessage={sendTestMessage}
              onChatbotUpdate={updateSelectedChatbot}
              onPersistChatbot={persistSelectedChatbot}
              onPersistKnowledgeBase={persistSelectedKnowledgeBase}
              onDelete={handleDeleteProperty}
              onSettingsTabChange={setActiveSettingsTab}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function TopNav({
  organizations,
  properties,
  organization,
  property,
  isSavingWorkspace,
  showChatbotSelect,
  className = '',
}: {
  organizations: OrganizationWorkspace[];
  properties: PropertyWorkspace[];
  organization: OrganizationWorkspace | null;
  property: PropertyWorkspace | null;
  isSavingWorkspace: boolean;
  showChatbotSelect: boolean;
  className?: string;
}) {
  const router = useRouter();
  const organizationProperties = organization
    ? properties.filter((item) => item.organizationId === organization.id)
    : [];

  function handleOrganizationChange(event: ChangeEvent<HTMLSelectElement>) {
    const organizationId = event.target.value;
    if (!organizationId) return;
    window.localStorage.setItem(selectedOrganizationStorageKey, organizationId);
    window.localStorage.removeItem(selectedPropertyStorageKey);
    router.push(organizationPath(organizationId));
  }

  function handlePropertyChange(event: ChangeEvent<HTMLSelectElement>) {
    const propertyId = event.target.value;
    if (!propertyId) return;
    const nextProperty = properties.find((item) => item.id === propertyId);
    if (nextProperty) {
      window.localStorage.setItem(selectedOrganizationStorageKey, nextProperty.organizationId);
    }
    window.localStorage.setItem(selectedPropertyStorageKey, propertyId);
    router.push(propertyPath(propertyId));
  }

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white pb-4 ${className}`.trim()}>
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm">
          PA
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Property Assistants</p>
          <p className="text-xs text-slate-500">Organization workspace</p>
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 md:justify-center">
        <TopNavSelect
          label="Organization"
          value={organization?.id ?? ''}
          disabled={organizations.length === 0}
          onChange={handleOrganizationChange}
        >
          {organizations.length === 0 ? (
            <option value="">No organizations</option>
          ) : (
            organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))
          )}
        </TopNavSelect>

        {showChatbotSelect && (
          <TopNavSelect
            label="Chatbot"
            value={property?.id ?? ''}
            disabled={organizationProperties.length === 0}
            onChange={handlePropertyChange}
          >
            {organizationProperties.length === 0 ? (
              <option value="">No chatbots</option>
            ) : (
              organizationProperties.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            )}
          </TopNavSelect>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          {isSavingWorkspace ? 'Saving...' : 'Connected'}
        </div>
        <UserMenu />
      </div>
    </div>
  );
}

function TopNavSelect({
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
}) {
  return (
    <label className="min-w-[15rem] border-b-2 border-slate-900 pb-1 text-left md:min-w-[16rem]">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="relative mt-0.5 block">
        <select
          value={value}
          disabled={disabled}
          onChange={onChange}
          className="w-full appearance-none bg-transparent py-0.5 pr-8 text-sm font-semibold text-slate-950 outline-none transition disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      </span>
    </label>
  );
}

function CenteredPageLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <LoaderCircle className="h-7 w-7 animate-spin text-blue-600" strokeWidth={2.2} />
      </div>
      <p className="text-sm font-medium text-slate-500">Loading workspace...</p>
    </div>
  );
}

function UserMenu() {
  const authBypassEnabled = isLocalAuthBypassEnabled();
  const [email, setEmail] = useState<string | null>(
    authBypassEnabled ? getLocalAuthBypassEmail() : null
  );

  useEffect(() => {
    if (authBypassEnabled) return;

    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [authBypassEnabled]);

  return (
    <div className="flex items-center gap-2">
      {email && (
        <span className="hidden max-w-[12rem] truncate text-xs font-medium text-slate-500 sm:inline">
          {email}
        </span>
      )}
      {authBypassEnabled ? (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Auth bypass on
        </span>
      ) : (
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      )}
    </div>
  );
}

function NavLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {label}
    </Link>
  );
}

function routeEyebrow(view: RouteView): string {
  if (view === 'organizations') return 'Organizations';
  if (view === 'organization') return 'Properties';
  return 'Chatbot workspace';
}

function routeTitle(
  view: RouteView,
  organization: OrganizationWorkspace | null,
  property: PropertyWorkspace | null
): string {
  if (view === 'organizations') return 'Manage parent organization cards';
  if (view === 'organization') return `Properties under ${organization?.name ?? 'organization'}`;
  return `${property?.name ?? 'Property'} chatbot workspace`;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-center">
      <p className="text-base font-semibold text-slate-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <TextField value={value} onChange={onChange} className="flex flex-col gap-1">
      <Label className="text-xs font-medium text-slate-500">{label}</Label>
      {multiline ? (
        <TextArea placeholder={placeholder} rows={4} className="resize-none" />
      ) : (
        <Input placeholder={placeholder} />
      )}
    </TextField>
  );
}

function PageHeading({
  title,
  context,
  countLabel,
}: {
  title: string;
  context: string;
  countLabel: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="border-l-4 border-cyan-400 pl-3 text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 pl-4 text-xs font-semibold text-slate-500">
          <span>{context}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{countLabel.split('/')[1]?.trim() ?? countLabel}</span>
        </div>
      </div>
      <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">{countLabel}</span>
    </div>
  );
}

function CreateTile({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-5 text-center shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-400 text-lg font-semibold text-slate-600">
        +
      </span>
      <span className="mt-2 text-sm font-bold text-blue-700">{title}</span>
      <span className="text-xs font-semibold text-slate-400">Open the setup form.</span>
    </button>
  );
}

function ImageIcon({ value, label }: { value: string; label: string }) {
  if (value.startsWith('data:image/') || value.startsWith('http://') || value.startsWith('https://')) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt={label} className="h-full w-full rounded-lg object-cover" />
    );
  }

  return <span>{value}</span>;
}

function CreateOrganizationModal({
  open,
  mode,
  organizationName,
  organizationIcon,
  organizationDescription,
  isSavingWorkspace,
  onOrganizationNameChange,
  onOrganizationIconChange,
  onOrganizationDescriptionChange,
  onOrganizationImageChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  organizationName: string;
  organizationIcon: string;
  organizationDescription: string;
  isSavingWorkspace: boolean;
  onOrganizationNameChange: (value: string) => void;
  onOrganizationIconChange: (value: string) => void;
  onOrganizationDescriptionChange: (value: string) => void;
  onOrganizationImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {mode === 'edit' ? 'Edit organization' : 'New organization'}
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              {mode === 'edit' ? 'Edit organization' : 'Create organization'}
            </h3>
          </div>
          <Button type="button" variant="ghost" size="sm" onPress={onClose}>
            Close
          </Button>
        </div>

        <label className="mx-auto mt-5 flex w-32 cursor-pointer flex-col items-center text-center">
          <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-3xl font-light text-slate-400 transition hover:border-blue-300 hover:bg-blue-50">
            {organizationIcon ? <ImageIcon value={organizationIcon} label={organizationName || 'Organization image'} /> : '+'}
          </span>
          <span className="mt-2 text-xs font-semibold text-blue-700">Add picture</span>
          <input type="file" accept="image/*" onChange={onOrganizationImageChange} className="sr-only" />
        </label>

        <div className="mt-5 space-y-4">
          <Field
            label="Organization name"
            value={organizationName}
            onChange={onOrganizationNameChange}
            placeholder="Organization name"
          />
          <Field
            label="Description"
            value={organizationDescription}
            onChange={onOrganizationDescriptionChange}
            placeholder="What this parent workspace manages"
            multiline
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onPress={() => onOrganizationIconChange('')}>
            Clear picture
          </Button>
          <Button type="submit" variant="primary" isDisabled={isSavingWorkspace}>
            {isSavingWorkspace ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create and open'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function CreatePropertyModal({
  open,
  mode,
  propertyName,
  propertyLocation,
  propertyIcon,
  propertyImageUrl,
  isSavingWorkspace,
  onPropertyNameChange,
  onPropertyLocationChange,
  onPropertyIconChange,
  onPropertyImageUrlChange,
  onPropertyImageChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  propertyName: string;
  propertyLocation: string;
  propertyIcon: string;
  propertyImageUrl: string;
  isSavingWorkspace: boolean;
  onPropertyNameChange: (value: string) => void;
  onPropertyLocationChange: (value: string) => void;
  onPropertyIconChange: (value: string) => void;
  onPropertyImageUrlChange: (value: string) => void;
  onPropertyImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {mode === 'edit' ? 'Edit property' : 'New property'}
            </p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">
              {mode === 'edit' ? 'Edit property' : 'Create property'}
            </h3>
          </div>
          <Button type="button" variant="ghost" size="sm" onPress={onClose}>
            Close
          </Button>
        </div>

        <label className="mx-auto mt-5 flex w-32 cursor-pointer flex-col items-center text-center">
          <span className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-3xl font-light text-slate-400 transition hover:border-blue-300 hover:bg-blue-50">
            {propertyImageUrl ? <ImageIcon value={propertyImageUrl} label={propertyName || 'Property image'} /> : '+'}
          </span>
          <span className="mt-2 text-xs font-semibold text-blue-700">Add picture</span>
          <input type="file" accept="image/*" onChange={onPropertyImageChange} className="sr-only" />
        </label>

        <div className="mt-5 space-y-4">
          <Field
            label="Property name"
            value={propertyName}
            onChange={onPropertyNameChange}
            placeholder="Property name"
          />
          <Field
            label="Location"
            value={propertyLocation}
            onChange={onPropertyLocationChange}
            placeholder="City, area"
          />
          <Field label="Icon label" value={propertyIcon} onChange={onPropertyIconChange} placeholder="P1" />
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onPress={() => onPropertyImageUrlChange('')}>
            Clear picture
          </Button>
          <Button type="submit" variant="primary" isDisabled={isSavingWorkspace}>
            {isSavingWorkspace ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create and open'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function OrganizationsView({
  organizations,
  properties,
  organizationName,
  organizationIcon,
  organizationDescription,
  isCreateOpen,
  isSavingWorkspace,
  editingOrganization,
  onOrganizationNameChange,
  onOrganizationIconChange,
  onOrganizationDescriptionChange,
  onOpenCreate,
  onOpenEdit,
  onCloseCreate,
  onDelete,
  onOrganizationImageChange,
  onSubmit,
}: {
  organizations: OrganizationWorkspace[];
  properties: PropertyWorkspace[];
  organizationName: string;
  organizationIcon: string;
  organizationDescription: string;
  isCreateOpen: boolean;
  isSavingWorkspace: boolean;
  editingOrganization: OrganizationWorkspace | null;
  onOrganizationNameChange: (value: string) => void;
  onOrganizationIconChange: (value: string) => void;
  onOrganizationDescriptionChange: (value: string) => void;
  onOpenCreate: () => void;
  onOpenEdit: (organization: OrganizationWorkspace) => void;
  onCloseCreate: () => void;
  onDelete: (organization: OrganizationWorkspace) => void;
  onOrganizationImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section>
      <PageHeading
        title="Organizations"
        context="Property Assistants"
        countLabel={`${organizations.length} / ${organizations.length} organizations`}
      />
      <div
        className={`grid gap-4 ${
          organizations.length === 0
            ? 'mx-auto max-w-xl md:grid-cols-1'
            : 'md:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {organizations.map((organization) => {
          const childCount = properties.filter((property) => property.organizationId === organization.id).length;
          return (
            <div
              key={organization.id}
              className="relative min-h-36 rounded-lg border border-slate-200 bg-white p-5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]"
            >
              <button
                type="button"
                onClick={() => onOpenEdit(organization)}
                className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                Edit
              </button>

              <Link
                href={organizationPath(organization.id)}
                onClick={() => {
                  window.localStorage.setItem(selectedOrganizationStorageKey, organization.id);
                  window.localStorage.removeItem(selectedPropertyStorageKey);
                }}
                className="block pr-16"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-50 text-sm font-semibold text-blue-700 ring-1 ring-blue-100">
                    <ImageIcon value={organization.icon} label={organization.name} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-blue-700">{organization.name}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{organization.description || 'No description set.'}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {childCount} properties
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => onDelete(organization)}
                className="mt-5 rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                Delete organization
              </button>
            </div>
          );
        })}

        <CreateTile title="Create organization" onClick={onOpenCreate} />
      </div>
      <CreateOrganizationModal
        open={isCreateOpen}
        mode={editingOrganization ? 'edit' : 'create'}
        organizationName={organizationName}
        organizationIcon={organizationIcon}
        organizationDescription={organizationDescription}
        isSavingWorkspace={isSavingWorkspace}
        onOrganizationNameChange={onOrganizationNameChange}
        onOrganizationIconChange={onOrganizationIconChange}
        onOrganizationDescriptionChange={onOrganizationDescriptionChange}
        onOrganizationImageChange={onOrganizationImageChange}
        onClose={onCloseCreate}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function OrganizationPropertiesView({
  organization,
  properties,
  propertyName,
  propertyLocation,
  propertyIcon,
  propertyImageUrl,
  isSavingWorkspace,
  isCreateOpen,
  editingProperty,
  onPropertyNameChange,
  onPropertyLocationChange,
  onPropertyIconChange,
  onPropertyImageUrlChange,
  onSubmit,
  onOpenCreate,
  onOpenEdit,
  onCloseCreate,
  onPropertyImageChange,
  onDelete,
}: {
  organization: OrganizationWorkspace;
  properties: PropertyWorkspace[];
  propertyName: string;
  propertyLocation: string;
  propertyIcon: string;
  propertyImageUrl: string;
  isSavingWorkspace: boolean;
  isCreateOpen: boolean;
  editingProperty: PropertyWorkspace | null;
  onPropertyNameChange: (value: string) => void;
  onPropertyLocationChange: (value: string) => void;
  onPropertyIconChange: (value: string) => void;
  onPropertyImageUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onOpenCreate: () => void;
  onOpenEdit: (property: PropertyWorkspace) => void;
  onCloseCreate: () => void;
  onPropertyImageChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onDelete: (property: PropertyWorkspace) => void;
}) {
  return (
    <section>
      <PageHeading
        title="Properties"
        context={organization.name}
        countLabel={`${properties.length} / ${properties.length} properties`}
      />
      <div
        className={`grid gap-4 ${
          properties.length === 0
            ? 'mx-auto max-w-xl md:grid-cols-1'
            : 'md:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            onOpenEdit={onOpenEdit}
            onDelete={onDelete}
          />
        ))}

        <CreateTile title="Create property" onClick={onOpenCreate} />
      </div>
      <CreatePropertyModal
        open={isCreateOpen}
        mode={editingProperty ? 'edit' : 'create'}
        propertyName={propertyName}
        propertyLocation={propertyLocation}
        propertyIcon={propertyIcon}
        propertyImageUrl={propertyImageUrl}
        isSavingWorkspace={isSavingWorkspace}
        onPropertyNameChange={onPropertyNameChange}
        onPropertyLocationChange={onPropertyLocationChange}
        onPropertyIconChange={onPropertyIconChange}
        onPropertyImageUrlChange={onPropertyImageUrlChange}
        onPropertyImageChange={onPropertyImageChange}
        onClose={onCloseCreate}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function PropertyCard({
  property,
  onOpenEdit,
  onDelete,
}: {
  property: PropertyWorkspace;
  onOpenEdit: (property: PropertyWorkspace) => void;
  onDelete: (property: PropertyWorkspace) => void;
}) {
  return (
    <div className="relative min-h-36 rounded-lg border border-slate-200 bg-white p-5 text-left shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]">
      <button
        type="button"
        onClick={() => onOpenEdit(property)}
        className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
      >
        Edit
      </button>

      <Link
        href={propertyPath(property.id)}
        onClick={() => {
          window.localStorage.setItem(selectedOrganizationStorageKey, property.organizationId);
          window.localStorage.setItem(selectedPropertyStorageKey, property.id);
        }}
        className="block pr-16"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-blue-50 text-sm font-semibold text-blue-700 ring-1 ring-blue-100">
            {property.imageUrl ? <ImageIcon value={property.imageUrl} label={property.name} /> : property.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-blue-700">{property.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{property.location}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Workspace ready
          </span>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => onDelete(property)}
        className="mt-5 rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
      >
        Delete property
      </button>
    </div>
  );
}

function PropertyChatbotWorkspaceView({
  organizations,
  properties,
  organization,
  property,
  chatInput,
  chatMessages,
  chatError,
  lastRetrievalLog,
  isSending,
  isSavingWorkspace,
  activeSettingsTab,
  onChatInputChange,
  onSendTestMessage,
  onChatbotUpdate,
  onPersistChatbot,
  onPersistKnowledgeBase,
  onDelete,
  onSettingsTabChange,
}: {
  organizations: OrganizationWorkspace[];
  properties: PropertyWorkspace[];
  organization: OrganizationWorkspace;
  property: PropertyWorkspace;
  chatInput: string;
  chatMessages: ChatMessage[];
  chatError: string | null;
  lastRetrievalLog: ChatRetrievalLog | null;
  isSending: boolean;
  isSavingWorkspace: boolean;
  activeSettingsTab: SettingsTab;
  onChatInputChange: (value: string) => void;
  onSendTestMessage: (event: FormEvent<HTMLFormElement>) => void;
  onChatbotUpdate: (updates: Parameters<typeof updatePropertyChatbot>[2]) => void;
  onPersistChatbot: () => void;
  onPersistKnowledgeBase: (knowledgeText: string) => Promise<void>;
  onDelete: (property: PropertyWorkspace) => void;
  onSettingsTabChange: (tab: SettingsTab) => void;
}) {
  const [isAppNavCollapsed, setIsAppNavCollapsed] = useState(false);
  const [isThreadsCollapsed, setIsThreadsCollapsed] = useState(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState<WorkspaceSection>('Chatbot');
  const workspaceNavItems: WorkspaceSection[] = ['Overview', 'Chatbot', 'Agents', 'Conversations', 'Knowledge Base', 'Analytics', 'Usage', 'Settings'];
  const providerOption = getProviderOption(property.chatbot.provider);
  const selectedModel = getModelValue(providerOption.value, property.chatbot.model);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (window.innerWidth < 1400) setIsSettingsCollapsed(true);
      if (window.innerWidth < 1050) setIsThreadsCollapsed(true);
      if (window.innerWidth < 900) setIsAppNavCollapsed(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="hamba-assistant flex h-screen overflow-hidden text-slate-950">
      <aside className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-all ${isAppNavCollapsed ? 'w-16' : 'w-56 xl:w-64'}`}>
        <div className={`flex h-16 items-center border-b border-slate-100 px-3 ${isAppNavCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xs font-bold">PA</div>
          {!isAppNavCollapsed && (
            <div>
              <p className="hamba-display text-[19px]">Property assistants</p>
              <p className="text-xs text-slate-500">Hamba operations</p>
            </div>
          )}
        </div>
        <div className={`border-b border-slate-200 px-3 py-5 ${isAppNavCollapsed ? 'text-center' : ''}`}>
          <div className={`flex ${isAppNavCollapsed ? 'justify-center' : 'items-center justify-between gap-3'}`}>
            {!isAppNavCollapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{property.name}</p>
                <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{organization.name}</p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsAppNavCollapsed((current) => !current)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50"
              aria-label={isAppNavCollapsed ? 'Expand workspace navigation' : 'Collapse workspace navigation'}
            >
              {isAppNavCollapsed ? '>' : '<'}
            </button>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {workspaceNavItems.map((item) => {
            const ItemIcon = workspaceSectionIcons[item];

            return (
              <div key={item}>
                <button
                  type="button"
                  title={item}
                  onClick={() => setActiveWorkspaceSection(item)}
                  className={`flex w-full items-center rounded-lg py-3 text-left text-sm font-medium transition ${
                    item === activeWorkspaceSection
                      ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                  } ${isAppNavCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
                      item === activeWorkspaceSection
                        ? 'border-blue-200 bg-white/80 text-blue-700'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}
                  >
                    <ItemIcon className="h-4 w-4" strokeWidth={2} />
                  </span>
                  {!isAppNavCollapsed && item}
                </button>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button
            type="button"
            onClick={() => onDelete(property)}
            title="Delete"
            className={`w-full rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 ${
              isAppNavCollapsed ? 'text-center' : 'text-left'
            }`}
          >
            {isAppNavCollapsed ? 'D' : 'Delete'}
          </button>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-200 px-4 pt-4 lg:px-6">
          <TopNav
            organizations={organizations}
            properties={properties}
            organization={organization}
            property={property}
            isSavingWorkspace={isSavingWorkspace}
            showChatbotSelect
          />
        </div>

        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 lg:px-6">
          <div>
            <p className="text-xs text-slate-500">Organization</p>
            <p className="text-sm font-semibold">{organization.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm font-semibold text-slate-600">
              Free Plan
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-700 text-sm font-bold text-white">
              {organization.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        {activeWorkspaceSection === 'Knowledge Base' ? (
          <KnowledgeBaseWorkspaceView
            key={property.id}
            organization={organization}
            property={property}
            initialKnowledgeText={property.chatbot.knowledgeSources.join('\n\n')}
            isSavingWorkspace={isSavingWorkspace}
            onPersistKnowledgeBase={onPersistKnowledgeBase}
          />
        ) : activeWorkspaceSection === 'Overview' ? (
          <OverviewWorkspaceView organization={organization} property={property} />
        ) : activeWorkspaceSection === 'Chatbot' ? (
        <div className="flex min-h-0 flex-1">
          {isThreadsCollapsed ? (
            <section className="flex w-12 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50/70 py-4">
              <button
                type="button"
                onClick={() => setIsThreadsCollapsed(false)}
                className="rounded-lg px-3 py-2 text-lg font-semibold text-slate-700 transition hover:bg-white"
                aria-label="Expand threads panel"
                >
                  {'>'}
              </button>
              <button className="mt-8 rounded-lg px-3 py-2 text-xl text-slate-700 transition hover:bg-white" title="New thread">+</button>
              <span className="mt-4 text-xs text-slate-500">1</span>
            </section>
          ) : (
            <section className="w-56 shrink-0 border-r border-slate-200 bg-slate-50/60 lg:w-64 xl:w-80">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
                <h3 className="text-lg font-bold">Threads <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">1</span></h3>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">+ New</button>
                  <button
                    type="button"
                    onClick={() => setIsThreadsCollapsed(true)}
                    className="rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-white"
                    aria-label="Collapse threads panel"
                  >
                    {'<'}
                  </button>
                </div>
              </div>
              <div className="border-b border-slate-200 p-4">
                <input
                  placeholder="Search threads..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </div>
              <div className="p-3">
                <div className="rounded-lg border-l-4 border-blue-600 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">New Conversation</p>
                    <span className="text-xs text-slate-400">Edit</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{chatMessages.filter((message) => message.role === 'user').length} messages</p>
                </div>
              </div>
            </section>
          )}

          <section className="flex min-w-0 flex-1 flex-col border-r border-slate-200 bg-white">
            <div className="flex h-20 items-center justify-between border-b border-slate-200 px-4">
              <div>
                <h1 className="text-[28px]">Tenant conversation</h1>
                <p className="text-sm text-slate-500">Assistant online <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /></p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(property)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
              >
                Delete
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="mr-auto max-w-md rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
                Welcome. How can I help with the property today?
              </div>
              {chatMessages.map((message, index) => (
                <div key={`${message.role}-${index}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                      message.role === 'user'
                        ? 'ml-auto bg-blue-600 text-white'
                        : 'mr-auto bg-slate-100 text-slate-700'
                    }`}
                  >
                    {message.content}
                  </div>
                  <p className={`mt-1 text-xs italic text-slate-400 ${message.role === 'user' ? 'text-right' : ''}`}>Just now</p>
                </div>
              ))}
              {chatError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {chatError}
                </div>
              )}
            </div>
            <form onSubmit={onSendTestMessage} className="border-t border-slate-200 p-4">
              <div className="flex items-center gap-3">
                <input
                  value={chatInput}
                  onChange={(event) => onChatInputChange(event.target.value)}
                  placeholder="Ask about this property..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
                <button
                  disabled={isSending}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? 'Sending' : 'Send'}
                </button>
              </div>
            </form>
          </section>

          {isSettingsCollapsed ? (
            <aside className="flex w-12 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-4">
              <button
                type="button"
                onClick={() => setIsSettingsCollapsed(false)}
                className="rounded-lg px-3 py-2 text-lg font-semibold text-slate-700 transition hover:bg-slate-50"
                aria-label="Expand settings panel"
              >
                {'<'}
              </button>
              <span className="mt-8 rotate-90 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">Settings</span>
            </aside>
          ) : (
          <aside className="w-72 shrink-0 overflow-y-auto bg-white p-4 xl:w-[420px] xl:p-6">
            <div className="mb-5 flex items-center gap-8 border-b border-slate-200">
              <button
                type="button"
                onClick={() => onSettingsTabChange('instructions')}
                className={`border-b-2 px-1 pb-3 text-sm font-semibold ${
                  activeSettingsTab === 'instructions'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500'
                }`}
              >
                Instructions
              </button>
              <button
                type="button"
                onClick={() => onSettingsTabChange('llm')}
                className={`border-b-2 px-1 pb-3 text-sm font-semibold ${
                  activeSettingsTab === 'llm'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500'
                }`}
              >
                Model
              </button>
              <button
                type="button"
                onClick={() => onSettingsTabChange('retrieval')}
                className={`border-b-2 px-1 pb-3 text-sm font-semibold ${
                  activeSettingsTab === 'retrieval'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500'
                }`}
              >
                Retrieval
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsCollapsed(true)}
                className="ml-auto rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
                aria-label="Collapse settings panel"
              >
                {'>'}
              </button>
            </div>

            {activeSettingsTab === 'instructions' ? (
              <div>
                <h2 className="text-lg font-bold">Instructions</h2>
                <p className="mt-2 text-sm text-slate-500">Set how this property chatbot should behave.</p>
                <div className="mt-5">
                  <Field
                    label="System instructions"
                    value={property.chatbot.systemPrompt}
                    onChange={(systemPrompt) => onChatbotUpdate({ systemPrompt })}
                    placeholder="How should this property assistant behave?"
                    multiline
                  />
                </div>
                <button
                  type="button"
                  onClick={onPersistChatbot}
                  disabled={isSavingWorkspace}
                  className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingWorkspace ? 'Saving...' : 'Save instructions'}
                </button>
              </div>
            ) : activeSettingsTab === 'retrieval' ? (
              <RetrievalSettingsPreview compact property={property} latestRetrievalLog={lastRetrievalLog} onChatbotUpdate={onChatbotUpdate} />
            ) : (
              <div className="space-y-7">
                <div>
                  <h2 className="text-lg font-bold">LLM Settings</h2>
                </div>
                <label className="block">
                  <span className="text-base font-semibold">Language Model</span>
                  <p className="mt-2 text-sm text-slate-500">Select the language model for natural language understanding and response generation.</p>
                  <select
                    value={providerOption.value}
                    onChange={(event) => {
                      const nextProvider = getProviderOption(event.target.value);
                      onChatbotUpdate({
                        provider: nextProvider.value,
                        model: nextProvider.models[0].value,
                      });
                    }}
                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                  >
                    {llmProviders.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-base font-semibold">Temperature: <span className="text-blue-700">{property.chatbot.temperature}</span></span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={property.chatbot.temperature}
                    onChange={(event) => onChatbotUpdate({ temperature: Number(event.target.value) })}
                    className="mt-4 w-full accent-blue-600"
                  />
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>0.0 Focused</span>
                    <span>1.0 Balanced</span>
                    <span>2.0 Creative</span>
                  </div>
                </label>
                <label className="block">
                  <span className="text-base font-semibold">Top-K: <span className="text-blue-700">10</span></span>
                  <input type="range" min="1" max="100" defaultValue="10" className="mt-4 w-full accent-blue-600" />
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>1 Restrictive</span>
                    <span>50 Balanced</span>
                    <span>100 Diverse</span>
                  </div>
                </label>
                <label className="block">
                  <span className="text-base font-semibold">Model</span>
                  <select
                    value={selectedModel}
                    onChange={(event) => onChatbotUpdate({ model: event.target.value })}
                    className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                  >
                    {providerOption.models.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onPersistChatbot}
                  disabled={isSavingWorkspace}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingWorkspace ? 'Saving...' : 'Save settings'}
                </button>
              </div>
            )}
          </aside>
          )}
        </div>
        ) : activeWorkspaceSection === 'Settings' ? (
          <SettingsWorkspaceView
            property={property}
            providerOption={providerOption}
            selectedModel={selectedModel}
            isSavingWorkspace={isSavingWorkspace}
            onChatbotUpdate={onChatbotUpdate}
            onPersistChatbot={onPersistChatbot}
            latestRetrievalLog={lastRetrievalLog}
          />
        ) : (
          <WorkspaceSectionPlaceholder section={activeWorkspaceSection} />
        )}
      </section>
    </main>
  );
}

function SettingsWorkspaceView({
  property,
  providerOption,
  selectedModel,
  isSavingWorkspace,
  onChatbotUpdate,
  onPersistChatbot,
  latestRetrievalLog,
}: {
  property: PropertyWorkspace;
  providerOption: ReturnType<typeof getProviderOption>;
  selectedModel: string;
  isSavingWorkspace: boolean;
  onChatbotUpdate: (updates: Parameters<typeof updatePropertyChatbot>[2]) => void;
  onPersistChatbot: () => void;
  latestRetrievalLog: ChatRetrievalLog | null;
}) {
  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-white p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-8 w-1 bg-cyan-400" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Settings</h1>
            <p className="mt-1 text-sm text-slate-500">Manage chatbot instructions, model behavior, and retrieval controls for {property.name}.</p>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Instructions</h2>
            <p className="mt-2 text-sm text-slate-500">Set how this property chatbot should behave. This is the dedicated settings section for the saved system prompt.</p>
            <div className="mt-5">
              <Field
                label="System instructions"
                value={property.chatbot.systemPrompt}
                onChange={(systemPrompt) => onChatbotUpdate({ systemPrompt })}
                placeholder="How should this property assistant behave?"
                multiline
              />
            </div>
            <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
              <h3 className="text-sm font-bold text-slate-950">Current system prompt</h3>
              <p className="mt-1 text-xs font-semibold text-slate-500">This instruction context is saved here, not inside the Knowledge Base editor.</p>
              <p className="mt-3 whitespace-pre-wrap rounded-lg border border-blue-100 bg-white p-3 text-sm leading-6 text-slate-700">
                {property.chatbot.systemPrompt || 'No system prompt saved yet.'}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Model</h2>
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">Language Model</span>
                <select
                  value={providerOption.value}
                  onChange={(event) => {
                    const nextProvider = getProviderOption(event.target.value);
                    onChatbotUpdate({
                      provider: nextProvider.value,
                      model: nextProvider.models[0].value,
                    });
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                >
                  {llmProviders.map((provider) => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">Model</span>
                <select
                  value={selectedModel}
                  onChange={(event) => onChatbotUpdate({ model: event.target.value })}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                >
                  {providerOption.models.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-900">Temperature: <span className="text-blue-700">{property.chatbot.temperature}</span></span>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={property.chatbot.temperature}
                  onChange={(event) => onChatbotUpdate({ temperature: Number(event.target.value) })}
                  className="mt-3 w-full accent-blue-600"
                />
              </label>
            </div>
          </section>

          <RetrievalSettingsPreview property={property} latestRetrievalLog={latestRetrievalLog} onChatbotUpdate={onChatbotUpdate} />
        </div>

        <button
          type="button"
          onClick={onPersistChatbot}
          disabled={isSavingWorkspace}
          className="mt-6 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSavingWorkspace ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </section>
  );
}

function RetrievalSettingsPreview({
  compact = false,
  property,
  latestRetrievalLog,
  onChatbotUpdate,
}: {
  compact?: boolean;
  property: PropertyWorkspace;
  latestRetrievalLog: ChatRetrievalLog | null;
  onChatbotUpdate: (updates: Parameters<typeof updatePropertyChatbot>[2]) => void;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-0 shadow-none' : 'p-5 shadow-sm xl:col-span-2'}`}>
      <div className={compact ? '' : 'max-w-3xl'}>
        <h2 className="text-lg font-bold text-slate-950">Retrieval Settings</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Configure how the chatbot pulls chunks from the property knowledge base during testing, then inspect the latest retrieval below.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">Chunks to retrieve</span>
            <input
              type="number"
              min={1}
              max={50}
              value={property.chatbot.retrievalTopK}
              onChange={(event) => onChatbotUpdate({ retrievalTopK: Math.max(1, Number(event.target.value) || 1) })}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">Memory mode</span>
            <select
              value={property.chatbot.retrievalMemoryMode}
              onChange={(event) => onChatbotUpdate({ retrievalMemoryMode: event.target.value as PropertyWorkspace['chatbot']['retrievalMemoryMode'] })}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            >
              <option value="hybrid">Hybrid: chat window + vector retrieval</option>
              <option value="rolling_window">Rolling chat window</option>
              <option value="summary_memory">Summary memory</option>
              <option value="retrieval_only">Retrieval only</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">Similarity threshold</span>
            <input
              type="number"
              min={0}
              max={1}
              step="0.05"
              value={property.chatbot.retrievalSimilarityThreshold}
              onChange={(event) =>
                onChatbotUpdate({
                  retrievalSimilarityThreshold: Math.min(1, Math.max(0, Number(event.target.value) || 0)),
                })
              }
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">Chat history window</span>
            <input
              type="number"
              min={1}
              max={100}
              value={property.chatbot.retrievalHistoryWindow}
              onChange={(event) => onChatbotUpdate({ retrievalHistoryWindow: Math.max(1, Number(event.target.value) || 1) })}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
            />
          </label>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Latest retrieval</span>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
              Mode: {latestRetrievalLog?.retrieval || 'not run'}
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-600">
              Memory: {latestRetrievalLog?.memoryMode || property.chatbot.retrievalMemoryMode}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span className="rounded-full bg-white px-2 py-1">top-k {latestRetrievalLog?.topK ?? property.chatbot.retrievalTopK}</span>
            <span className="rounded-full bg-white px-2 py-1">threshold {latestRetrievalLog?.similarityThreshold ?? property.chatbot.retrievalSimilarityThreshold}</span>
            <span className="rounded-full bg-white px-2 py-1">history {latestRetrievalLog?.historyWindow ?? property.chatbot.retrievalHistoryWindow}</span>
            <span className="rounded-full bg-white px-2 py-1">{latestRetrievalLog?.results.length ?? 0} chunks returned</span>
          </div>

          {latestRetrievalLog && latestRetrievalLog.results.length > 0 ? (
            <div className="mt-4 space-y-3">
              {latestRetrievalLog.results.map((result, index) => (
                <article key={`${result.source_id || result.title}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">{result.source_name || result.title}</p>
                    {typeof result.similarity === 'number' && (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        {result.similarity.toFixed(3)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {result.category} · chunk {(result.chunk_index ?? 0) + 1}
                    {typeof result.chunk_count === 'number' ? ` of ${result.chunk_count}` : ''}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Send a chatbot test message to inspect which chunks were retrieved.</p>
          )}
        </div>
      </div>
    </section>
  );
}

const overviewChannelLabels: Record<OverviewChannel, string> = {
  all: 'All channels',
  web: 'Web widget',
  whatsapp: 'WhatsApp',
};

function OverviewWorkspaceView({
  organization,
  property,
}: {
  organization: OrganizationWorkspace;
  property: PropertyWorkspace;
}) {
  const [selectedWindow, setSelectedWindow] = useState<OverviewWindow>('30d');
  const [selectedChannel, setSelectedChannel] = useState<OverviewChannel>('all');
  const [isWindowMenuOpen, setIsWindowMenuOpen] = useState(false);
  const [cache, setCache] = useState<Record<string, OverviewAnalyticsSummary>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `${property.id}:${selectedWindow}:${selectedChannel}`;
  const summary = cache[cacheKey] ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      if (cache[cacheKey]) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/analytics/overview?propertyId=${encodeURIComponent(property.id)}&window=${selectedWindow}&channel=${selectedChannel}`,
          { cache: 'force-cache' }
        );
        const payload = (await response.json()) as {
          success: boolean;
          data?: OverviewAnalyticsSummary;
          error?: string;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || 'Failed to load overview analytics');
        }

        if (!cancelled) {
          setCache((current) => ({ ...current, [cacheKey]: payload.data as OverviewAnalyticsSummary }));
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load overview analytics');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [cache, cacheKey, property.id, selectedChannel, selectedWindow]);

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-[#f7f8fc] px-8 py-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] bg-white p-10 shadow-[0_28px_90px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-10 w-1 rounded-full bg-emerald-400" />
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-slate-950">Overview</h1>
                <p className="mt-2 text-sm text-slate-500">
                  Cached analytics scaffold for {property.name}, ready for fingerprint-based user tracking.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-full border border-sky-100 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
            Phase 1 mock analytics
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-start gap-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsWindowMenuOpen((current) => !current)}
              className="flex min-w-56 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left text-2xl font-semibold text-slate-900 shadow-sm transition hover:border-slate-300"
            >
              <span>{getOverviewWindowLabel(selectedWindow)}</span>
              <ChevronDown className={`h-5 w-5 text-slate-500 transition ${isWindowMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {isWindowMenuOpen && (
              <div className="absolute left-0 top-[calc(100%+0.75rem)] z-20 min-w-56 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.15)]">
                {overviewWindows.map((windowOption) => (
                  <button
                    key={windowOption}
                    type="button"
                    onClick={() => {
                      setSelectedWindow(windowOption);
                      setIsWindowMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-xl transition ${
                      selectedWindow === windowOption
                        ? 'bg-slate-100 font-semibold text-slate-950'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{getOverviewWindowLabel(windowOption)}</span>
                    {selectedWindow === windowOption && <Check className="h-5 w-5 text-slate-700" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {overviewChannels.map((channelOption) => (
              <button
                key={channelOption}
                type="button"
                onClick={() => setSelectedChannel(channelOption)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectedChannel === channelOption
                    ? 'bg-slate-950 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {overviewChannelLabels[channelOption]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
            {organization.name}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
            Filter: {overviewChannelLabels[selectedChannel]}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium">
            Source mode: cached mock data
          </span>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading && !summary && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading overview analytics...
          </div>
        )}

        {summary && (
          <>
            <OverviewSectionTitle title={`Activity in the past ${summary.windowLabel}`} />
            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <OverviewMetricCard metric={summary.metrics.users} />
              <OverviewMetricCard metric={summary.metrics.tokens} />
              <OverviewMetricCard metric={summary.metrics.messages} />
            </div>

            <OverviewSectionTitle title={`Usage for the past ${summary.windowLabel}`} className="mt-10" />
            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <OverviewUsageCard usage={summary.usage.characters} />
              <OverviewUsageCard usage={summary.usage.tokens} />
              <OverviewUsageCard usage={summary.usage.messages} />
            </div>

            <div className="mt-8 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
              The current scaffold tracks unique users by fingerprint ID, channel, character volume, token volume, and message counts.
              Phase 2 can swap the mock event reader for a real Supabase query without changing the UI filter contract.
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function OverviewSectionTitle({ title, className = '' }: { title: string; className?: string }) {
  return <h2 className={`mt-10 text-2xl font-bold tracking-tight text-slate-950 ${className}`.trim()}>{title}</h2>;
}

function OverviewMetricCard({ metric }: { metric: OverviewAnalyticsSummary['metrics'][keyof OverviewAnalyticsSummary['metrics']] }) {
  return (
    <article className="flex min-h-48 flex-col justify-between rounded-[1.75rem] bg-[linear-gradient(135deg,#428df8_0%,#7e59f7_100%)] px-8 py-7 text-white shadow-[0_18px_40px_rgba(84,104,242,0.24)]">
      <p className="text-center text-5xl font-bold tracking-tight">{metric.value}</p>
      <div className="text-center">
        <p className="text-3xl font-semibold">{metric.label}</p>
        <p className="mt-2 text-sm text-white/80">{metric.detail}</p>
      </div>
    </article>
  );
}

function OverviewUsageCard({ usage }: { usage: OverviewAnalyticsSummary['usage'][keyof OverviewAnalyticsSummary['usage']] }) {
  return (
    <article className="flex min-h-56 flex-col items-center justify-center rounded-[1.75rem] bg-[linear-gradient(135deg,#428df8_0%,#7e59f7_100%)] px-8 py-7 text-white shadow-[0_18px_40px_rgba(84,104,242,0.24)]">
      <div className="flex h-28 w-28 items-center justify-center rounded-full border border-white/15 bg-white/5 text-4xl font-bold">
        {usage.percent}%
      </div>
      <p className="mt-6 text-3xl font-semibold">{usage.label}</p>
      <p className="mt-2 text-lg text-white/90">{usage.detail}</p>
    </article>
  );
}

function KnowledgeBaseWorkspaceView({
  organization,
  property,
  initialKnowledgeText,
  isSavingWorkspace,
  onPersistKnowledgeBase,
}: {
  organization: OrganizationWorkspace;
  property: PropertyWorkspace;
  initialKnowledgeText: string;
  isSavingWorkspace: boolean;
  onPersistKnowledgeBase: (knowledgeText: string) => Promise<void>;
}) {
  const [knowledgeText, setKnowledgeText] = useState(() => initialKnowledgeText);
  const [status, setStatus] = useState<string | null>(null);
  const [activeKnowledgeTab, setActiveKnowledgeTab] = useState('Overview');
  const [indexingStatus, setIndexingStatus] = useState<KnowledgeIndexingStatus | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [isIndexing, setIsIndexing] = useState(false);
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSourceEntry[]>([]);
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [retrievalResults, setRetrievalResults] = useState<KnowledgeSearchPreview[]>([]);
  const [retrievalMode, setRetrievalMode] = useState<'vector' | 'text' | null>(null);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isChunkSettingsOpen, setIsChunkSettingsOpen] = useState(false);
  const [chunkSettings, setChunkSettings] = useState<ChunkSettings>(() => {
    if (typeof window === 'undefined') {
      return defaultChunkSettings;
    }

    try {
      const saved = window.localStorage.getItem(getKnowledgeChunkSettingsStorageKey(property.id));
      return parseChunkSettings(saved ? JSON.parse(saved) : null);
    } catch {
      return defaultChunkSettings;
    }
  });
  const [chunkSettingsDraft, setChunkSettingsDraft] = useState<ChunkSettings>(() => chunkSettings);
  const characterCount = knowledgeText.length;
  const approximateTokens = Math.ceil(characterCount / 4);
  const knowledgeTabs = ['Overview', 'File', 'Text', 'Website', 'API', 'Database', 'Tools'];

  useEffect(() => {
    let cancelled = false;

    async function loadKnowledgeSources() {
      try {
        const response = await fetch(`/api/kb/list?propertyId=${property.id}`, { cache: 'no-store' });
        const payload = (await response.json()) as { success: boolean; data?: KnowledgeSourceEntry[] };
        if (!cancelled && response.ok && payload.success && Array.isArray(payload.data)) {
          setKnowledgeSources(payload.data);
          setSourceCount(payload.data.length);
        }
      } catch {
        if (!cancelled) {
          setKnowledgeSources([]);
          setSourceCount(0);
        }
      }
    }

    void loadKnowledgeSources();

    return () => {
      cancelled = true;
    };
  }, [property.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    try {
      await onPersistKnowledgeBase(knowledgeText);
      setStatus('Knowledge base updated.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to update knowledge base.');
    }
  }

  async function uploadKnowledgeSource({
    sourceType,
    sourceId,
    title,
    content,
    sourceName,
    metadata,
    overwrite,
  }: {
    sourceType: string;
    sourceId?: string;
    title: string;
    content: string;
    sourceName?: string;
    metadata?: Record<string, string | number | boolean | string[]>;
    overwrite?: boolean;
  }) {
    setIsIndexing(true);
    setStatus(null);
    setIndexingStatus(null);
    try {
      const response = await fetch('/api/kb/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: sourceType,
          title,
          content,
          sourceType,
          sourceId,
          sourceName: sourceName || title,
          metadata,
          overwrite,
          tags: ['workspace', sourceType],
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        error?: string;
        indexing?: KnowledgeIndexingStatus;
        data?: LegacyKnowledgeEntry;
      };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to index knowledge source');
      if (payload.data) {
        const nextSources = [payload.data as KnowledgeSourceEntry, ...knowledgeSources.filter((entry) => entry.id !== payload.data?.id)];
        setKnowledgeSources(nextSources);
        setSourceCount(nextSources.length);
      }
      if (payload.indexing) setIndexingStatus(payload.indexing);
      setStatus(payload.indexing?.status === 'indexed'
        ? `Vector indexed ${payload.indexing.chunkCount} chunk${payload.indexing.chunkCount === 1 ? '' : 's'}.`
        : payload.indexing?.error || 'Knowledge source saved; vector indexing was skipped.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to index knowledge source.');
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleTextIndex() {
    if (!knowledgeText.trim()) {
      setStatus('Add text before indexing.');
      return;
    }

    await uploadKnowledgeSource({
      sourceType: 'text',
      sourceId: `property:${property.id}:text`,
      title: `${property.name} text knowledge`,
      sourceName: `${property.name} Text`,
      content: knowledgeText,
      overwrite: true,
      metadata: {
        origin: 'workspace-text-tab',
        organizationId: organization.id,
        organizationName: organization.name,
        propertyId: property.id,
        propertyName: property.name,
        characterCount,
        approximateTokens,
        chunkStrategy: chunkSettings.strategy,
        chunkSize: chunkSettings.chunkSize,
        chunkOverlap: chunkSettings.chunkOverlap,
      },
    });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsIndexing(true);
    setStatus(null);
    setIndexingStatus(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('organizationId', organization.id);
      formData.set('organizationName', organization.name);
      formData.set('propertyId', property.id);
      formData.set('propertyName', property.name);
      formData.set('sourceType', 'file');
      formData.set('overwrite', 'false');
      formData.set('chunkStrategy', chunkSettings.strategy);
      formData.set('chunkSize', String(chunkSettings.chunkSize));
      formData.set('chunkOverlap', String(chunkSettings.chunkOverlap));

      const response = await fetch('/api/kb/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as {
        success: boolean;
        error?: string;
        indexing?: KnowledgeIndexingStatus;
        data?: KnowledgeSourceEntry;
      };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to upload knowledge file');
      if (payload.data) {
        const nextSources = [payload.data, ...knowledgeSources.filter((entry) => entry.id !== payload.data?.id)];
        setKnowledgeSources(nextSources);
        setSourceCount(nextSources.length);
      }
      if (payload.indexing) setIndexingStatus(payload.indexing);
      setStatus(payload.indexing?.status === 'indexed' ? `Uploaded and indexed ${file.name}.` : payload.indexing?.error || `Uploaded ${file.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to upload knowledge file.');
    } finally {
      setIsIndexing(false);
    }
    event.target.value = '';
  }

  async function handleDeleteKnowledgeSource(entry: KnowledgeSourceEntry) {
    setStatus(null);
    try {
      const response = await fetch('/api/kb/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          sourceId: entry.source_id,
          sourceType: entry.source_type,
          propertyId: property.id,
        }),
      });
      const payload = (await response.json()) as { success: boolean; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Failed to delete source');
      const nextSources = knowledgeSources.filter((source) => source.id !== entry.id);
      setKnowledgeSources(nextSources);
      setSourceCount(nextSources.length);
      setStatus(`Deleted ${entry.title}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete source.');
    }
  }

  async function handleRetrievalPreview() {
    if (!retrievalQuery.trim()) return;

    setIsRetrieving(true);
    setRetrievalResults([]);
    setRetrievalMode(null);
    try {
      const response = await fetch('/api/kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: retrievalQuery,
          propertyId: property.id,
          organizationId: organization.id,
          matchCount: property.chatbot.retrievalTopK,
          matchThreshold: property.chatbot.retrievalSimilarityThreshold,
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        retrieval?: 'vector' | 'text';
        data?: KnowledgeSearchPreview[];
        error?: string;
      };
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Retrieval preview failed');
      setRetrievalMode(payload.retrieval || 'text');
      setRetrievalResults(payload.data || []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Retrieval preview failed.');
    } finally {
      setIsRetrieving(false);
    }
  }

  function openChunkSettings() {
    setChunkSettingsDraft(chunkSettings);
    setIsChunkSettingsOpen(true);
  }

  function saveChunkSettings() {
    const normalizedSettings = {
      ...chunkSettingsDraft,
      chunkSize: Math.max(1, Math.round(chunkSettingsDraft.chunkSize || defaultChunkSettings.chunkSize)),
      chunkOverlap: Math.max(0, Math.round(chunkSettingsDraft.chunkOverlap || defaultChunkSettings.chunkOverlap)),
    };

    setChunkSettings(normalizedSettings);
    setChunkSettingsDraft(normalizedSettings);
    window.localStorage.setItem(getKnowledgeChunkSettingsStorageKey(property.id), JSON.stringify(normalizedSettings));
    setIsChunkSettingsOpen(false);
    setStatus('Chunk settings saved.');
  }

  return (
    <section className="min-w-0 flex-1 overflow-y-auto bg-white p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="h-8 w-1 bg-cyan-400" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Knowledge Base</h1>
            <p className="mt-1 text-sm text-slate-500">Store the context this property assistant should use.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-200">
            <div className="flex flex-wrap gap-6">
              {knowledgeTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveKnowledgeTab(tab)}
                  className={`border-b-2 px-1 pb-4 text-sm font-semibold ${
                    tab === activeKnowledgeTab
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-500 hover:text-slate-950'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {activeKnowledgeTab === 'Overview' && (
            <section className="mt-5 space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <KbMetric label="Session sources" value={sourceCount.toString()} />
                <KbMetric label="Vector model" value="text-embedding-3" />
                <KbMetric label="Dimensions" value="768" />
                <KbMetric label="Retrieval" value={indexingStatus?.status === 'indexed' ? 'Vector ready' : 'Fallback ready'} />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-0 flex-1">
                    <span className="text-sm font-bold text-slate-900">Retrieval preview</span>
                    <input
                      value={retrievalQuery}
                      onChange={(event) => setRetrievalQuery(event.target.value)}
                      placeholder="Ask something the uploaded knowledge should answer..."
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleRetrievalPreview}
                    disabled={isRetrieving || !retrievalQuery.trim()}
                    className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isRetrieving ? 'Searching...' : 'Test retrieval'}
                  </button>
                </div>
                {retrievalMode && (
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Mode: {retrievalMode === 'vector' ? 'Vector similarity' : 'Text fallback'}
                  </p>
                )}
                {retrievalResults.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {retrievalResults.map((result) => (
                      <article key={result.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{result.title}</p>
                          {typeof result.similarity === 'number' && (
                            <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                              {result.similarity.toFixed(3)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{result.source_name || result.source_type || 'Knowledge source'}</p>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{result.content}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeKnowledgeTab === 'File' && (
            <section className="mt-5 space-y-5">
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">+</div>
              <h2 className="mt-4 text-lg font-bold text-slate-950">Upload a file source</h2>
              <p className="mt-2 text-sm text-slate-500">Uploads are stored in Supabase Storage under this property, then indexed when the parser supports the file format.</p>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Current upload chunk settings: {getChunkStrategyLabel(chunkSettings.strategy)} · {chunkSettings.chunkSize}/{chunkSettings.chunkOverlap}
              </p>
              <label className="mt-5 inline-flex cursor-pointer rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
                {isIndexing ? 'Indexing...' : 'Choose file'}
                <input type="file" className="sr-only" onChange={handleFileChange} disabled={isIndexing} />
              </label>
              </div>

              <div className="space-y-3">
                {knowledgeSources.filter((entry) => entry.source_type === 'file').length > 0 ? (
                  knowledgeSources
                    .filter((entry) => entry.source_type === 'file')
                    .map((entry) => {
                      const metadata = (entry.metadata || {}) as Record<string, unknown>;
                      return (
                        <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-slate-950">{entry.title}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {String(metadata.fileType || 'unknown')} · {typeof metadata.fileSize === 'number' ? `${metadata.fileSize} bytes` : 'size unknown'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                <summary className="cursor-pointer font-semibold text-slate-700">Info</summary>
                                <div className="mt-2 space-y-1">
                                  <p>Parser: {String(metadata.parserType || 'unknown')}</p>
                                  <p>Status: {String(metadata.parserStatus || metadata.indexingStatus || 'unknown')}</p>
                                  <p>Chunking: {String(metadata.chunkStrategy || 'recursive_character')}</p>
                                  <p>Chunk size: {String(metadata.chunkSize || '-')}</p>
                                  <p>Overlap: {String(metadata.chunkOverlap || '-')}</p>
                                </div>
                              </details>
                              <button
                                type="button"
                                onClick={() => handleDeleteKnowledgeSource(entry)}
                                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                              >
                                X
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                    No files uploaded for this property yet.
                  </div>
                )}
              </div>
            </section>
          )}

          {activeKnowledgeTab === 'Text' && <label className="mt-5 block">
            <span className="sr-only">Knowledge base text</span>
            <textarea
              value={knowledgeText}
              onChange={(event) => {
                setKnowledgeText(event.target.value);
                setStatus(null);
              }}
              placeholder="Paste property details, FAQs, policies, pricing, service rules, or any other context this chatbot should know."
              className="min-h-[340px] w-full resize-y rounded-lg border border-slate-200 bg-slate-100 px-4 py-4 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-50"
            />
          </label>}

          {['Website', 'API', 'Database', 'Tools'].includes(activeKnowledgeTab) && (
            <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-8">
              <h2 className="text-lg font-bold text-slate-950">{activeKnowledgeTab} sources</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Metadata support is wired for this source type in the vector table. The next slice is the connector-specific
                ingestion form for {activeKnowledgeTab.toLowerCase()} content.
              </p>
            </section>
          )}

          <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isSavingWorkspace}
                className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingWorkspace ? 'Updating...' : 'Update chatbot'}
              </button>
              {activeKnowledgeTab === 'Text' && (
                <>
                  <button
                    type="button"
                    onClick={handleTextIndex}
                    disabled={isIndexing || !knowledgeText.trim()}
                    className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isIndexing ? 'Indexing...' : 'Index to vectors'}
                  </button>
                  <button
                    type="button"
                    onClick={openChunkSettings}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                    aria-label="Open chunk settings"
                    title="Chunk settings"
                  >
                    <SlidersHorizontal className="h-5 w-5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setKnowledgeText('');
                  setStatus(null);
                }}
                className="rounded-lg border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Clear text
              </button>
            </div>

            <div className="flex flex-col items-start gap-2 xl:items-end">
              <div className="flex flex-wrap justify-start gap-2 text-xs font-semibold text-slate-500 xl:justify-end">
                <span className="rounded-full bg-slate-100 px-3 py-1">{characterCount.toLocaleString()} characters</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">{approximateTokens.toLocaleString()} approx. tokens</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">{knowledgeText.trim() ? '1 text block' : 'No text saved'}</span>
                {activeKnowledgeTab === 'Text' && (
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                    {getChunkStrategyLabel(chunkSettings.strategy)} · {chunkSettings.chunkSize}/{chunkSettings.chunkOverlap}
                  </span>
                )}
              </div>
              {status && <p className="text-sm font-semibold text-slate-500 xl:text-right">{status}</p>}
            </div>
          </div>
        </form>
      </div>

      <ChunkSettingsModal
        open={isChunkSettingsOpen}
        value={chunkSettingsDraft}
        onClose={() => setIsChunkSettingsOpen(false)}
        onChange={setChunkSettingsDraft}
        onSave={saveChunkSettings}
      />
    </section>
  );
}

function KbMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-3 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ChunkSettingsModal({
  open,
  value,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean;
  value: ChunkSettings;
  onClose: () => void;
  onChange: (value: ChunkSettings) => void;
  onSave: () => void;
}) {
  if (!open) return null;

  const chunkStrategies: Array<{ value: ChunkStrategy; label: string }> = [
    { value: 'recursive_character', label: 'Recursive Character Splitter' },
    { value: 'sentence', label: 'Sentence Splitter' },
    { value: 'latex', label: 'LaTeX Splitter' },
    { value: 'markdown', label: 'Markdown Splitter' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Knowledge Base</p>
            <h3 className="mt-1 text-2xl font-bold text-slate-900">Chunk Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <fieldset>
            <legend className="text-base font-semibold text-slate-900">Chunk type</legend>
            <div className="mt-3 space-y-3">
              {chunkStrategies.map((strategy) => (
                <label key={strategy.value} className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="chunk-strategy"
                    checked={value.strategy === strategy.value}
                    onChange={() => onChange({ ...value, strategy: strategy.value })}
                    className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{strategy.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-600">Chunk Size</span>
              <input
                type="number"
                min={1}
                value={value.chunkSize}
                onChange={(event) =>
                  onChange({ ...value, chunkSize: Number(event.target.value) || defaultChunkSettings.chunkSize })
                }
                className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-50"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-600">Chunk Overlap</span>
              <input
                type="number"
                min={0}
                value={value.chunkOverlap}
                onChange={(event) =>
                  onChange({ ...value, chunkOverlap: Math.max(0, Number(event.target.value) || 0) })
                }
                className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-50"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="primary" onPress={onSave}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceSectionPlaceholder({ section }: { section: WorkspaceSection }) {
  return (
    <section className="flex min-w-0 flex-1 items-center justify-center bg-white p-8">
      <div className="max-w-md rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <h1 className="text-2xl font-bold text-slate-950">{section}</h1>
        <p className="mt-2 text-sm text-slate-500">This workspace section is ready for its next page design.</p>
      </div>
    </section>
  );
}
