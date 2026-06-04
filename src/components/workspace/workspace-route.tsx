'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { getLocalAuthBypassEmail, isLocalAuthBypassEnabled } from '@/lib/auth/local-testing';
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
type SettingsTab = 'llm' | 'instructions' | 'knowledge' | 'templates';
type WorkspaceSection =
  | 'Overview'
  | 'Chatbot'
  | 'Agents'
  | 'Conversations'
  | 'Knowledge Base'
  | 'Analytics'
  | 'Usage'
  | 'Settings'
  | 'Deploy';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
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
    { role: 'assistant', content: 'Adjust this property assistant, then send a test message.' },
  ]);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('llm');
  const [isCreateOrganizationOpen, setIsCreateOrganizationOpen] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<OrganizationWorkspace | null>(null);
  const [isCreatePropertyOpen, setIsCreatePropertyOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<PropertyWorkspace | null>(null);
  const [isSending, setIsSending] = useState(false);

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
    return workspace.organizations[0] ?? null;
  }, [organizationId, propertyId, workspace]);

  const selectedProperty = useMemo(() => {
    if (propertyId) return workspace.properties.find((property) => property.id === propertyId) ?? null;
    if (!selectedOrganization) return null;
    return getPropertiesForOrganization(workspace, selectedOrganization.id)[0] ?? null;
  }, [propertyId, selectedOrganization, workspace]);

  const organizationProperties = useMemo(
    () => selectedOrganization ? getPropertiesForOrganization(workspace, selectedOrganization.id) : [],
    [selectedOrganization, workspace]
  );

  const summary = useMemo(() => getWorkspaceSummary(workspace), [workspace]);

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
          systemPrompt: selectedProperty.chatbot.systemPrompt,
          messages: [...chatMessages.filter((message) => message.role !== 'assistant' || message.content), userMessage],
        }),
      });
      const payload = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error || 'Failed to send message');
      setChatMessages((current) => [...current, { role: 'assistant', content: payload.reply || 'No response returned.' }]);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Unexpected chat error');
    } finally {
      setIsSending(false);
    }
  }

  if (view === 'organizations') {
    return (
      <main className="min-h-screen bg-white p-4 text-slate-950 sm:p-6">
        <div className="mx-auto max-w-6xl">
          <TopNav
            view={view}
            organization={selectedOrganization}
            property={selectedProperty}
            isLoadingWorkspace={isLoadingWorkspace}
            isSavingWorkspace={isSavingWorkspace}
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
      <main className="min-h-screen bg-white p-4 text-slate-950 sm:p-6">
        <div className="mx-auto max-w-7xl">
          <TopNav
            view={view}
            organization={selectedOrganization}
            property={selectedProperty}
            isLoadingWorkspace={isLoadingWorkspace}
            isSavingWorkspace={isSavingWorkspace}
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
        organization={selectedOrganization}
        property={selectedProperty}
        chatInput={chatInput}
        chatMessages={chatMessages}
        chatError={chatError}
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
    <main className="flex h-screen overflow-hidden bg-white text-slate-950">
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
            view={view}
            organization={selectedOrganization}
            property={selectedProperty}
            isLoadingWorkspace={isLoadingWorkspace}
            isSavingWorkspace={isSavingWorkspace}
          />
        </div>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{routeEyebrow(view)}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{routeTitle(view, selectedOrganization, selectedProperty)}</h2>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600">
            {isLoadingWorkspace ? 'Loading workspace...' : isSavingWorkspace ? 'Saving...' : 'Supabase workspace connected'}
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
              organization={selectedOrganization}
              property={selectedProperty}
              chatInput={chatInput}
              chatMessages={chatMessages}
              chatError={chatError}
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
  view,
  organization,
  property,
  isLoadingWorkspace,
  isSavingWorkspace,
}: {
  view: RouteView;
  organization: OrganizationWorkspace | null;
  property: PropertyWorkspace | null;
  isLoadingWorkspace: boolean;
  isSavingWorkspace: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white pb-4">
      <Link href="/" className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm">
          PA
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Property Assistants</p>
          <p className="text-xs text-slate-500">Organization workspace</p>
        </div>
      </Link>

      <nav className="flex flex-wrap items-center gap-2">
        <TopNavLink href="/" active={view === 'organizations'} label="Organizations" />
        <TopNavLink
          href={organization ? organizationPath(organization.id) : '/'}
          active={view === 'organization'}
          label="Properties"
          disabled={!organization}
        />
        <TopNavLink
          href={property ? propertyPath(property.id) : organization ? organizationPath(organization.id) : '/'}
          active={view === 'property' || view === 'chatbot'}
          label="Workspace"
          disabled={!property}
        />
      </nav>

      <div className="flex items-center gap-2">
        <div className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          {isLoadingWorkspace ? 'Loading...' : isSavingWorkspace ? 'Saving...' : 'Connected'}
        </div>
        <UserMenu />
      </div>
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
          <button
            type="submit"
            className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
      )}
    </div>
  );
}

