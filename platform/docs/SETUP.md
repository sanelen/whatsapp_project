# WhatsApp Integration Platform - Foundation Setup

## Quick Start

### 1. Environment Setup

1. Copy `.env.local.example` to `.env.local`

   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your credentials in `.env.local`:
   - **Supabase**: Get from https://supabase.com (create project, get URL and keys)
   - **Twilio WhatsApp**: Get from https://www.twilio.com (create account, enable WhatsApp sandbox or production)
   - **LLM API**: Optional for Phase 1 (OpenAI, Anthropic, or similar)

### 2. Database Setup (Supabase)

1. Go to your Supabase project SQL editor
2. Create a new query
3. Copy the entire contents of `supabase/schema.sql` and paste it into the editor
4. Run the query to create all tables and indexes

Verify tables were created:

- `customers`
- `conversations`
- `messages`
- `knowledge_base`
- `webhooks_log`

### 3. Install Dependencies

This project intentionally runs on Node 22.x and npm 10.x. Do not use the newest Node runtime for local development unless the project is deliberately upgraded.

Verify the local runtime:

```bash
node -v
npm -v
```

Expected major versions:

```text
node v22.x
npm 10.x
```

```bash
npm install
```

Additional packages needed later:

```bash
npm install @supabase/supabase-js     # Already included
npm install langchain openai           # Phase 3 (LangChain integration)
npm install twilio                     # Phase 2 (Twilio client, if sending via API)
```

### 4. Run Development Server

```bash
npm run dev
```

Open http://localhost:3000

### 5. Verify Setup

**Health Check:**

```bash
curl http://localhost:3000/api/health
```

Expected response:

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-04-23T...",
    "uptime": 1.23
  },
  "timestamp": "2026-04-23T..."
}
```

**Admin Dashboard:**
Open http://localhost:3000/admin

Should display:

- No conversations yet (until you test the webhook)

---

## Testing the Webhook

### Twilio Sandbox Setup (Easiest for Testing)

1. Go to https://www.twilio.com/console/sms/whatsapp/learn
2. Join the sandbox by sending the code to the number provided
3. Get your sandbox number (e.g., `+1234567890`)
4. Get your `TWILIO_PHONE_NUMBER_ID` and credentials

### Test Webhook Locally (without production Twilio)

Using curl to simulate an inbound message:

```bash
curl -X POST http://localhost:3000/api/webhooks/twilio \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Twilio-Signature: fake_signature_for_testing" \
  -d "From=%2B11234567890&To=%2B10987654321&Body=Hello+from+test&MessageSid=SM123456"
```

Check the admin dashboard to see if the message appears.

### Configure Twilio Webhook URL

1. In Twilio Console, go to Messaging > WhatsApp Sandbox
2. Set the webhook URL to:
   ```
   https://your-domain.com/api/webhooks/twilio
   ```
3. For local development, use ngrok to expose your local server:
   ```bash
   ngrok http 3000
   ```
   Then use `https://your-ngrok-url.ngrok.io/api/webhooks/twilio`

---

## Project Structure

```
platform/
├── app/
│   ├── api/
│   │   ├── health/route.ts           # Health check endpoint
│   │   ├── webhooks/
│   │   │   └── twilio/route.ts       # Twilio webhook receiver
│   │   └── whatsapp/
│   │       └── send/route.ts         # Outbound message sender (stub)
│   ├── admin/
│   │   └── page.tsx                  # Admin dashboard
│   ├── page.tsx                      # Landing page
│   └── layout.tsx                    # Root layout
├── lib/
│   ├── supabase.ts                   # Supabase client & helpers
│   ├── twilio-signature.ts           # Webhook signature validation
│   └── types.ts                      # TypeScript interfaces
├── supabase/
│   └── schema.sql                    # Database schema
├── docs/
│   ├── SETUP.md                      # This file
│   ├── API.md                        # API endpoint documentation
│   └── DB_SCHEMA.md                  # Database schema details
├── .env.local.example                # Environment variable template
├── .nvmrc                            # Node version lock
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## Next Steps (Phase 2 & Beyond)

### Phase 2: WhatsApp Integration Hardening

- Validate Twilio signatures in production
- Add rate limiting
- Implement retry logic for failed sends
- Track delivery status

### Phase 3: AI Orchestration

- Integrate LangChain
- Set up LLM provider (OpenAI, Anthropic, etc.)
- Build response generation pipeline
- Implement context retrieval

### Phase 4: Business Logic

- Add intent classification
- Implement handoff to human agents
- Build conversation routing
- Add analytics

### Phase 5: Production Hardening

- Error handling & observability
- Security review (authentication, rate limiting, data protection)
- Performance optimization
- Deployment setup (Docker, CI/CD)

---

## Troubleshooting

### Supabase Connection Failed

- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
- Check that your Supabase project is active
- Verify table permissions (may need to adjust RLS policies)

### Webhook Not Receiving Messages

- Ensure your local server is running (`npm run dev`)
- If using ngrok, verify the URL is correctly configured in Twilio
- Check browser console and terminal for errors
- Verify Twilio credentials in `.env.local`

### Admin Dashboard Shows No Data

- Send a test message via Twilio or curl
- Check that the database tables were created
- Verify Supabase credentials

### TypeScript Errors

- Run `npm run lint` to check for errors
- Run `npm run build` to verify the build works

### Runtime Version Errors

If a command fails with `Unsupported Node.js version`, switch back to the project runtime:

```bash
brew link --overwrite --force node@22
```

The project uses `.nvmrc`, `package.json` engines, `.npmrc` `engine-strict=true`, and a runtime precheck to prevent accidental use of newer runtimes such as Node 25.

---

## Commands

```bash
# Development
npm run dev              # Start dev server on http://localhost:3000

# Building
npm run build            # Build for production
npm start                # Start production server

# Linting & Formatting
npm run lint             # Run ESLint
npm run lint:fix         # Fix linting issues

# Database
# Use Supabase UI to run migrations, or paste schema.sql content
```

---

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp)
- [Next.js Documentation](https://nextjs.org/docs)
- [LangChain Documentation](https://python.langchain.com/) (for Phase 3)

---

**Status**: Foundation Phase 1 Complete ✓

- [x] Next.js app scaffolded (App Router)
- [x] Supabase integration configured
- [x] Database schema created
- [x] Webhook endpoint ready
- [x] Admin dashboard stub ready
- [ ] Phase 2: Twilio production setup
- [ ] Phase 3: LangChain integration
