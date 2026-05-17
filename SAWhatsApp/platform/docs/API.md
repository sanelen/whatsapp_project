# WhatsApp Platform - API Documentation

## Endpoints

### Health Check

**Endpoint**: `GET /api/health`

Check if the server is running and healthy.

**Response**:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-04-23T10:30:00Z",
    "uptime": 123.45
  },
  "timestamp": "2026-04-23T10:30:00Z"
}
```

---

### Twilio Webhook Receiver

**Endpoint**: `POST /api/webhooks/twilio`

Receives inbound WhatsApp messages from Twilio.

**Headers**:

- `X-Twilio-Signature`: Twilio webhook signature for validation
- `Content-Type`: `application/x-www-form-urlencoded`

**Body** (form-encoded):

```
From=+11234567890
To=+10987654321
Body=Hello world
MessageSid=SM123456789
AccountSid=AC123456789
MessagingServiceSid=MG123456789
NumMedia=0
```

**Response** (Success):

```json
{
  "success": true,
  "data": {
    "customerId": "550e8400-e29b-41d4-a716-446655440000",
    "conversationId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "messageSid": "SM123456789"
  },
  "timestamp": "2026-04-23T10:30:00Z"
}
```

**Response** (Invalid Signature):

```json
{
  "success": false,
  "error": "Unauthorized",
  "timestamp": "2026-04-23T10:30:00Z"
}
```

**Status Codes**:

- `200`: Message received and logged successfully
- `400`: Missing required fields
- `401`: Invalid Twilio signature
- `500`: Server error

---

### Send WhatsApp Message

**Endpoint**: `POST /api/whatsapp/send`

Send an outbound message to a customer.

**Headers**:

- `Content-Type`: `application/json`

**Body**:

```json
{
  "conversationId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "phoneNumber": "+11234567890",
  "message": "Hello! How can I help you?"
}
```

**Response** (Success):

```json
{
  "success": true,
  "data": {
    "messageId": "SM123456789",
    "sent": true
  },
  "timestamp": "2026-04-23T10:30:00Z"
}
```

**Response** (Missing Fields):

```json
{
  "success": false,
  "error": "Missing required fields (conversationId, phoneNumber, message)",
  "timestamp": "2026-04-23T10:30:00Z"
}
```

**Status Codes**:

- `200`: Message queued for sending
- `400`: Missing or invalid fields
- `500`: Server error

---

## Data Models

### Customer

Represents a WhatsApp user.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "phone_number": "+11234567890",
  "name": "John Doe",
  "email": "john@example.com",
  "tags": ["vip", "support"],
  "created_at": "2026-04-23T10:30:00Z",
  "updated_at": "2026-04-23T10:30:00Z"
}
```

### Conversation

Represents a chat thread with a customer.

```json
{
  "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "customer_id": "550e8400-e29b-41d4-a716-446655440000",
  "channel": "whatsapp",
  "status": "active",
  "last_message_at": "2026-04-23T10:30:00Z",
  "created_at": "2026-04-23T10:00:00Z",
  "updated_at": "2026-04-23T10:30:00Z"
}
```

### Message

Represents a single message in a conversation.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "conversation_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "direction": "inbound",
  "content": "Hello, I need help with my order",
  "message_type": "text",
  "external_id": "SM123456789",
  "delivery_status": "delivered",
  "created_at": "2026-04-23T10:30:00Z",
  "updated_at": "2026-04-23T10:30:00Z"
}
```

---

## Error Handling

All error responses follow the standard format:

```json
{
  "success": false,
  "error": "Error description",
  "timestamp": "2026-04-23T10:30:00Z"
}
```

Common errors:

- `Unauthorized`: Invalid or missing authentication/signature
- `Missing required fields`: Incomplete request body
- `Unknown error`: Unexpected server error (check logs)

---

## Future Endpoints (Coming in Phase 2+)

- `GET /api/conversations` - List all conversations
- `GET /api/conversations/:id` - Get conversation details
- `GET /api/customers/:id` - Get customer profile
- `PUT /api/customers/:id` - Update customer profile
- `GET /api/knowledge-base` - Search knowledge base
- `POST /api/knowledge-base` - Create KB entry (admin only)
