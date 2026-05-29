// ── AUT-9: Tenant Register ───────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  organization_id: string;
  name: string;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type LeaseStatus = 'active' | 'expired' | 'pending' | 'unknown';

// Per-property assistant overrides — any null field falls back to global assistant_settings
export interface PropertyChatbotSettings {
  id: string;
  property_id: string;
  auto_reply_enabled: boolean;
  greeting_enabled: boolean;
  handoff_pause_minutes: number;
  greeting_text?: string | null;
  intake_prompt?: string | null;
  fallback_response_text?: string | null;
  llm_provider?: string | null;
  llm_model?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Customer model ───────────────────────────────────────────

export interface Customer {
  id: string;
  phone_number: string;
  name?: string;
  email?: string;
  tags?: string[];
  // AUT-9 tenant fields
  property_id?: string | null;
  unit_number?: string | null;
  lease_status?: LeaseStatus;
  emergency_contact?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

// Conversation model
export interface Conversation {
  id: string;
  customer_id: string;
  channel: 'whatsapp' | 'other';
  status: 'active' | 'closed' | 'escalated';
  bot_paused?: boolean;
  handoff_reason?: string | null;
  handoff_until?: string | null;
  first_response_sent_at?: string | null;
  last_human_message_at?: string | null;
  last_bot_message_at?: string | null;
  last_message_at: string;
  // AUT-9: property context
  property_id?: string | null;
  created_at: string;
  updated_at: string;
}

// Message model
export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  sender_type?: 'customer' | 'bot' | 'human' | 'system';
  content: string;
  message_type: 'text' | 'image' | 'document' | 'other';
  external_id?: string;
  delivery_status?: 'pending' | 'sent' | 'delivered' | 'failed';
  created_at: string;
  updated_at: string;
}

// Knowledge base entry
export interface KnowledgeBase {
  id: string;
  category: string;
  title: string;
  content: string;
  tags?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssistantSettings {
  id: string;
  name: string;
  auto_reply_enabled: boolean;
  greeting_enabled: boolean;
  handoff_pause_minutes: number;
  greeting_text: string;
  intake_prompt: string;
  fallback_response_text: string;
  created_at: string;
  updated_at: string;
}

// Webhook log entry
export interface WebhookLog {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'success' | 'failed' | 'processing';
  error_message?: string;
  created_at: string;
}

// Twilio Webhook payload shape
export interface TwilioWebhookPayload {
  MessageSid: string;
  AccountSid: string;
  MessagingServiceSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
  [key: string]: unknown;
}

// API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}
