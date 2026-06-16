export type ChatbotSettings = {
  provider: string;
  model: string;
  temperature: number;
  systemPrompt: string;
  knowledgeSources: string[];
  quickReplies: string[];
  whatsappTemplates: string[];
  retrievalTopK: number;
  retrievalSimilarityThreshold: number;
  retrievalMemoryMode: 'hybrid' | 'rolling_window' | 'summary_memory' | 'retrieval_only';
  retrievalHistoryWindow: number;
};

export type PropertyWorkspace = {
  id: string;
  organizationId: string;
  name: string;
  location: string;
  icon: string;
  imageUrl: string;
  chatbot: ChatbotSettings;
};

export type OrganizationWorkspace = {
  id: string;
  name: string;
  icon: string;
  description: string;
};

export type WorkspaceState = {
  organizations: OrganizationWorkspace[];
  properties: PropertyWorkspace[];
};

export type WorkspaceSummary = {
  organizationCount: number;
  propertyCount: number;
  chatbotCount: number;
};

type OrganizationRow = {
  id: string;
  name: string;
  icon: string;
  description: string;
};

type PropertyRow = {
  id: string;
  organization_id: string;
  name: string;
  location: string;
  icon: string;
  image_url: string;
};

type ChatbotSettingsRow = {
  property_id: string;
  provider: string;
  model: string;
  temperature: number | string;
  system_prompt: string;
  knowledge_sources: string[] | null;
  quick_replies: string[] | null;
  whatsapp_templates: string[] | null;
  retrieval_top_k?: number | string | null;
  retrieval_similarity_threshold?: number | string | null;
  retrieval_memory_mode?: ChatbotSettings['retrievalMemoryMode'] | null;
  retrieval_history_window?: number | string | null;
};

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function createDefaultChatbotSettings(propertyName: string): ChatbotSettings {
  return {
    provider: 'openai',
    model: 'gpt-5.4',
    temperature: 0.4,
    systemPrompt: `You are the property assistant for ${propertyName}. Answer with property-specific context, ask clarifying questions when needed, and offer a human handoff for sensitive issues.`,
    knowledgeSources: ['Property FAQ', 'Operating policies'],
    quickReplies: ['Share pricing', 'Book a viewing', 'Escalate to team'],
    whatsappTemplates: ['Welcome message', 'Viewing reminder'],
    retrievalTopK: 5,
    retrievalSimilarityThreshold: 0.2,
    retrievalMemoryMode: 'hybrid',
    retrievalHistoryWindow: 20,
  };
}

export function normalizeOrganizationIcon(icon: string): string {
  const trimmed = icon.trim();
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return trimmed.slice(0, 4).toUpperCase() || 'ORG';
}

export function createSeedWorkspace(): WorkspaceState {
  const organizationId = 'org_hamba_trading';
  const propertyOneId = 'prop_sandton_house';
  const propertyTwoId = 'prop_durban_villas';

  return {
    organizations: [
      {
        id: organizationId,
        name: 'Hamba Trading',
        icon: 'HT',
        description: 'Parent organization for property-specific customer assistants.',
      },
    ],
    properties: [
      {
        id: propertyOneId,
        organizationId,
        name: 'Sandton House',
        location: 'Sandton, Johannesburg',
        icon: 'S1',
        imageUrl: '',
        chatbot: createDefaultChatbotSettings('Sandton House'),
      },
      {
        id: propertyTwoId,
        organizationId,
        name: 'Durban Villas',
        location: 'Umhlanga, Durban',
        icon: 'D2',
        imageUrl: '',
        chatbot: {
          ...createDefaultChatbotSettings('Durban Villas'),
          knowledgeSources: ['Coastal property FAQ', 'Check-in policies'],
          quickReplies: ['Share amenities', 'Confirm availability', 'Escalate to team'],
        },
      },
    ],
  };
}

export function mapWorkspaceRows(input: {
  organizations: OrganizationRow[];
  properties: PropertyRow[];
  chatbotSettings: ChatbotSettingsRow[];
}): WorkspaceState {
  const settingsByProperty = new Map(
    input.chatbotSettings.map((settings) => [settings.property_id, settings])
  );

  return {
    organizations: input.organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      icon: organization.icon,
      description: organization.description,
    })),
    properties: input.properties.map((property) => {
      const settings = settingsByProperty.get(property.id);
      return {
        id: property.id,
        organizationId: property.organization_id,
        name: property.name,
        location: property.location,
        icon: property.icon,
        imageUrl: property.image_url,
        chatbot: settings
          ? {
              provider: settings.provider,
              model: settings.model,
              temperature: Number(settings.temperature),
              systemPrompt: settings.system_prompt || createDefaultChatbotSettings(property.name).systemPrompt,
              knowledgeSources: settings.knowledge_sources || [],
              quickReplies: settings.quick_replies || [],
              whatsappTemplates: settings.whatsapp_templates || [],
              retrievalTopK: Number(settings.retrieval_top_k ?? 5),
              retrievalSimilarityThreshold: Number(settings.retrieval_similarity_threshold ?? 0.2),
              retrievalMemoryMode: settings.retrieval_memory_mode || 'hybrid',
              retrievalHistoryWindow: Number(settings.retrieval_history_window ?? 20),
            }
          : createDefaultChatbotSettings(property.name),
      };
    }),
  };
}

