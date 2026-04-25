# Database Schema - WhatsApp Platform

## Overview

The database consists of 5 core tables, optimized for conversational AI and webhook event tracking.

---

## Tables

### 1. `customers`

Stores WhatsApp business customer profiles.

| Column         | Type                     | Constraints                            | Notes                                        |
| -------------- | ------------------------ | -------------------------------------- | -------------------------------------------- |
| `id`           | UUID                     | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier                            |
| `phone_number` | VARCHAR(20)              | NOT NULL, UNIQUE                       | WhatsApp phone in E.164 format               |
| `name`         | VARCHAR(255)             | NULL                                   | Optional customer name                       |
| `email`        | VARCHAR(255)             | NULL                                   | Optional email for contact                   |
| `tags`         | TEXT[]                   | NULL                                   | Array of labels (e.g., `['vip', 'support']`) |
| `created_at`   | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Record creation timestamp                    |
| `updated_at`   | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Last update timestamp                        |

**Indexes**:

- `idx_customers_phone` on `phone_number`
- `idx_customers_created_at` on `created_at`

**Usage**: Look up customers by phone number, filter by creation date.

---

### 2. `conversations`

Represents active or closed chat threads.

| Column            | Type                     | Constraints                            | Notes                     |
| ----------------- | ------------------------ | -------------------------------------- | ------------------------- |
| `id`              | UUID                     | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique conversation ID    |
| `customer_id`     | UUID                     | NOT NULL, FOREIGN KEY → customers.id   | Links to customer         |
| `channel`         | VARCHAR(50)              | DEFAULT 'whatsapp'                     | Communication channel     |
| `status`          | VARCHAR(50)              | DEFAULT 'active'                       | active, closed, escalated |
| `last_message_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Timestamp of last message |
| `created_at`      | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Thread creation time      |
| `updated_at`      | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Last update time          |

**Indexes**:

- `idx_conversations_customer_id` on `customer_id`
- `idx_conversations_status` on `status`
- `idx_conversations_created_at` on `created_at`

**Usage**: Fetch active conversations per customer, list by status, track thread lifetime.

---

### 3. `messages`

Individual messages within conversations.

| Column            | Type                     | Constraints                              | Notes                            |
| ----------------- | ------------------------ | ---------------------------------------- | -------------------------------- |
| `id`              | UUID                     | PRIMARY KEY, DEFAULT gen_random_uuid()   | Unique message ID                |
| `conversation_id` | UUID                     | NOT NULL, FOREIGN KEY → conversations.id | Conversation reference           |
| `direction`       | VARCHAR(20)              | NOT NULL                                 | 'inbound' or 'outbound'          |
| `content`         | TEXT                     | NOT NULL                                 | Message body/text                |
| `message_type`    | VARCHAR(50)              | DEFAULT 'text'                           | text, image, document, other     |
| `external_id`     | VARCHAR(255)             | NULL                                     | Twilio MessageSid or provider ID |
| `delivery_status` | VARCHAR(50)              | DEFAULT 'pending'                        | pending, sent, delivered, failed |
| `created_at`      | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                            | Message send/receive time        |
| `updated_at`      | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                            | Last update time                 |

**Indexes**:

- `idx_messages_conversation_id` on `conversation_id`
- `idx_messages_direction` on `direction`
- `idx_messages_external_id` on `external_id`
- `idx_messages_created_at` on `created_at`

**Usage**: Fetch conversation history, look up messages by external ID, track delivery status.

---

### 4. `knowledge_base`

FAQ, product info, policies, and business context for AI responses.

| Column       | Type                     | Constraints                            | Notes                                       |
| ------------ | ------------------------ | -------------------------------------- | ------------------------------------------- |
| `id`         | UUID                     | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique entry ID                             |
| `category`   | VARCHAR(100)             | NOT NULL                               | e.g., 'faq', 'product', 'policy'            |
| `title`      | VARCHAR(255)             | NOT NULL                               | Short summary/title                         |
| `content`    | TEXT                     | NOT NULL                               | Full text content                           |
| `tags`       | TEXT[]                   | NULL                                   | Search tags (e.g., `['billing', 'urgent']`) |
| `is_active`  | BOOLEAN                  | DEFAULT TRUE                           | Soft delete / enable/disable                |
| `created_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Created time                                |
| `updated_at` | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Updated time                                |

