#!/bin/bash
# Start MIDAS services with Headroom compression proxy

set -e

echo "🚀 MIDAS Startup with Headroom Compression Proxy"
echo "================================================="

# Check if Headroom is installed
if ! command -v headroom &> /dev/null; then
    echo "❌ Headroom not found. Install with: pip install 'headroom-ai[mcp]'"
    exit 1
fi

# Start Headroom proxy in background
echo "📡 Starting Headroom proxy on http://127.0.0.1:8787..."
headroom proxy &
HEADROOM_PID=$!
sleep 2
echo "   ✅ Headroom proxy started (PID: $HEADROOM_PID)"

# Set proxy for all Claude API calls
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
echo "🔗 ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"

# Start Vega Gateway
echo ""
echo "🔧 Starting Vega Gateway Server..."
node Vega_Gateway_Server.js &
VEGA_PID=$!
sleep 2
echo "   ✅ Vega Gateway running on :8001 (PID: $VEGA_PID)"

# Start MRE Server
echo ""
echo "📊 Starting MRE Server..."
python MRE_Server.py &
MRE_PID=$!
sleep 2
echo "   ✅ MRE Server running on :8002 (PID: $MRE_PID)"

echo ""
echo "================================================="
echo "✅ All services running with Headroom compression!"
echo ""
echo "Services:"
echo "  • Vega Gateway (PID $VEGA_PID):   http://localhost:8001"
echo "  • MRE Server (PID $MRE_PID):     http://localhost:8002"
echo "  • Headroom Proxy (PID $HEADROOM_PID): http://127.0.0.1:8787"
echo ""
echo "Compression stats:"
echo "  headroom memory stats"
echo ""
echo "To stop: kill $HEADROOM_PID $VEGA_PID $MRE_PID"
echo "================================================="

# Keep script running and handle cleanup
trap "kill $HEADROOM_PID $VEGA_PID $MRE_PID 2>/dev/null || true" EXIT
wait