function TopNavLink({
  href,
  active,
  label,
  disabled = false,
}: {
  href: string;
  active: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-disabled={disabled}
      className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-blue-50 text-blue-700'
          : disabled
            ? 'pointer-events-none text-slate-300'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      {label}
    </Link>
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
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
        />
      )}
    </label>
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Close
          </button>
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
          <button
            type="button"
            onClick={() => onOrganizationIconChange('')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Clear picture
          </button>
          <button
            disabled={isSavingWorkspace}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingWorkspace ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create and open'}
          </button>
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Close
          </button>
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
          <button
            type="button"
            onClick={() => onPropertyImageUrlChange('')}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            Clear picture
          </button>
          <button
            disabled={isSavingWorkspace}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingWorkspace ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create and open'}
          </button>
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

              <Link href={organizationPath(organization.id)} className="block pr-16">
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

      <Link href={propertyPath(property.id)} className="block pr-16">
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
  organization,
  property,
  chatInput,
  chatMessages,
  chatError,
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
  organization: OrganizationWorkspace;
  property: PropertyWorkspace;
  chatInput: string;
  chatMessages: ChatMessage[];
  chatError: string | null;
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
  const workspaceNavItems: WorkspaceSection[] = ['Overview', 'Chatbot', 'Agents', 'Conversations', 'Knowledge Base', 'Analytics', 'Usage', 'Settings', 'Deploy'];
  const providerOption = getProviderOption(property.chatbot.provider);
  const selectedModel = getModelValue(providerOption.value, property.chatbot.model);

  return (
    <main className="flex h-screen overflow-hidden bg-white text-slate-950">
      <aside className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-all ${isAppNavCollapsed ? 'w-16' : 'w-64'}`}>
        <div className={`flex h-16 items-center border-b border-slate-100 px-3 ${isAppNavCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-xs font-bold">PA</div>
          {!isAppNavCollapsed && (
            <div>
              <p className="text-base font-semibold">Property Assistants</p>
              <p className="text-xs text-slate-500">Workspace</p>
            </div>
          )}
        </div>
        <div className={`border-b border-slate-200 px-3 py-5 ${isAppNavCollapsed ? 'text-center' : ''}`}>
          {!isAppNavCollapsed && (
            <>
              <p className="text-sm font-semibold">{property.name}</p>
              <p className="text-xs text-slate-500">{organization.name}</p>
            </>
          )}
          <button
            type="button"
            onClick={() => setIsAppNavCollapsed((current) => !current)}
            className={`rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 ${
              isAppNavCollapsed ? 'mt-0' : 'mt-4'
            }`}
            aria-label={isAppNavCollapsed ? 'Expand workspace navigation' : 'Collapse workspace navigation'}
          >
            {isAppNavCollapsed ? '>' : '<'}
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {workspaceNavItems.map((item) => (
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
                <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-[10px]">
                  {item.slice(0, 1)}
                </span>
                {!isAppNavCollapsed && item}
              </button>
            </div>
          ))}
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-6">
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
            systemPrompt={property.chatbot.systemPrompt}
            isSavingWorkspace={isSavingWorkspace}
            onPersistKnowledgeBase={onPersistKnowledgeBase}
          />
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
            <section className="w-80 shrink-0 border-r border-slate-200 bg-slate-50/60">
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
                <h1 className="text-2xl font-bold">Chatbot</h1>
                <p className="text-sm text-slate-500">Online <span className="ml-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /></p>
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
                Welcome! How can I assist you today?
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
                  placeholder="Type your message..."
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
          <aside className="w-[420px] shrink-0 overflow-y-auto bg-white p-6">
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
                  activeSettingsTab !== 'instructions'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500'
                }`}
              >
                Settings
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
        ) : (
          <WorkspaceSectionPlaceholder section={activeWorkspaceSection} />
        )}
      </section>
    </main>
  );
}

function KnowledgeBaseWorkspaceView({
  organization,
  property,
  initialKnowledgeText,
  systemPrompt,
  isSavingWorkspace,
  onPersistKnowledgeBase,
}: {
  organization: OrganizationWorkspace;
  property: PropertyWorkspace;
  initialKnowledgeText: string;
  systemPrompt: string;
  isSavingWorkspace: boolean;
  onPersistKnowledgeBase: (knowledgeText: string) => Promise<void>;
}) {
  const [knowledgeText, setKnowledgeText] = useState(initialKnowledgeText);
  const [status, setStatus] = useState<string | null>(null);
  const [activeKnowledgeTab, setActiveKnowledgeTab] = useState('Overview');
  const [indexingStatus, setIndexingStatus] = useState<KnowledgeIndexingStatus | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [isIndexing, setIsIndexing] = useState(false);
  const [retrievalQuery, setRetrievalQuery] = useState('');
  const [retrievalResults, setRetrievalResults] = useState<KnowledgeSearchPreview[]>([]);
  const [retrievalMode, setRetrievalMode] = useState<'vector' | 'text' | null>(null);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const characterCount = knowledgeText.length;
  const approximateTokens = Math.ceil(characterCount / 4);
  const knowledgeTabs = ['Overview', 'File', 'Text', 'Website', 'API', 'Database', 'Tools'];

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
      if (payload.data) setSourceCount((current) => Math.max(current, 1));
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
      },
    });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    await uploadKnowledgeSource({
      sourceType: 'file',
      sourceId: `property:${property.id}:file:${file.name}`,
      title: file.name,
      sourceName: file.name,
      content: text,
      metadata: {
        origin: 'workspace-file-tab',
        fileName: file.name,
        fileType: file.type || 'unknown',
        fileSize: file.size,
      },
    });
    event.target.value = '';
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
        body: JSON.stringify({ query: retrievalQuery, matchCount: 5 }),
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
            <section className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">+</div>
              <h2 className="mt-4 text-lg font-bold text-slate-950">Upload a file source</h2>
              <p className="mt-2 text-sm text-slate-500">TXT, CSV, Markdown, and other text-readable files can be indexed now. PDF/DOC parsing can be added next.</p>
              <label className="mt-5 inline-flex cursor-pointer rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
                {isIndexing ? 'Indexing...' : 'Choose file'}
                <input type="file" className="sr-only" onChange={handleFileChange} disabled={isIndexing} />
              </label>
            </section>
          )}

          {activeKnowledgeTab === 'Text' && <section className="mt-5 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-950">Current system prompt</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">This is the instruction context saved for this property chatbot.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setKnowledgeText((current) => {
                    const trimmedPrompt = systemPrompt.trim();
                    if (!trimmedPrompt) return current;
                    if (!current.trim()) return trimmedPrompt;
                    if (current.includes(trimmedPrompt)) return current;
                    return `${current.trim()}\n\n${trimmedPrompt}`;
                  });
                  setStatus('System prompt added to the editor.');
                }}
                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                Add to text
              </button>
            </div>
            <p className="mt-3 whitespace-pre-wrap rounded-lg border border-blue-100 bg-white p-3 text-sm leading-6 text-slate-700">
              {systemPrompt || 'No system prompt saved yet.'}
            </p>
          </section>}

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

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <span className="rounded-full bg-slate-100 px-3 py-1">{characterCount.toLocaleString()} characters</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{approximateTokens.toLocaleString()} approx. tokens</span>
              <span className="rounded-full bg-slate-100 px-3 py-1">{knowledgeText.trim() ? '1 text block' : 'No text saved'}</span>
            </div>
            {status && <p className="text-sm font-semibold text-slate-500">{status}</p>}
          </div>

          <div className="mt-5 flex items-center gap-4">
            <button
              type="submit"
              disabled={isSavingWorkspace}
              className="rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingWorkspace ? 'Updating...' : 'Update chatbot'}
            </button>
            {activeKnowledgeTab === 'Text' && (
              <button
                type="button"
                onClick={handleTextIndex}
                disabled={isIndexing || !knowledgeText.trim()}
                className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isIndexing ? 'Indexing...' : 'Index to vectors'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setKnowledgeText(systemPrompt.trim())}
              className="rounded-lg border border-blue-100 px-5 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
            >
              Use system prompt
            </button>
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
        </form>
      </div>
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