**Indexes**:

- `idx_knowledge_base_category` on `category`
- `idx_knowledge_base_is_active` on `is_active`
- `idx_knowledge_base_created_at` on `created_at`

**Usage**: Retrieval Augmented Generation (RAG) context, manual search, category filtering.

---

### 5. `webhooks_log`

Event log for all inbound webhook requests (Twilio, etc.).

| Column          | Type                     | Constraints                            | Notes                                            |
| --------------- | ------------------------ | -------------------------------------- | ------------------------------------------------ |
| `id`            | UUID                     | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique log entry ID                              |
| `event_type`    | VARCHAR(100)             | NOT NULL                               | e.g., 'twilio.message', 'twilio.delivery_status' |
| `payload`       | JSONB                    | NOT NULL                               | Full JSON payload for replay/audit               |
| `status`        | VARCHAR(50)              | DEFAULT 'processing'                   | success, failed, processing                      |
| `error_message` | TEXT                     | NULL                                   | Error details if status = failed                 |
| `created_at`    | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()                          | Log timestamp                                    |

**Indexes**:

- `idx_webhooks_log_event_type` on `event_type`
- `idx_webhooks_log_status` on `status`
- `idx_webhooks_log_created_at` on `created_at`

**Usage**: Audit trail, replay failed events, debug webhook issues, retry logic.

---

## Relationships

```
customers
  ↓ (1-to-many)
conversations
  ↓ (1-to-many)
messages

knowledge_base (independent)

webhooks_log (independent)
```

---

## Sample Queries

### Get Recent Conversations with Latest Message

```sql
SELECT
  c.id,
  c.customer_id,
  cust.phone_number,
  cust.name,
  c.status,
  c.last_message_at,
  (SELECT content FROM messages WHERE conversation_id = c.id
   ORDER BY created_at DESC LIMIT 1) AS latest_message
FROM conversations c
JOIN customers cust ON c.customer_id = cust.id
ORDER BY c.last_message_at DESC
LIMIT 10;
```

### Get Full Conversation History

```sql
SELECT
  c.id AS conversation_id,
  cust.phone_number,
  m.direction,
  m.content,
  m.created_at
FROM conversations c
JOIN customers cust ON c.customer_id = cust.id
JOIN messages m ON c.id = m.conversation_id
WHERE c.id = 'conversation-uuid'
ORDER BY m.created_at ASC;
```

### Find Failed Webhook Events

```sql
SELECT
  id,
  event_type,
  payload,
  error_message,
  created_at
FROM webhooks_log
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Row Level Security (RLS)

RLS is enabled on all tables but policies are not enforced by default. Configure per your security needs:

```sql
-- Example: Allow authenticated users to read their own data
CREATE POLICY "Users can read own conversations"
ON conversations FOR SELECT
USING (auth.uid() = customer_id);

-- Example: Allow service role to manage all data
CREATE POLICY "Service role can manage all"
ON conversations
USING (auth.role() = 'service_role');
```

---

## Maintenance

### Archiving Old Data

```sql
-- Archive messages older than 1 year
DELETE FROM messages
WHERE created_at < NOW() - INTERVAL '1 year'
  AND direction = 'inbound';
```

### Truncate Webhook Log (Admin)

```sql
-- Keep only recent logs
DELETE FROM webhooks_log
WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## Next Steps

- Enable Full-Text Search (FTS) on `knowledge_base.content` for Phase 3
- Add vector embeddings for semantic search (LangChain integration)
- Consider partitioning `messages` table for scale (monthly partitions)
