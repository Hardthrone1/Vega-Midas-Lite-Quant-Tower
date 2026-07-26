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

## What is not deployed

- **MRE replay server** (`MRE_Server.py`, port 8002) — the Replay blade's live
  WebSocket feed. Local-only; deploy it as a second Railway service if needed.
- **Market CSVs** — gitignored, never uploaded.
- **Quant skills** (`skills/`, `hermes/`) — local analysis tools.
