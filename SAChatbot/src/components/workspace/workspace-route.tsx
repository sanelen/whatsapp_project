'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
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

type RouteView = 'organizations' | 'organization' | 'property' | 'chatbot';
type SettingsTab = 'llm' | 'instructions' | 'knowledge' | 'templates';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

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
    setPropertyName('');
    setPropertyLocation('');
    setPropertyIcon('');
    setPropertyImageUrl('');
    router.push(propertyPath(created.id));
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
            onPropertyNameChange={setPropertyName}
            onPropertyLocationChange={setPropertyLocation}
            onPropertyIconChange={setPropertyIcon}
            onPropertyImageUrlChange={setPropertyImageUrl}
            onSubmit={handleCreateProperty}
            onUpdate={handleUpdateProperty}
            onDelete={handleDeleteProperty}
          />
        </div>
      </main>
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
              onPropertyNameChange={setPropertyName}
              onPropertyLocationChange={setPropertyLocation}
              onPropertyIconChange={setPropertyIcon}
              onPropertyImageUrlChange={setPropertyImageUrl}
              onSubmit={handleCreateProperty}
              onUpdate={handleUpdateProperty}
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

      <div className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
        {isLoadingWorkspace ? 'Loading...' : isSavingWorkspace ? 'Saving...' : 'Connected'}
      </div>
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

function CreatePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-36 rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 px-4 py-6 text-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-400 text-lg font-semibold text-slate-600">
          +
        </div>
        <h3 className="mt-2 text-sm font-bold text-blue-700">{title}</h3>
        <p className="text-xs font-semibold text-slate-400">Add another card to this page.</p>
      </div>
      {children}
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
  onPropertyNameChange,
  onPropertyLocationChange,
  onPropertyIconChange,
  onPropertyImageUrlChange,
  onSubmit,
  onUpdate,
  onDelete,
}: {
  organization: OrganizationWorkspace;
  properties: PropertyWorkspace[];
  propertyName: string;
  propertyLocation: string;
  propertyIcon: string;
  propertyImageUrl: string;
  isSavingWorkspace: boolean;
  onPropertyNameChange: (value: string) => void;
  onPropertyLocationChange: (value: string) => void;
  onPropertyIconChange: (value: string) => void;
  onPropertyImageUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (property: PropertyWorkspace, updates: Pick<PropertyWorkspace, 'name' | 'location' | 'icon' | 'imageUrl'>) => void;
  onDelete: (property: PropertyWorkspace) => void;
}) {
  return (
    <section>
      <PageHeading
        title="Properties"
        context={organization.name}
        countLabel={`${properties.length} / ${properties.length} properties`}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {properties.map((property) => (
          <PropertyCard
            key={property.id}
            property={property}
            isSavingWorkspace={isSavingWorkspace}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}

        <CreatePanel title="Create property">
          <form onSubmit={onSubmit} className="space-y-3">
            <Field label="Name" value={propertyName} onChange={onPropertyNameChange} placeholder="Property name" />
            <Field label="Location" value={propertyLocation} onChange={onPropertyLocationChange} placeholder="City, area" />
            <Field label="Icon" value={propertyIcon} onChange={onPropertyIconChange} placeholder="P1" />
            <Field label="Image URL" value={propertyImageUrl} onChange={onPropertyImageUrlChange} placeholder="Optional image URL" />
            <button className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500">
              Create property
            </button>
          </form>
        </CreatePanel>
      </div>
    </section>
  );
}

function PropertyCard({
  property,
  isSavingWorkspace,
  onUpdate,
  onDelete,
}: {
  property: PropertyWorkspace;
  isSavingWorkspace: boolean;
  onUpdate: (property: PropertyWorkspace, updates: Pick<PropertyWorkspace, 'name' | 'location' | 'icon' | 'imageUrl'>) => void;
  onDelete: (property: PropertyWorkspace) => void;
}) {
  const [draftName, setDraftName] = useState(property.name);
  const [draftLocation, setDraftLocation] = useState(property.location);
  const [draftIcon, setDraftIcon] = useState(property.icon);
  const [draftImageUrl, setDraftImageUrl] = useState(property.imageUrl);

  function saveProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onUpdate(property, {
      name: draftName,
      location: draftLocation,
      icon: draftIcon,
      imageUrl: draftImageUrl,
    });
  }

  return (
    <form
      onSubmit={saveProperty}
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]"
    >
      <Link href={propertyPath(property.id)} className="block text-left">
        <div className="flex h-28 items-center justify-center bg-slate-50 text-2xl font-semibold text-slate-400">
          {property.imageUrl ? property.imageUrl : property.icon}
        </div>
        <div className="p-4">
          <h3 className="text-base font-semibold text-blue-700">{property.name}</h3>
          <p className="mt-1 text-sm text-slate-500">{property.location}</p>
        </div>
      </Link>
      <div className="space-y-3 px-4 pb-4">
        <Field label="Name" value={draftName} onChange={setDraftName} placeholder="Property name" />
        <Field label="Location" value={draftLocation} onChange={setDraftLocation} placeholder="City, area" />
        <Field label="Icon" value={draftIcon} onChange={setDraftIcon} placeholder="P1" />
        <Field label="Image URL" value={draftImageUrl} onChange={setDraftImageUrl} placeholder="Optional image URL" />
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={isSavingWorkspace}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingWorkspace ? 'Saving...' : 'Save details'}
          </button>
          <Link
            href={propertyPath(property.id)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Open
          </Link>
        </div>
        <button
          type="button"
          onClick={() => onDelete(property)}
          className="rounded-lg border border-red-100 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
        >
          Delete property
        </button>
      </div>
    </form>
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
  onDelete: (property: PropertyWorkspace) => void;
  onSettingsTabChange: (tab: SettingsTab) => void;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="flex min-h-[680px] flex-col rounded-lg border border-slate-200 bg-white shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{organization.name}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{property.name} assistant</h3>
              <p className="mt-1 text-xs text-slate-500">{property.location}</p>
            </div>
            <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{property.icon}</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {chatMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-lg px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'ml-10 bg-blue-600 text-white'
                  : 'mr-10 bg-slate-100 text-slate-700'
              }`}
            >
              {message.content}
            </div>
          ))}
          {chatError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
              {chatError}
            </div>
          )}
        </div>
        <form onSubmit={onSendTestMessage} className="border-t border-slate-200 p-4">
          <textarea
            value={chatInput}
            onChange={(event) => onChatInputChange(event.target.value)}
            placeholder="Ask this property assistant a question"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
          />
          <button
            disabled={isSending}
            className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? 'Sending...' : 'Send test message'}
          </button>
        </form>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Settings</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-950">Chatbot configuration</h3>
            </div>
            <button
              type="button"
              onClick={onPersistChatbot}
              disabled={isSavingWorkspace}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingWorkspace ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <SettingsTabButton active={activeSettingsTab === 'llm'} onClick={() => onSettingsTabChange('llm')} label="LLM" />
            <SettingsTabButton active={activeSettingsTab === 'instructions'} onClick={() => onSettingsTabChange('instructions')} label="Instructions" />
            <SettingsTabButton active={activeSettingsTab === 'knowledge'} onClick={() => onSettingsTabChange('knowledge')} label="Knowledge" />
            <SettingsTabButton active={activeSettingsTab === 'templates'} onClick={() => onSettingsTabChange('templates')} label="Templates" />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          {activeSettingsTab === 'llm' && (
            <div className="space-y-3">
              <Field label="Provider" value={property.chatbot.provider} onChange={(provider) => onChatbotUpdate({ provider })} placeholder="openai" />
              <Field label="Model" value={property.chatbot.model} onChange={(model) => onChatbotUpdate({ model })} placeholder="gpt-5.4" />
              <label className="block">
                <span className="text-xs font-medium text-slate-500">Temperature</span>
                <input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={property.chatbot.temperature}
                  onChange={(event) => onChatbotUpdate({ temperature: Number(event.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-50"
                />
              </label>
            </div>
          )}

          {activeSettingsTab === 'instructions' && (
            <Field
              label="System instructions"
              value={property.chatbot.systemPrompt}
              onChange={(systemPrompt) => onChatbotUpdate({ systemPrompt })}
              placeholder="How should this property assistant behave?"
              multiline
            />
          )}

          {activeSettingsTab === 'knowledge' && (
            <div className="space-y-4">
              <StudioList title="Knowledge base" items={property.chatbot.knowledgeSources} />
              <StudioList title="Quick replies" items={property.chatbot.quickReplies} />
            </div>
          )}

          {activeSettingsTab === 'templates' && (
            <StudioList title="WhatsApp templates" items={property.chatbot.whatsappTemplates} />
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Property record</p>
          <p className="mt-2 font-mono text-xs text-slate-500">{property.id}</p>
          <button
            type="button"
            onClick={() => onDelete(property)}
            className="mt-4 w-full rounded-lg border border-red-100 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Delete property
          </button>
        </section>
      </aside>
    </div>
  );
}

function SettingsTabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
        active
          ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
          : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );
}

function StudioList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
