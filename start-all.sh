#!/bin/bash
# start-all.sh — Starts both apps in separate Terminal tabs
# SAWhatsApp/platform → http://localhost:3001
# SAChatbot           → http://localhost:3000

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  SA WhatsApp + Chatbot — Dev Server Launcher     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check node
if ! command -v node &> /dev/null; then
  echo "❌  Node.js not found. Install from https://nodejs.org"
  exit 1
fi

echo "📦  Installing deps if needed..."
(cd "$ROOT/SAWhatsApp/platform" && [ ! -d node_modules ] && npm install --silent || true)
(cd "$ROOT/SAChatbot"           && [ ! -d node_modules ] && npm install --silent || true)

echo ""
echo "🚀  Starting servers..."
echo ""
echo "  WhatsApp Admin   → http://localhost:3001"
echo "  WhatsApp Admin   → http://localhost:3001/admin"
echo "  Webhook endpoint → http://localhost:3001/api/webhooks/twilio"
echo "  Health check     → http://localhost:3001/api/health"
echo ""
echo "  Chatbot UI       → http://localhost:3000"
echo ""
echo "Press Ctrl+C in each tab to stop."
echo ""

# Open SAWhatsApp in a new terminal tab (macOS)
osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT/SAWhatsApp/platform' && npm run dev -- --port 3001\""

# Small delay so terminal windows don't open on top of each other
sleep 1

# Open SAChatbot in another new terminal tab
osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT/SAChatbot' && npm run dev -- --port 3000\""

echo "✅  Two terminal tabs opened. Servers starting..."
echo ""
echo "Once both are running, open:"
echo "  Admin dashboard  → http://localhost:3001/admin"
echo "  Chatbot          → http://localhost:3000"
