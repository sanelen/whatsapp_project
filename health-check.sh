#!/bin/bash
# health-check.sh — Tests all connections once servers are running

ROOT="$(cd "$(dirname "$0")" && pwd)"
source "$ROOT/SAWhatsApp/platform/.env.local" 2>/dev/null

PASS=0; FAIL=0; WARN=0

ok()   { echo "  ✅  $1"; ((PASS++)); }
fail() { echo "  ❌  $1"; ((FAIL++)); }
warn() { echo "  ⚠️   $1"; ((WARN++)); }

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Health Check — SA WhatsApp + Chatbot            ║"
echo "╚══════════════════════════════════════════════════╝"

# ─── 1. ENV VARIABLES ────────────────────────────────────────
echo ""
echo "── Environment Variables ──────────────────────────────"
[ -n "$NEXT_PUBLIC_SUPABASE_URL" ]        && ok "SUPABASE_URL set"              || fail "SUPABASE_URL missing"
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ]       && ok "SUPABASE_SERVICE_ROLE_KEY set" || fail "SUPABASE_SERVICE_ROLE_KEY missing"
[ -n "$TWILIO_ACCOUNT_SID" ]              && ok "TWILIO_ACCOUNT_SID set"        || warn "TWILIO_ACCOUNT_SID missing — Twilio disabled"
[ -n "$TWILIO_AUTH_TOKEN" ]               && ok "TWILIO_AUTH_TOKEN set"         || warn "TWILIO_AUTH_TOKEN missing — Twilio disabled"
[ -n "$TWILIO_PHONE_NUMBER_ID" ]          && ok "TWILIO_PHONE_NUMBER_ID set"    || warn "TWILIO_PHONE_NUMBER_ID missing"

source "$ROOT/SAChatbot/.env.local" 2>/dev/null
[ -n "$OPENAI_API_KEY" ]                  && ok "OPENAI_API_KEY set"            || warn "OPENAI_API_KEY missing — AI replies disabled"

source "$ROOT/SAWhatsApp/platform/.env.local" 2>/dev/null

# ─── 2. LOCAL SERVERS ────────────────────────────────────────
echo ""
echo "── Local Servers ──────────────────────────────────────"

check_url() {
  local label="$1"; local url="$2"; local expect="$3"
  local status
  status=$(curl -s -o /tmp/hc_body -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
  if [ "$status" = "$expect" ]; then
    ok "$label ($url)"
  else
    fail "$label — HTTP $status (expected $expect) → $url"
  fi
}

check_url "SAWhatsApp health"     "http://localhost:3001/api/health"          "200"
check_url "SAWhatsApp home"       "http://localhost:3001"                     "200"
check_url "Admin dashboard"       "http://localhost:3001/admin"               "200"
check_url "Twilio webhook (GET)"  "http://localhost:3001/api/webhooks/twilio" "200"
check_url "Chatbot UI"            "http://localhost:3000"                     "200"
check_url "Chat API (no body)"    "http://localhost:3000/api/chat"            "405"  # POST-only → 405 on GET

# ─── 3. SUPABASE ─────────────────────────────────────────────
echo ""
echo "── Supabase Database ──────────────────────────────────"

SUPA_URL="$NEXT_PUBLIC_SUPABASE_URL"
SUPA_KEY="$SUPABASE_SERVICE_ROLE_KEY"

if [ -z "$SUPA_URL" ] || [ -z "$SUPA_KEY" ]; then
  fail "Supabase credentials not set — skipping DB tests"
else
  test_table() {
    local table="$1"
    local result
    result=$(curl -s --max-time 8 \
      -H "apikey: $SUPA_KEY" \
      -H "Authorization: Bearer $SUPA_KEY" \
      "${SUPA_URL}/rest/v1/${table}?select=id&limit=1" 2>/dev/null)
    if echo "$result" | grep -q '^\['; then
      ok "$table table accessible"
    else
      local code=$(echo "$result" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("code","?"))' 2>/dev/null || echo "?")
      fail "$table — code:$code"
    fi
  }

  test_table "customers"
  test_table "conversations"
  test_table "messages"
  test_table "assistant_settings"
  test_table "knowledge_base"
  test_table "organizations"
  test_table "properties"
  test_table "property_chatbot_settings"

  # Seed data check
  ORGS=$(curl -s --max-time 8 \
    -H "apikey: $SUPA_KEY" \
    -H "Authorization: Bearer $SUPA_KEY" \
    "${SUPA_URL}/rest/v1/organizations?select=name,slug&limit=5" 2>/dev/null)
  if echo "$ORGS" | grep -q "hamba-trading"; then
    ok "Seed data present: Hamba Trading"
  else
    warn "Seed data missing — run migration 202605280002_tenant_register.sql in Supabase"
  fi

  PROPS=$(curl -s --max-time 8 \
    -H "apikey: $SUPA_KEY" \
    -H "Authorization: Bearer $SUPA_KEY" \
    "${SUPA_URL}/rest/v1/properties?select=name&limit=5" 2>/dev/null)
  if echo "$PROPS" | grep -q "Essex"; then
    ok "Seed data present: 33 Essex"
  else
    warn "33 Essex property not found — run migration 202605280002_tenant_register.sql"
  fi
fi

# ─── 4. TWILIO ───────────────────────────────────────────────
echo ""
echo "── Twilio ──────────────────────────────────────────────"
if [ -n "$TWILIO_ACCOUNT_SID" ] && [ -n "$TWILIO_AUTH_TOKEN" ]; then
  TW_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 \
    -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
    "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID.json" 2>/dev/null)
  [ "$TW_STATUS" = "200" ] && ok "Twilio credentials valid (HTTP 200)" || fail "Twilio auth failed (HTTP $TW_STATUS)"
else
  warn "Skipping Twilio API test — credentials not set in .env.local"
  echo "      Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER_ID to:"
  echo "      $ROOT/SAWhatsApp/platform/.env.local"
fi

# ─── SUMMARY ─────────────────────────────────────────────────
echo ""
echo "── Summary ─────────────────────────────────────────────"
echo "  ✅  Passed:   $PASS"
echo "  ⚠️   Warnings: $WARN"
echo "  ❌  Failed:   $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Some checks failed. Make sure servers are running: bash start-all.sh"
else
  echo "All critical checks passed 🎉"
fi
echo ""
