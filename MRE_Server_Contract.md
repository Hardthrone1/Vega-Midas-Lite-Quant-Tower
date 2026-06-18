# MRE_Server.py — MIDAS v0.4 WebSocket Contract

**Purpose:** Reference implementation of the server side that `index_ws.html` expects.

---

## Message Types (Server → Client)

### 1. HISTORY (on connect, optional but recommended)
Send a bulk load of closed bars to pre-populate the chart.

```python
import json
import asyncio
import websockets
from datetime import datetime, timezone

async def send_history(ws, bars):
    """
    bars: list of dicts, each with keys {time, open, high, low, close}
    time must be Unix epoch seconds (UTC)
    """
    msg = {
        "type": "HISTORY",
        "data": bars
    }
    await ws.send(json.dumps(msg))
```

**Example (5 bars):**
```python
await send_history(ws, [
    {"time": 1718000000, "open": 2330.5, "high": 2335.2, "low": 2328.1, "close": 2332.4},
    {"time": 1718000300, "open": 2332.4, "high": 2340.1, "low": 2331.0, "close": 2337.8},
    {"time": 1718000600, "open": 2337.8, "high": 2339.5, "low": 2335.2, "close": 2336.1},
    {"time": 1718000900, "open": 2336.1, "high": 2338.9, "low": 2334.0, "close": 2335.5},
    {"time": 1718001200, "open": 2335.5, "high": 2341.2, "low": 2334.8, "close": 2340.6},
])
```

---

### 2. BAR_DATA (on each NEXT_BAR command)
Send a single closed bar.

```python
async def send_bar(ws, bar):
    """
    bar: dict with keys {time, open, high, low, close}
    time is Unix epoch seconds (UTC), REQUIRED to be unique and monotonic
    """
    msg = {
        "type": "BAR_DATA",
        "data": bar
    }
    await ws.send(json.dumps(msg))

# Example:
bar = {
    "time": 1718001500,
    "open": 2340.6,
    "high": 2342.3,
    "low": 2338.5,
    "close": 2341.0
}
await send_bar(ws, bar)
```

---

### 3. EOF (on end of replay data)
Signals that no more bars are available.

```python
async def send_eof(ws):
    msg = {"type": "EOF"}
    await ws.send(json.dumps(msg))
```

---

### 4. RESET_OK (after RESET command)
Confirms replay index was reset to 0.

```python
async def send_reset_ok(ws):
    msg = {"type": "RESET_OK"}
    await ws.send(json.dumps(msg))
```

---

### 5. ERROR (on any server-side issue)
Send an error message.

```python
async def send_error(ws, message):
    msg = {
        "type": "ERROR",
        "message": message
    }
    await ws.send(json.dumps(msg))
```

---

## Commands (Client → Server)

### NEXT_BAR
Client requests the next bar.

```python
if msg.get("command") == "NEXT_BAR":
    if replay_index >= len(bars):
        await send_eof(ws)
    else:
        bar = bars[replay_index]
        replay_index += 1
        await send_bar(ws, bar)
```

### RESET
Client requests a replay reset.

```python
if msg.get("command") == "RESET":
    replay_index = 0
    await send_reset_ok(ws)
```

---

## Time Format (CRITICAL)

**Requirement:** `time` field must be **Unix epoch seconds (UTC)**.

```python
import datetime as dt

# Correct:
now_utc = dt.datetime.now(dt.timezone.utc)
epoch_seconds = int(now_utc.timestamp())

# From a datetime object:
bar_dt = dt.datetime(2026, 6, 18, 14, 30, 0, tzinfo=dt.timezone.utc)
bar_time = int(bar_dt.timestamp())  # → 1718724600

# Do NOT use:
# - string timestamps ("2026-06-18T14:30:00Z") ← WRONG
# - milliseconds (1718724600000) ← WRONG
# - local time without UTC ← WRONG
```

**Verification:** In JS, the bar's timestamp should decode as:
```javascript
const ts = 1718724600;
new Date(ts * 1000).toISOString();  // "2026-06-18T14:30:00.000Z"
```

---

## Sample Full Server (FastAPI + asyncio)

