-- ============================================================
-- AUT-9: Tenant Register & Multi-Property Support
-- Branch: sanelengcobo/aut-9-extend-supabase-schema-for-tenant-register-and-assistant
-- ============================================================

-- ── 1. ORGANIZATIONS ────────────────────────────────────────
-- Top-level entity (e.g. "Hamba Trading")
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ── 2. PROPERTIES ───────────────────────────────────────────
-- A managed property/building within an organization
CREATE TABLE IF NOT EXISTS properties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  address         TEXT,
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_organization_id ON properties(organization_id);
CREATE INDEX IF NOT EXISTS idx_properties_is_active ON properties(is_active);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- ── 3. EXTEND CUSTOMERS WITH TENANT FIELDS ──────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS property_id     UUID REFERENCES properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_number     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS lease_status    VARCHAR(20) NOT NULL DEFAULT 'unknown'
                                             CHECK (lease_status IN ('active', 'expired', 'pending', 'unknown')),
  ADD COLUMN IF NOT EXISTS emergency_contact TEXT,
  ADD COLUMN IF NOT EXISTS notes           TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_property_id  ON customers(property_id);
CREATE INDEX IF NOT EXISTS idx_customers_lease_status ON customers(lease_status);

-- ── 4. EXTEND CONVERSATIONS WITH PROPERTY CONTEXT ───────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_property_id ON conversations(property_id);

-- ── 5. PROPERTY-LEVEL CHATBOT SETTINGS ──────────────────────
-- Per-property overrides for the assistant.  Falls back to
-- the global assistant_settings row when absent.
CREATE TABLE IF NOT EXISTS property_chatbot_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           UUID NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
  auto_reply_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  greeting_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  handoff_pause_minutes INTEGER NOT NULL DEFAULT 30
                          CHECK (handoff_pause_minutes >= 1 AND handoff_pause_minutes <= 10080),
  greeting_text         TEXT,
  intake_prompt         TEXT,
  fallback_response_text TEXT,
  llm_provider          VARCHAR(50),
  llm_model             VARCHAR(100),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_chatbot_settings_property_id ON property_chatbot_settings(property_id);

ALTER TABLE property_chatbot_settings ENABLE ROW LEVEL SECURITY;

-- ── 6. SEED DATA: HAMBA TRADING ─────────────────────────────
INSERT INTO organizations (name, slug)
VALUES ('Hamba Trading', 'hamba-trading')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO properties (organization_id, name, address, notes)
SELECT
  o.id,
  '33 Essex',
  '33 Essex Road, South Africa',
  'Primary managed property — Hamba Trading residential tenants'
FROM organizations o
WHERE o.slug = 'hamba-trading'
ON CONFLICT DO NOTHING;

-- ── 7. RLS POLICIES (service-role bypasses; anon blocked) ───
-- organizations: service role only (no public read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'organizations' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON organizations
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- properties: service role only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'properties' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON properties
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- property_chatbot_settings: service role only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'property_chatbot_settings' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON property_chatbot_settings
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 8. FIX EXISTING BAD DEFAULT IN prompt_settings ──────────
-- schema.sql seeded 'gpt-5.4' (a non-existent model).  Correct to gpt-4o.
UPDATE prompt_settings
SET llm_model = 'gpt-4o', updated_at = NOW()
WHERE name = 'default' AND llm_model = 'gpt-5.4';