export function getPropertiesForOrganization(
  state: WorkspaceState,
  organizationId: string
): PropertyWorkspace[] {
  return state.properties.filter((property) => property.organizationId === organizationId);
}

export function getWorkspaceSummary(state: WorkspaceState): WorkspaceSummary {
  return {
    organizationCount: state.organizations.length,
    propertyCount: state.properties.length,
    chatbotCount: state.properties.length,
  };
}

export function addOrganization(
  state: WorkspaceState,
  input: Pick<OrganizationWorkspace, 'name' | 'icon' | 'description'>
): WorkspaceState {
  const organization: OrganizationWorkspace = {
    id: createId('org'),
    name: input.name.trim() || 'Untitled organization',
    icon: normalizeOrganizationIcon(input.icon),
    description: input.description.trim(),
  };

  return {
    ...state,
    organizations: [organization, ...state.organizations],
  };
}

export function updateOrganization(
  state: WorkspaceState,
  organizationId: string,
  updates: Partial<Pick<OrganizationWorkspace, 'name' | 'icon' | 'description'>>
): WorkspaceState {
  return {
    ...state,
    organizations: state.organizations.map((organization) =>
      organization.id === organizationId
        ? {
            ...organization,
            name: typeof updates.name === 'string' ? updates.name.trim() || organization.name : organization.name,
            icon: typeof updates.icon === 'string' ? normalizeOrganizationIcon(updates.icon) : organization.icon,
            description: typeof updates.description === 'string' ? updates.description.trim() : organization.description,
          }
        : organization
    ),
  };
}

export function addProperty(
  state: WorkspaceState,
  organizationId: string,
  input: Pick<PropertyWorkspace, 'name' | 'location' | 'icon' | 'imageUrl'>
): WorkspaceState {
  const name = input.name.trim() || 'Untitled property';
  const property: PropertyWorkspace = {
    id: createId('prop'),
    organizationId,
    name,
    location: input.location.trim() || 'Location not set',
    icon: input.icon.trim().slice(0, 4).toUpperCase() || 'PR',
    imageUrl: input.imageUrl.trim(),
    chatbot: createDefaultChatbotSettings(name),
  };

  return {
    ...state,
    properties: [property, ...state.properties],
  };
}

export function updatePropertyChatbot(
  state: WorkspaceState,
  propertyId: string,
  updates: Partial<ChatbotSettings>
): WorkspaceState {
  return {
    ...state,
    properties: state.properties.map((property) =>
      property.id === propertyId
        ? { ...property, chatbot: { ...property.chatbot, ...updates } }
        : property
    ),
  };
}

export function updateProperty(
  state: WorkspaceState,
  propertyId: string,
  updates: Partial<Pick<PropertyWorkspace, 'name' | 'location' | 'icon' | 'imageUrl'>>
): WorkspaceState {
  return {
    ...state,
    properties: state.properties.map((property) =>
      property.id === propertyId
        ? {
            ...property,
            name: typeof updates.name === 'string' ? updates.name.trim() || property.name : property.name,
            location: typeof updates.location === 'string' ? updates.location.trim() || property.location : property.location,
            icon: typeof updates.icon === 'string' ? updates.icon.trim().slice(0, 4).toUpperCase() || property.icon : property.icon,
            imageUrl: typeof updates.imageUrl === 'string' ? updates.imageUrl.trim() : property.imageUrl,
          }
        : property
    ),
  };
}

export function deleteOrganization(state: WorkspaceState, organizationId: string): WorkspaceState {
  return {
    organizations: state.organizations.filter((organization) => organization.id !== organizationId),
    properties: state.properties.filter((property) => property.organizationId !== organizationId),
  };
}

export function deleteProperty(state: WorkspaceState, propertyId: string): WorkspaceState {
  return {
    ...state,
    properties: state.properties.filter((property) => property.id !== propertyId),
  };
}
