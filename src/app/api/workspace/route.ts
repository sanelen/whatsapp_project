import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireApiAuth } from '@/lib/auth/api-guard';
import {
  createDefaultChatbotSettings,
  mapWorkspaceRows,
  normalizeOrganizationIcon,
  type ChatbotSettings,
} from '@/lib/workspace';

type WorkspaceAction =
  | {
      action: 'createOrganization';
      payload: {
        name: string;
        icon: string;
        description: string;
      };
    }
  | {
      action: 'createProperty';
      payload: {
        organizationId: string;
        name: string;
        location: string;
        icon: string;
        imageUrl: string;
      };
    }
  | {
      action: 'updateOrganization';
      payload: {
        organizationId: string;
        name: string;
        icon: string;
        description: string;
      };
    }
  | {
      action: 'updateChatbot';
      payload: {
        propertyId: string;
        chatbot: Partial<ChatbotSettings>;
      };
    }
  | {
      action: 'updateProperty';
      payload: {
        propertyId: string;
        name: string;
        location: string;
        icon: string;
        imageUrl: string;
      };
    }
  | {
      action: 'deleteOrganization';
      payload: {
        organizationId: string;
      };
    }
  | {
      action: 'deleteProperty';
      payload: {
        propertyId: string;
      };
    };

async function readWorkspace() {
  const admin = getSupabaseAdmin();
  const [organizationsResult, propertiesResult, settingsResult] = await Promise.all([
    admin.from('organizations').select('id,name,icon,description').order('created_at', { ascending: true }),
    admin.from('properties').select('id,organization_id,name,location,icon,image_url').order('created_at', { ascending: true }),
    admin
      .from('property_chatbot_settings')
      .select('property_id,provider,model,temperature,system_prompt,knowledge_sources,quick_replies,whatsapp_templates,retrieval_top_k,retrieval_similarity_threshold,retrieval_memory_mode,retrieval_history_window'),
  ]);

  if (organizationsResult.error) throw new Error(`Failed to load organizations: ${organizationsResult.error.message}`);
  if (propertiesResult.error) throw new Error(`Failed to load properties: ${propertiesResult.error.message}`);
  if (settingsResult.error) throw new Error(`Failed to load chatbot settings: ${settingsResult.error.message}`);

  return mapWorkspaceRows({
    organizations: organizationsResult.data || [],
    properties: propertiesResult.data || [],
    chatbotSettings: settingsResult.data || [],
  });
}

export async function GET() {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const workspace = await readWorkspace();
    return NextResponse.json({ success: true, data: workspace, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load workspace',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireApiAuth();
  if (denied) return denied;
  try {
    const body = (await request.json()) as WorkspaceAction;
    const admin = getSupabaseAdmin();

    if (body.action === 'createOrganization') {
      const { name, icon, description } = body.payload;
      const { error } = await admin.from('organizations').insert({
        name: name.trim() || 'Untitled organization',
        icon: normalizeOrganizationIcon(icon),
        description: description.trim(),
      });
      if (error) throw new Error(`Failed to create organization: ${error.message}`);
    }

    if (body.action === 'updateOrganization') {
      const { organizationId, name, icon, description } = body.payload;
      const { error } = await admin
        .from('organizations')
        .update({
          name: name.trim() || 'Untitled organization',
          icon: normalizeOrganizationIcon(icon),
          description: description.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', organizationId);
      if (error) throw new Error(`Failed to update organization: ${error.message}`);
    }

    if (body.action === 'createProperty') {
      const { organizationId, name, location, icon, imageUrl } = body.payload;
      const propertyName = name.trim() || 'Untitled property';
      const { data: property, error } = await admin
        .from('properties')
        .insert({
          organization_id: organizationId,
          name: propertyName,
          location: location.trim() || 'Location not set',
          icon: icon.trim().slice(0, 4).toUpperCase() || 'PR',
          image_url: imageUrl.trim(),
        })
        .select('id,name')
        .single();
      if (error) throw new Error(`Failed to create property: ${error.message}`);

      const defaults = createDefaultChatbotSettings(property.name);
      const { error: settingsError } = await admin.from('property_chatbot_settings').insert({
        property_id: property.id,
        provider: defaults.provider,
        model: defaults.model,
        temperature: defaults.temperature,
        system_prompt: defaults.systemPrompt,
        knowledge_sources: defaults.knowledgeSources,
        quick_replies: defaults.quickReplies,
        whatsapp_templates: defaults.whatsappTemplates,
        retrieval_top_k: defaults.retrievalTopK,
        retrieval_similarity_threshold: defaults.retrievalSimilarityThreshold,
        retrieval_memory_mode: defaults.retrievalMemoryMode,
        retrieval_history_window: defaults.retrievalHistoryWindow,
      });
      if (settingsError) throw new Error(`Failed to create chatbot settings: ${settingsError.message}`);
    }

    if (body.action === 'updateChatbot') {
      const { propertyId, chatbot } = body.payload;
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof chatbot.provider === 'string') update.provider = chatbot.provider;
      if (typeof chatbot.model === 'string') update.model = chatbot.model;
      if (typeof chatbot.temperature === 'number') update.temperature = chatbot.temperature;
      if (typeof chatbot.systemPrompt === 'string') update.system_prompt = chatbot.systemPrompt;
      if (Array.isArray(chatbot.knowledgeSources)) update.knowledge_sources = chatbot.knowledgeSources;
      if (Array.isArray(chatbot.quickReplies)) update.quick_replies = chatbot.quickReplies;
      if (Array.isArray(chatbot.whatsappTemplates)) update.whatsapp_templates = chatbot.whatsappTemplates;
      if (typeof chatbot.retrievalTopK === 'number') update.retrieval_top_k = chatbot.retrievalTopK;
      if (typeof chatbot.retrievalSimilarityThreshold === 'number') update.retrieval_similarity_threshold = chatbot.retrievalSimilarityThreshold;
      if (typeof chatbot.retrievalMemoryMode === 'string') update.retrieval_memory_mode = chatbot.retrievalMemoryMode;
      if (typeof chatbot.retrievalHistoryWindow === 'number') update.retrieval_history_window = chatbot.retrievalHistoryWindow;

      const { error } = await admin
        .from('property_chatbot_settings')
        .upsert({ property_id: propertyId, ...update }, { onConflict: 'property_id' });
      if (error) throw new Error(`Failed to update chatbot: ${error.message}`);
    }

    if (body.action === 'updateProperty') {
      const { propertyId, name, location, icon, imageUrl } = body.payload;
      const { error } = await admin
        .from('properties')
        .update({
          name: name.trim() || 'Untitled property',
          location: location.trim() || 'Location not set',
          icon: icon.trim().slice(0, 4).toUpperCase() || 'PR',
          image_url: imageUrl.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', propertyId);
      if (error) throw new Error(`Failed to update property: ${error.message}`);
    }

    if (body.action === 'deleteOrganization') {
      const { organizationId } = body.payload;
      const { error } = await admin.from('organizations').delete().eq('id', organizationId);
      if (error) throw new Error(`Failed to delete organization: ${error.message}`);
    }

    if (body.action === 'deleteProperty') {
      const { propertyId } = body.payload;
      const { error } = await admin.from('properties').delete().eq('id', propertyId);
      if (error) throw new Error(`Failed to delete property: ${error.message}`);
    }

    const workspace = await readWorkspace();
    return NextResponse.json({ success: true, data: workspace, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update workspace',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
