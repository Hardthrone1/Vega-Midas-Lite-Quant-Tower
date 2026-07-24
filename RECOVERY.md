# MIDAS / VEGA — Disaster Recovery

If the machine dies, **the code is disposable — it all comes back from `git clone`.**
What does *not* come back is a small set of local-only files that are (correctly)
kept out of git. Back those up and a dead box is a non-event.

---

## What git already has (no action needed)

`git clone` restores the entire system:

- All source: `hermes/`, `codegen/`, `skills/`, `midas_code/` (the dashboard),
  `parity_engine/`, `Vega_Gateway_Server.js`, `MRE_Server.py`, `launch_vega_suite.ps1`
- Committed artifacts: `codegen_output.json`, `hermes_state.json`,
  `backtest_payload.json`, `divergence_report.json`
- `graphify-out/` (codebase graph + Obsidian vault), `MIDAS_INSTRUCTIONS.md`
- `package-lock.json` — so `npm install` restores exact dependency versions

---

## What git does NOT have — YOUR backup responsibility

These are gitignored on purpose (secrets + bulk data). Keep copies off-machine.

### 1. `.env` — every API key (CRITICAL)

The gateway reads ~20 provider secrets. Without them, the Swarm / Intake /
Agent-Console blades can reach no model. Back up the whole `.env` file.

Variables the gateway expects (names only — values are yours):

```
DEFAULT_PROVIDER   ALLOWED_ORIGINS   WORKSPACE_PATH
NVIDIA_API_KEY  NVIDIA_BASE_URL
NVIDIA_KEY_INTAKE  NVIDIA_KEY_BACKTEST  NVIDIA_KEY_LINT  NVIDIA_KEY_PINE
NVIDIA_MODEL_INTAKE  NVIDIA_MODEL_BACKTEST  NVIDIA_MODEL_LINT  NVIDIA_MODEL_PINE
GEMINI_API_KEY  GEMINI_BASE_URL  GEMINI_MODEL
DEEPSEEK_API_KEY  DEEPSEEK_BASE_URL
GROK_API_KEY  GROK_BASE_URL   XAI_API_KEY  XAI_BASE_URL
OPENROUTER_API_KEY  OPENROUTER_MODEL
OPENROUTER_MODEL_INTAKE  OPENROUTER_MODEL_BACKTEST  OPENROUTER_MODEL_LINT  OPENROUTER_MODEL_PINE
```

### 2. Market-data CSVs (`*.csv` — "quant lab data")

Gitignored by design. Upload the actual files to Drive (too large to paste safely):

| File | ~Size | Purpose |
|------|-------|---------|
| `mgc_5m_et.csv` | 198 KB | 5-min MGC bars — primary backtest dataset |
| `mgc_1m_et.csv` | 816 KB | 1-min MGC bars — intrabar / trap-detection replay |
| `pine_truth_157_trades.csv` | 10 KB | Pine's exported trades — parity "truth" reference |

(Any other `*.csv` you generate — sweep results, pine exports — is also local-only.)

### 3. The Vault (browser localStorage — not a file)

Saved Pine scripts + spec versions persist in the browser under the key
`Vega-strategy-store`, not on disk. To export as copy-paste text, open the
dashboard → **F12** → **Console**:

```js
copy(localStorage.getItem('Vega-strategy-store'))
```

Paste the JSON into a doc. (Skip if you've never saved anything in the Vault blade.)

---

## Recovery runbook (fresh machine)

```powershell
git clone https://github.com/Hardthrone1/Vega-Midas-Lite-Quant-Tower
cd Vega-Midas-Lite-Quant-Tower

# 1. Restore your backed-up .env to the repo root
# 2. Drop the market CSVs back into the repo root
# 3. Dependencies
cd midas_code; npm install; cd ..
pip install -r requirements.txt        # if present

# 4. Launch (frees ports, regenerates runtime artifacts, starts Gateway + MRE + dashboard)
powershell -ExecutionPolicy Bypass -File launch_vega_suite.ps1
```

Restore the Vault last, after the dashboard has loaded once:

```js
localStorage.setItem('Vega-strategy-store', `PASTE_THE_JSON_HERE`)
```
Then refresh.

---

## Backup checklist

- [ ] `.env` → secure store (password manager / private doc)
- [ ] `mgc_5m_et.csv` → Drive
- [ ] `mgc_1m_et.csv` → Drive
- [ ] `pine_truth_157_trades.csv` → Drive
- [ ] Vault JSON → doc (only if the Vault has saved entries)

The machine is replaceable. These five are not.