```python
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import uvicorn

app = FastAPI()

# In-memory replay data — load from CSV / backtest output / etc.
REPLAY_BARS = [
    {"time": 1718724600, "open": 2330.5, "high": 2335.2, "low": 2328.1, "close": 2332.4},
    {"time": 1718724900, "open": 2332.4, "high": 2340.1, "low": 2331.0, "close": 2337.8},
    # ... your bars here ...
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
        # Send history on connect
        await ws.send_json({
            "type": "HISTORY",
            "data": REPLAY_BARS[:min(60, len(REPLAY_BARS))]  # First 60 bars
        })
        
        while True:
            msg = await ws.receive_json()
            
            if msg.get("command") == "NEXT_BAR":
                bar = await session.next_bar()
                if bar:
                    await ws.send_json({"type": "BAR_DATA", "data": bar})
                else:
                    await ws.send_json({"type": "EOF"})
            
            elif msg.get("command") == "RESET":
                session.reset()
                await ws.send_json({"type": "RESET_OK"})
            
            else:
                await ws.send_json({
                    "type": "ERROR",
                    "message": f"Unknown command: {msg.get('command')}"
                })
    
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {e}")
        await ws.send_json({"type": "ERROR", "message": str(e)})

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8002)
```

**Run:**
```bash
pip install fastapi uvicorn websockets
python MRE_Server.py
# Server listening on ws://127.0.0.1:8002/ws/stream
```

---

## Loading Bars from CSV

```python
import csv
from datetime import datetime, timezone

def load_csv(filepath):
    bars = []
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Assume CSV has: time, open, high, low, close
            # If time is a string like "2026-06-18 14:30:00", parse it:
            dt_str = row['time']
            bar_dt = datetime.fromisoformat(dt_str.replace(' ', 'T'))
            if bar_dt.tzinfo is None:
                bar_dt = bar_dt.replace(tzinfo=timezone.utc)
            
            bars.append({
                "time": int(bar_dt.timestamp()),
                "open": float(row['open']),
                "high": float(row['high']),
                "low": float(row['low']),
                "close": float(row['close']),
            })
    return bars

REPLAY_BARS = load_csv("backtest_data.csv")
```

---

## Error Handling

Server should catch and report:
- Missing required fields in a bar
- Non-numeric values
- Invalid time (≤ 0 or non-monotonic)
- File read errors

```python
async def validate_bar(bar):
    try:
        assert bar.get("time") and isinstance(bar["time"], (int, float))
        assert bar.get("open") and isinstance(bar["open"], (int, float))
        assert bar.get("high") and isinstance(bar["high"], (int, float))
        assert bar.get("low") and isinstance(bar["low"], (int, float))
        assert bar.get("close") and isinstance(bar["close"], (int, float))
        assert bar["high"] >= bar["low"]
        assert bar["open"] > 0
        assert bar["close"] > 0
        return True
    except (AssertionError, KeyError, TypeError) as e:
        return False

if not await validate_bar(bar):
    await send_error(ws, f"Invalid bar: {bar}")
```

---

## Connection Flow (Sequence Diagram)

```
Client                           Server
  |                                |
  +------- WebSocket Connect ------>|
  |                                |
  |<----- HISTORY (60 bars) --------+
  |                                |
  +------- NEXT_BAR command ------->|
  |                                |
  |<------ BAR_DATA ----------------+
  |      (chart updates)            |
  |                                |
  +------- NEXT_BAR command ------->|
  |                                |
  |<------ BAR_DATA ----------------+
  |                                |
  |         ... (repeat) ...        |
  |                                |
  +------- NEXT_BAR command ------->|
  |                                |
  |<---------- EOF -----------------+
  |  (AUTO stops, log shows end)   |
  |                                |
  +------- RESET command --------->|
  |                                |
  |<------- RESET_OK ---------------+
  |  (chart cleared, index=0)       |
  |                                |
  +------- NEXT_BAR command ------->|
  |                                |
  (replay cycle restarts)           |
```

---

## Quick Validation

Test your server with `wscat`:

```bash
npm install -g wscat
wscat -c ws://127.0.0.1:8002/ws/stream

# Connected. Type your command:
> {"command": "NEXT_BAR"}
< {"type":"BAR_DATA","data":{"time":1718724600,...}}

> {"command": "RESET"}
< {"type":"RESET_OK"}

> {"command": "NEXT_BAR"}
< {"type":"BAR_DATA","data":{"time":1718724600,...}}
```

Or use Python:

```python
import asyncio
import websockets
import json

async def test():
    async with websockets.connect('ws://127.0.0.1:8002/ws/stream') as ws:
        # Receive HISTORY
        msg = await ws.recv()
        data = json.loads(msg)
        print(f"Got {data['type']}: {len(data['data'])} bars")
        
        # Request a bar
        await ws.send(json.dumps({"command": "NEXT_BAR"}))
        bar = await ws.recv()
        print(f"Got {bar}")

asyncio.run(test())
```

---

*Reference: v0.4 WebSocket contract. All 21 correctness checks passed on the client side.*
