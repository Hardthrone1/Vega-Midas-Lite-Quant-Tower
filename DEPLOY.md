# Deploying to Railway

One service: the Node gateway serves the API **and** the built dashboard from
the same origin. Vite is a build step, not a running server.

---

## Why it was crash-looping

| Cause | Fix |
|---|---|
| `app.listen(PORT, '127.0.0.1')` — loopback only, unreachable inside a container, health check fails | binds `0.0.0.0` when `RAILWAY_ENVIRONMENT` is set |
| `const PORT = 8001` hardcoded — Railway assigns a random `$PORT` | `process.env.PORT \|\| 8001` |
| Root `package.json` had no `start`/`build` script (only `test`, which ran `exit 1`) | both added |
| No build/deploy definition | `railway.json` |
| Mixed Node + Python repo confuses the builder | `.nixpacksignore` excludes the Python tools |
| `react-devtools` devDep downloads an Electron binary during install | build sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` |

`launch_vega_suite.ps1` is PowerShell and never runs on Railway — it stays a
local-only launcher.

---

## Setup

1. **New Project → Deploy from GitHub repo** → pick this repo.
   Railway reads `railway.json`; no build/start command needs typing.

2. **Variables** — add your provider keys (same names as local `.env`), plus:

   | Variable | Value |
   |---|---|
   | `VEGA_API_KEY` | a long random string you invent — the gateway rejects any `/api/*` request without it |
   | `ALLOWED_ORIGINS` | your Railway URL, e.g. `https://vega-production.up.railway.app` |
   | `DEFAULT_PROVIDER` | e.g. `nvidia_intake` |
   | `NVIDIA_API_KEY`, `GEMINI_API_KEY`, … | as in `.env` |

   Do **not** set `PORT` — Railway injects it.

3. **Networking → Generate Domain.** That URL serves the dashboard.

4. **Rebuild after setting `VEGA_API_KEY`.** The browser bundle needs the
   matching secret baked in at build time, so also add:

   | Variable | Value |
   |---|---|
   | `VITE_VEGA_KEY` | same value as `VEGA_API_KEY` |

   `VITE_GATEWAY_URL` is **not** needed — a production build calls the API
   same-origin.

---

## Verify

```bash
curl https://<your-app>.up.railway.app/api/health          # 200
curl -X POST https://<your-app>.up.railway.app/api/v1/chat/completions \
     -H 'Content-Type: application/json' -d '{}'           # 401 (auth works)
```

Then open the URL — Intake, Swarm, and the Agent Console should reach the
gateway with no CORS configuration at all.

---

## Security note

`VITE_VEGA_KEY` is compiled into the browser bundle, so anyone who loads the
page can read it. It stops casual scraping and drive-by abuse of your provider
credits — it is **not** a secret from your own users. If the deployment needs
to be genuinely private, put Railway behind auth or add per-user sessions
rather than relying on this shared key.

---

## Signal capture (the reason to run this on Railway at all)

The dashboard itself is better off local. What a cloud box gives you is a
**public URL TradingView can POST to** — your laptop has no public IP and
sleeps. This records every regime flip and strategy signal 24/7.

### 1. Add storage

Railway → **New → Database → Postgres**. It injects `DATABASE_URL`
automatically; the `signals` table is created on boot.

Without Postgres the gateway falls back to `signals.jsonl` on the container
filesystem, which **Railway wipes on every redeploy**. Fine for a smoke test,
useless for accumulating history.

### 2. Set a webhook token

| Variable | Value |
|---|---|
| `WEBHOOK_TOKEN` | a long random string |

TradingView cannot send custom headers, so this secret lives in the URL:

```
https://<your-app>.up.railway.app/api/webhook/tradingview/<WEBHOOK_TOKEN>
```

Treat that whole URL as the credential. Anyone who has it can write rows.

### 3. Create the TradingView alert

On a chart running **MIDAS Regime Filter v3**:

1. Right-click → **Add alert**
2. **Condition**: the indicator → **Any alert() function call**
3. Leave the **Message** box empty — `alert()` supplies the JSON body itself
4. **Notifications → Webhook URL**: paste the URL from step 2
5. Save

Each regime change now POSTs a full diagnostic row: regime code and label,
plus the ER / ADX / vol-ratio / ATR readings and which rule decided the bar.

### 4. Verify

```bash
# should return 200 and an id
curl -X POST https://<your-app>.up.railway.app/api/webhook/tradingview/<TOKEN> \
     -H 'Content-Type: application/json' \
     -d '{"event":"test","symbol":"MGC1!","price":4200}'

# read it back
curl -H "X-Vega-Key: $VEGA_API_KEY" https://<your-app>.up.railway.app/api/signals
```

`/api/health` reports `signalStore` (`postgres` or `jsonl`) and `signalCount`.

### Reading the data back

```
GET /api/signals?limit=200&symbol=MGC1!&event=regime_change
```
Requires the `X-Vega-Key` header. The QBT-003 slicer can be pointed at
exported rows once you have enough of them to be worth slicing.

---

## What is not deployed

- **MRE replay server** (`MRE_Server.py`, port 8002) — the Replay blade's live
  WebSocket feed. Local-only; deploy it as a second Railway service if needed.
- **Market CSVs** — gitignored, never uploaded.
- **Quant skills** (`skills/`, `hermes/`) — local analysis tools.
