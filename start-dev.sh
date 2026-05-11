#!/bin/bash
# TalknShop Dev Launcher
# Starts: ngrok tunnel, seller-crosspost-service, Metro bundler
# Usage: ./start-dev.sh

set -e
REPO="$(cd "$(dirname "$0")" && pwd)"

echo "=== TalknShop Dev Launcher ==="

# ── 1. Kill stale processes ────────────────────────────────────────────────────
echo "[1/4] Cleaning up stale processes..."
lsof -ti:8003 | xargs kill -9 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
pkill -f ngrok 2>/dev/null || true
sleep 1

# ── 2. Start ngrok → get URL → update .env ───────────────────────────────────
echo "[2/4] Starting ngrok tunnel (port 8003)..."
ngrok http 8003 --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!
sleep 5

NGROK_URL=$(curl -s http://localhost:4040/api/tunnels \
  | python3 -c "import sys,json; ts=json.load(sys.stdin)['tunnels']; \
    print(next((t['public_url'] for t in ts if t['proto']=='https'), ''))" 2>/dev/null)

if [ -z "$NGROK_URL" ]; then
  echo "  ⚠️  ngrok failed to start — images will use Unsplash placeholders"
  NGROK_URL=""
else
  echo "  ✅ ngrok: $NGROK_URL"
  # Update the .env file with the new ngrok URL
  sed -i '' "s|^NGROK_URL=.*|NGROK_URL=$NGROK_URL|" \
    "$REPO/apps/seller-crosspost-service/.env"
fi

# ── 3. Start seller-crosspost-service ─────────────────────────────────────────
echo "[3/4] Starting seller-crosspost-service (port 8003)..."
cd "$REPO/apps/seller-crosspost-service"
NGROK_URL=$NGROK_URL python3 -m uvicorn main:app \
  --host 0.0.0.0 --port 8003 --reload > /tmp/crosspost.log 2>&1 &
CROSSPOST_PID=$!
sleep 3

if curl -sf http://localhost:8003/health > /dev/null 2>&1; then
  echo "  ✅ seller-crosspost-service ready"
else
  echo "  ❌ seller-crosspost-service failed to start — check /tmp/crosspost.log"
fi

# ── 4. Start Metro bundler ─────────────────────────────────────────────────────
echo "[4/4] Starting Metro bundler (port 8081)..."
cd "$REPO/apps/TalknShopApp"
npx expo start --port 8081 --clear &
METRO_PID=$!
sleep 6

if curl -sf http://localhost:8081/status > /dev/null 2>&1; then
  echo "  ✅ Metro ready"
else
  echo "  ⚠️  Metro still warming up — check terminal for QR code"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== All services running ==="
echo "  ngrok:              $NGROK_URL"
echo "  crosspost-service:  http://localhost:8003"
echo "  Metro bundler:      http://localhost:8081"
echo ""
echo "PIDs: ngrok=$NGROK_PID  crosspost=$CROSSPOST_PID  metro=$METRO_PID"
echo "Logs: /tmp/ngrok.log  /tmp/crosspost.log"
echo ""
echo "Press Ctrl+C to stop all services."

# Keep script alive and clean up on exit
trap "echo 'Stopping...'; kill $NGROK_PID $CROSSPOST_PID $METRO_PID 2>/dev/null; exit 0" INT TERM
wait
