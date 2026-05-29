-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(255),
  email VARCHAR(255),
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone_number);
CREATE INDEX idx_customers_created_at ON customers(created_at);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel VARCHAR(50) DEFAULT 'whatsapp',
  status VARCHAR(50) DEFAULT 'active', -- active, closed, escalated
  bot_paused BOOLEAN NOT NULL DEFAULT FALSE,
  handoff_reason TEXT,
  handoff_until TIMESTAMP WITH TIME ZONE,
  first_response_sent_at TIMESTAMP WITH TIME ZONE,
  last_human_message_at TIMESTAMP WITH TIME ZONE,
  last_bot_message_at TIMESTAMP WITH TIME ZONE,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_customer_id ON conversations(customer_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_handoff_until ON conversations(handoff_until);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL, -- inbound, outbound
  sender_type VARCHAR(20) NOT NULL DEFAULT 'customer', -- customer, bot, human, system
  content TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'text', -- text, image, document, other
  external_id VARCHAR(255), -- Twilio MessageSid or similar
  delivery_status VARCHAR(50) DEFAULT 'pending', -- pending, sent, delivered, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_sender_type ON messages(sender_type);
CREATE INDEX idx_messages_external_id ON messages(external_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Assistant automation settings
CREATE TABLE IF NOT EXISTS assistant_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL DEFAULT 'default',
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  greeting_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  handoff_pause_minutes INTEGER NOT NULL DEFAULT 30 CHECK (handoff_pause_minutes >= 1 AND handoff_pause_minutes <= 10080),
  greeting_text TEXT NOT NULL DEFAULT 'Hi, thanks for contacting Hamba Trading. Please send your name, property or unit, what you need help with, and whether it is urgent.',
  intake_prompt TEXT NOT NULL DEFAULT 'To help quickly, please include your full name, property or unit, the issue or request, and the best number to reach you on.',
  fallback_response_text TEXT NOT NULL DEFAULT 'Thanks, I received your message. A team member will follow up shortly.',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_assistant_settings_name ON assistant_settings(name);

INSERT INTO assistant_settings (
  name,
  auto_reply_enabled,
  greeting_enabled,
  handoff_pause_minutes,
  greeting_text,
  intake_prompt,
  fallback_response_text
)
VALUES (
  'default',
  TRUE,
  TRUE,
  30,
  'Hi, thanks for contacting Hamba Trading. Please send your name, property or unit, what you need help with, and whether it is urgent.',
  'To help quickly, please include your full name, property or unit, the issue or request, and the best number to reach you on.',
  'Thanks, I received your message. A team member will follow up shortly.'
)
ON CONFLICT (name) DO NOTHING;

-- Knowledge base table
CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_knowledge_base_category ON knowledge_base(category);
CREATE INDEX idx_knowledge_base_is_active ON knowledge_base(is_active);

-- Prompt settings table (singleton row per app)
CREATE TABLE IF NOT EXISTS prompt_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL DEFAULT 'default',
  system_prompt TEXT NOT NULL DEFAULT 'You are a helpful assistant.',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.40 CHECK (temperature >= 0 AND temperature <= 2),
  -- LLM provider settings
  llm_provider VARCHAR(50) NOT NULL DEFAULT 'openai',
  llm_model VARCHAR(100) NOT NULL DEFAULT 'gpt-5.4',
  llm_api_key TEXT NOT NULL DEFAULT '',
  llm_base_url VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_prompt_settings_name ON prompt_settings(name);

-- Seed a default row so GET always returns something
INSERT INTO prompt_settings (name, system_prompt, temperature, llm_provider, llm_model, llm_api_key, llm_base_url)
VALUES ('default', 'You are a helpful assistant.', 0.40, 'openai', 'gpt-5.4', '', '')
ON CONFLICT (name) DO NOTHING;
CREATE INDEX idx_knowledge_base_created_at ON knowledge_base(created_at);

-- Webhooks log table (for tracking inbound events)
CREATE TABLE IF NOT EXISTS webhooks_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'processing', -- success, failed, processing
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_webhooks_log_event_type ON webhooks_log(event_type);
CREATE INDEX idx_webhooks_log_status ON webhooks_log(status);
CREATE INDEX idx_webhooks_log_created_at ON webhooks_log(created_at);

-- Enable RLS (Row Level Security) if needed
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks_log ENABLE ROW LEVEL SECURITY;
