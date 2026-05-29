import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_ASSISTANT_SETTINGS } from '@/lib/assistant';
import type {
  AssistantSettings,
  Organization,
  Property,
  PropertyChatbotSettings,
  Customer,
  LeaseStatus,
} from '@/lib/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client-side Supabase client (for browser/public operations)
export const supabaseClient = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

let supabaseAdmin: SupabaseClient | null = null;

// Server-side Supabase client (with service role for sensitive operations)
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required for server-side operations');
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
  }

  return supabaseAdmin;
}

// Helper to get customer by phone number
export async function getCustomerByPhone(phoneNumber: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('customers')
    .select('*')
    .eq('phone_number', phoneNumber)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get customer: ${error.message}`);
  }

  return data;
}

// Helper to create or get customer — atomic upsert avoids TOCTOU race condition
export async function getOrCreateCustomer(phoneNumber: string, name?: string) {
  const admin = getSupabaseAdmin();

  // Only include name in payload when provided so we never overwrite an existing name with null
  const payload: Record<string, string> = { phone_number: phoneNumber };
  if (name) payload.name = name;

  const { data, error } = await admin
    .from('customers')
    .upsert(payload, { onConflict: 'phone_number', ignoreDuplicates: false })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert customer: ${error.message}`);
  }

  return data;
}

// Helper to get or create conversation
export async function getOrCreateConversation(customerId: string) {
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from('conversations')
    .select('*')
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return existing;
  }

  const { data, error } = await admin
    .from('conversations')
    .insert([
      {
        customer_id: customerId,
        channel: 'whatsapp',
        status: 'active',
      },
    ])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return data;
}

export async function getAssistantSettings(name = 'default'): Promise<AssistantSettings> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('assistant_settings')
    .select('*')
    .eq('name', name)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missingSettingsTable =
      error.code === '42P01' ||
      error.message.toLowerCase().includes('assistant_settings') ||
      error.message.toLowerCase().includes('does not exist');

    if (missingSettingsTable) {
      return {
        ...DEFAULT_ASSISTANT_SETTINGS,
        id: 'default',
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      };
    }

    throw new Error(`Failed to fetch assistant settings: ${error.message}`);
  }

  return data || {
    ...DEFAULT_ASSISTANT_SETTINGS,
    id: 'default',
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

export async function markConversationHandoff(conversationId: string, reason: string, pauseMinutes: number) {
  const admin = getSupabaseAdmin();
  const handoffUntil = new Date(Date.now() + pauseMinutes * 60000).toISOString();

  const { error } = await admin
    .from('conversations')
    .update({
      bot_paused: true,
      status: 'escalated',
      handoff_reason: reason,
      handoff_until: handoffUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to mark conversation handoff: ${error.message}`);
  }
}

export async function markFirstBotResponse(conversationId: string) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await admin
    .from('conversations')
    .update({
      first_response_sent_at: now,
      last_bot_message_at: now,
      updated_at: now,
    })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to mark bot response: ${error.message}`);
  }
}

export async function markHumanResponse(conversationId: string, pauseMinutes: number) {
  const admin = getSupabaseAdmin();
  const now = new Date();
  const { error } = await admin
    .from('conversations')
    .update({
      bot_paused: false,
      status: 'active',
      last_human_message_at: now.toISOString(),
      handoff_reason: 'Human replied from admin',
      handoff_until: new Date(now.getTime() + pauseMinutes * 60000).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to mark human response: ${error.message}`);
  }
}

// Helper to log message
export async function logMessage(
  conversationId: string,
  direction: 'inbound' | 'outbound',
  content: string,
  externalId?: string,
  senderType?: 'customer' | 'bot' | 'human' | 'system'
) {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  // Run the insert and the conversation timestamp update in parallel
  const [{ data, error }, { error: updateError }] = await Promise.all([
    admin.from('messages').insert([
      {
        conversation_id: conversationId,
        direction,
        sender_type: senderType || (direction === 'inbound' ? 'customer' : 'bot'),
        content,
        message_type: 'text',
        external_id: externalId,
        delivery_status: 'delivered',
      },
    ]),
    admin.from('conversations').update({ last_message_at: now }).eq('id', conversationId),
  ]);

  if (error) {
    throw new Error(`Failed to log message: ${error.message}`);
  }
  if (updateError) {
    console.error('Failed to update conversation timestamp:', updateError.message);
  }

  return data;
}

// Helper to log webhook event
export async function logWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>,
  status: 'success' | 'failed' | 'processing' = 'processing',
  errorMessage?: string
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('webhooks_log').insert([
    {
      event_type: eventType,
      payload,
      status,
      error_message: errorMessage,
    },
  ]);

  if (error) {
    console.error('Failed to log webhook event:', error.message);
    return null;
  }

  return data;
}

// Fetch active knowledge base entries for response grounding
export async function getActiveKnowledgeBase(limit = 50) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('knowledge_base')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch knowledge base: ${error.message}`);
  }

  return data || [];
}

// Fetch recent messages to help build contextual replies
export async function getRecentMessages(conversationId: string, limit = 8) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch recent messages: ${error.message}`);
  }

  return data || [];
}

export async function getMessageByExternalId(externalId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('external_id', externalId)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch message by external_id: ${error.message}`);
  }

  return data || null;
}

