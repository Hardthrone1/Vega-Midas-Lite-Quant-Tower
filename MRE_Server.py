import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn
from datetime import datetime, timezone

app = FastAPI()

REPLAY_BARS = [
    {"time": 1718724600, "open": 2330.5, "high": 2335.2, "low": 2328.1, "close": 2332.4},
    {"time": 1718724900, "open": 2332.4, "high": 2340.1, "low": 2331.0, "close": 2337.8},
    {"time": 1718725200, "open": 2337.8, "high": 2339.5, "low": 2335.2, "close": 2336.1},
    {"time": 1718725500, "open": 2336.1, "high": 2338.9, "low": 2334.0, "close": 2335.5},
    {"time": 1718725800, "open": 2335.5, "high": 2341.2, "low": 2334.8, "close": 2340.6},
    {"time": 1718726100, "open": 2340.6, "high": 2342.3, "low": 2338.5, "close": 2341.0},
    {"time": 1718726400, "open": 2341.0, "high": 2344.8, "low": 2340.2, "close": 2344.1},
    {"time": 1718726700, "open": 2344.1, "high": 2345.6, "low": 2342.0, "close": 2343.5},
    {"time": 1718727000, "open": 2343.5, "high": 2346.2, "low": 2342.8, "close": 2345.9},
    {"time": 1718727300, "open": 2345.9, "high": 2348.1, "low": 2345.0, "close": 2347.2},
    {"time": 1718727600, "open": 2347.2, "high": 2349.5, "low": 2346.1, "close": 2348.8},
    {"time": 1718727900, "open": 2348.8, "high": 2350.3, "low": 2348.0, "close": 2349.5},
    {"time": 1718728200, "open": 2349.5, "high": 2351.2, "low": 2349.0, "close": 2350.7},
    {"time": 1718728500, "open": 2350.7, "high": 2352.1, "low": 2350.2, "close": 2351.4},
    {"time": 1718728800, "open": 2351.4, "high": 2353.8, "low": 2350.8, "close": 2353.1},
    {"time": 1718729100, "open": 2353.1, "high": 2354.5, "low": 2352.0, "close": 2353.9},
    {"time": 1718729400, "open": 2353.9, "high": 2355.6, "low": 2353.2, "close": 2355.0},
    {"time": 1718729700, "open": 2355.0, "high": 2356.3, "low": 2354.1, "close": 2355.8},
    {"time": 1718730000, "open": 2355.8, "high": 2357.2, "low": 2355.0, "close": 2356.5},
    {"time": 1718730300, "open": 2356.5, "high": 2358.1, "low": 2355.8, "close": 2357.3},
]

class ReplaySession:
    def __init__(self, bars):
        self.bars = bars
        self.index = 0
    
    async def next_bar(self):
        if self.index >= len(self.bars):
            return None
        bar = self.bars[self.index]
        self.index += 1
        return bar
    
    def reset(self):
        self.index = 0

@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket):
    await ws.accept()
    session = ReplaySession(REPLAY_BARS)
    
    try:
        history_count = min(60, len(REPLAY_BARS))
        await ws.send_json({
            "type": "HISTORY",
            "data": REPLAY_BARS[:history_count]
        })
        print(f"[CONNECT] Sent HISTORY: {history_count} bars")
        
        while True:
            msg = await ws.receive_json()
            
            if msg.get("command") == "NEXT_BAR":
                bar = await session.next_bar()
                if bar:
                    await ws.send_json({
                        "type": "BAR_DATA",
                        "data": bar
                    })
                    print(f"[BAR #{session.index}] time={bar['time']} close={bar['close']}")
                else:
                    await ws.send_json({"type": "EOF"})
                    print("[EOF] Replay ended")
            
            elif msg.get("command") == "RESET":
                session.reset()
                await ws.send_json({"type": "RESET_OK"})
                print("[RESET] Replay index reset to 0")
            
            else:
                await ws.send_json({
                    "type": "ERROR",
                    "message": f"Unknown command: {msg.get('command')}"
                })
                print(f"[ERROR] Unknown command: {msg.get('command')}")
    
    except WebSocketDisconnect:
        print("[DISCONNECT] Client disconnected")
    except Exception as e:
        print(f"[ERROR] {e}")
        try:
            await ws.send_json({
                "type": "ERROR",
                "message": str(e)
            })
        except:
            pass

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "bars_loaded": len(REPLAY_BARS),
        "ws_endpoint": "ws://127.0.0.1:8002/ws/stream"
    }

if __name__ == "__main__":
    print("=" * 70)
    print("Vega MRE Server v0.4")
    print("=" * 70)
    print(f"Loaded {len(REPLAY_BARS)} bars")
    print("Listening on ws://127.0.0.1:8002/ws/stream")
    print("=" * 70)
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="info")
