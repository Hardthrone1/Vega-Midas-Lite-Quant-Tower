# SYSTEM_BLUEPRINT.md: Multi-Engine Architecture

## 1. Frontend Command Center (Port 8000)
- **UI Stack**: Tailwind CSS Engine for a clean, modern HUD aesthetic.
- **Charts**: Interactive data visualization powered by TradingView Lightweight Charts (`backtest-kit`).
- **Data Hook**: Listens to an active local WebSocket server for streaming data playback.

## 2. Local Broker & Replay Engine (Port 8002 / WebSocket)
- **Engine**: Python FastAPI streaming core reading raw local CSV/binary sets.
- **Math Matrix**: Enforces hard tick values, execution buffers, and spread widening rules based on historic ECN order-book behavior.
- **Execution Routing**: For custom multi-asset strategy evaluation, hands off script parameters to QuantConnect's `lean-engine` or `qstrader` frameworks.

## 3. Intelligence & Proxy Layer (Port 8001)
- **Core Hub**: Express Node.js Proxy interacting with local OpenClaw workspace tooling.
- **RAG Repository**: Injects syntax patterns derived from local engineering manuals (TradingView Manual v5/v6, tradesdontlie schemas).