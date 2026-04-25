// Customer model
export interface Customer {
  id: string;
  phone_number: string;
  name?: string;
  email?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

// Conversation model
export interface Conversation {
  id: string;
  customer_id: string;
  channel: 'whatsapp' | 'other';
  status: 'active' | 'closed' | 'escalated';
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

// Message model
export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
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
