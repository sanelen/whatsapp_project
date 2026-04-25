import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Client-side Supabase client (for browser/public operations)
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

let supabaseAdmin: SupabaseClient | null = null;

// Server-side Supabase client (with service role for sensitive operations)
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    if (!supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server-side operations');
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

// Helper to create or get customer
export async function getOrCreateCustomer(phoneNumber: string, name?: string) {
  const admin = getSupabaseAdmin();
  let customer = await getCustomerByPhone(phoneNumber);

  if (!customer) {
    const { data, error } = await admin
      .from('customers')
      .insert([{ phone_number: phoneNumber, name }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create customer: ${error.message}`);
    }

    customer = data;
  }

  return customer;
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

// Helper to log message
export async function logMessage(
  conversationId: string,
  direction: 'inbound' | 'outbound',
  content: string,
  externalId?: string
) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('messages').insert([
    {
      conversation_id: conversationId,
      direction,
      content,
      message_type: 'text',
      external_id: externalId,
      delivery_status: 'delivered',
    },
  ]);

  if (error) {
    throw new Error(`Failed to log message: ${error.message}`);
  }

  // Update conversation last_message_at
  await admin
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

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
