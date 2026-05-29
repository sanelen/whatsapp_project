ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS bot_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS handoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS handoff_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS first_response_sent_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_human_message_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_bot_message_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_conversations_handoff_until ON conversations(handoff_until);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_type VARCHAR(20) NOT NULL DEFAULT 'customer';

CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_settings_name ON assistant_settings(name);

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

ALTER TABLE assistant_settings ENABLE ROW LEVEL SECURITY;