// ── AUT-9: Tenant Register helpers ──────────────────────────

/** Fetch a single organization by slug (e.g. 'hamba-trading') */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch organization: ${error.message}`);
  return data;
}

/** Fetch all active properties for an organization */
export async function getPropertiesByOrg(organizationId: string): Promise<Property[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('properties')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw new Error(`Failed to fetch properties: ${error.message}`);
  return data ?? [];
}

/** Fetch a single property by ID */
export async function getProperty(propertyId: string): Promise<Property | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch property: ${error.message}`);
  return data;
}

/** Fetch the per-property chatbot settings override (returns null if not configured) */
export async function getPropertyChatbotSettings(propertyId: string): Promise<PropertyChatbotSettings | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('property_chatbot_settings')
    .select('*')
    .eq('property_id', propertyId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch property chatbot settings: ${error.message}`);
  return data;
}

export interface TenantUpdateFields {
  property_id?: string | null;
  unit_number?: string | null;
  lease_status?: LeaseStatus;
  emergency_contact?: string | null;
  notes?: string | null;
  name?: string;
  email?: string;
}

/** Upsert tenant-profile fields on a customer row */
export async function updateTenantProfile(
  phoneNumber: string,
  fields: TenantUpdateFields
): Promise<Customer> {
  const admin = getSupabaseAdmin();
  const payload: Record<string, unknown> = {
    phone_number: phoneNumber,
    updated_at: new Date().toISOString(),
    ...fields,
  };

  const { data, error } = await admin
    .from('customers')
    .upsert(payload, { onConflict: 'phone_number', ignoreDuplicates: false })
    .select()
    .single();

  if (error) throw new Error(`Failed to update tenant profile: ${error.message}`);
  return data as Customer;
}

export async function getWebhookHeartbeat() {
  const admin = getSupabaseAdmin();
  const eventTypes = ['twilio.message', 'twilio.status'];

  const { data: latestEvent, error: latestError } = await admin
    .from('webhooks_log')
    .select('event_type,status,created_at,error_message')
    .in('event_type', eventTypes)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`Failed to read latest webhook event: ${latestError.message}`);
  }

  const { data: latestSuccess, error: successError } = await admin
    .from('webhooks_log')
    .select('event_type,status,created_at')
    .in('event_type', eventTypes)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (successError) {
    throw new Error(`Failed to read latest successful webhook event: ${successError.message}`);
  }

  const now = Date.now();
  const lastSuccessAt = latestSuccess?.created_at || null;
  const secondsSinceSuccess = lastSuccessAt
    ? Math.floor((now - new Date(lastSuccessAt).getTime()) / 1000)
    : null;

  return {
    hasSignal: Boolean(latestEvent),
    latestEvent: latestEvent || null,
    latestSuccessAt: lastSuccessAt,
    secondsSinceSuccess,
  };
}
