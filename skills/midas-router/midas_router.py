"""
midas_router.py — Model Tier Selection, as a Hermes runtime skill.

Skill ID:   AGT-RTR-001
Phase:      5
Status:     LIVE — routes LLM calls through the locked tier system.

Tier system (locked):
  Tier 1: NVIDIA NIM free endpoints (first choice)
  Tier 2: Gemini, Groq, Deepseek
  Tier 3: OpenRouter (fallback)

Uses the Vega Gateway Server (:8001) when available, falls back to direct
provider calls via litellm or raw HTTP.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional


SKILL_ID = "AGT-RTR-001"

VEGA_GATEWAY_URL = os.environ.get("VEGA_GATEWAY_URL", "http://localhost:8001")

TIER_CONFIG = [
    {
        "tier": 1,
        "name": "nvidia_nim",
        "models": ["meta/llama-3.1-8b-instruct", "meta/llama-3.1-70b-instruct"],
        "base_url": "https://integrate.api.nvidia.com/v1",
        "env_key": "NVIDIA_API_KEY",
    },
    {
        "tier": 2,
        "name": "gemini",
        "models": ["gemini/gemini-2.0-flash"],
        "base_url": None,
        "env_key": "GEMINI_API_KEY",
    },
    {
        "tier": 2,
        "name": "groq",
        "models": ["groq/llama-3.1-8b-instant"],
        "base_url": None,
        "env_key": "GROQ_API_KEY",
    },
    {
        "tier": 2,
        "name": "deepseek",
        "models": ["deepseek/deepseek-chat"],
        "base_url": None,
        "env_key": "DEEPSEEK_API_KEY",
    },
    {
        "tier": 3,
        "name": "openrouter",
        "models": ["openrouter/meta-llama/llama-3.1-8b-instruct:free"],
        "base_url": "https://openrouter.ai/api/v1",
        "env_key": "OPENROUTER_API_KEY",
    },
]

TASK_MODEL_MAP = {
    "structure": 0,
    "quant": 0,
    "synthesis": 1,
    "code": 0,
    "lint": 0,
    "general": 0,
}


@dataclass
class RouterResult:
    skill_id: str
    ok: bool
    text: str = ""
    provider: str = ""
    model: str = ""
    tier: int = 0
    fallback_chain: list[str] = field(default_factory=list)
    latency_ms: int = 0
    tokens: dict[str, int] = field(default_factory=dict)
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _try_vega_gateway(prompt: str, task: str, system_prompt: Optional[str]) -> Optional[RouterResult]:
    try:
        import urllib.request
        payload = json.dumps({
            "messages": [
                *([{"role": "system", "content": system_prompt}] if system_prompt else []),
                {"role": "user", "content": prompt},
            ],
            "task": task,
        }).encode()
        req = urllib.request.Request(
            f"{VEGA_GATEWAY_URL}/v1/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        t0 = time.monotonic()
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        latency = int((time.monotonic() - t0) * 1000)

        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage", {})
        return RouterResult(
            skill_id=SKILL_ID,
            ok=bool(text),
            text=text,
            provider="vega_gateway",
            model=data.get("model", "unknown"),
            tier=0,
            fallback_chain=["vega_gateway"],
            latency_ms=latency,
            tokens={"input": usage.get("prompt_tokens", 0), "output": usage.get("completion_tokens", 0)},
        )
    except Exception:
        return None


def _try_litellm(prompt: str, system_prompt: Optional[str], provider: dict) -> Optional[RouterResult]:
    try:
        import litellm
        model = provider["models"][0]
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        api_key = os.environ.get(provider["env_key"], "")
        if not api_key:
            return None

        t0 = time.monotonic()
        resp = litellm.completion(
            model=model,
            messages=messages,
            api_key=api_key,
            base_url=provider.get("base_url"),
            timeout=30,
        )
        latency = int((time.monotonic() - t0) * 1000)

        text = resp.choices[0].message.content or ""
        usage = resp.usage
        return RouterResult(
            skill_id=SKILL_ID,
            ok=bool(text),
            text=text,
            provider=provider["name"],
            model=model,
            tier=provider["tier"],
            fallback_chain=[provider["name"]],
            latency_ms=latency,
            tokens={"input": getattr(usage, "prompt_tokens", 0), "output": getattr(usage, "completion_tokens", 0)},
        )
    except Exception:
        return None


def route(
    prompt: str,
    task: str = "general",
    system_prompt: Optional[str] = None,
) -> RouterResult:
    if not prompt or not prompt.strip():
        return RouterResult(SKILL_ID, ok=False, error="empty prompt")

    fallback_chain = []

    gw = _try_vega_gateway(prompt, task, system_prompt)
    if gw and gw.ok:
        return gw
    fallback_chain.append("vega_gateway")

    model_idx = TASK_MODEL_MAP.get(task, 0)
    sorted_tiers = sorted(TIER_CONFIG, key=lambda t: t["tier"])

    for provider in sorted_tiers:
        result = _try_litellm(prompt, system_prompt, provider)
        fallback_chain.append(provider["name"])
        if result and result.ok:
            result.fallback_chain = fallback_chain
            return result
        time.sleep(0.5)

    return RouterResult(
        SKILL_ID,
        ok=False,
        error="all providers exhausted",
        fallback_chain=fallback_chain,
    )


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Router",
    "entrypoint": route,
    "phase": 5,
    "runtime_skill": True,
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_router", description="Model tier selection skill.")
    ap.add_argument("--prompt", required=True, help="the prompt to route")
    ap.add_argument("--task", default="general", choices=list(TASK_MODEL_MAP.keys()))
    ap.add_argument("--system-prompt", help="optional system prompt")
    ap.add_argument("--output", help="write JSON result to file")
    args = ap.parse_args(argv)

    result = route(args.prompt, args.task, args.system_prompt)
    out = json.dumps(result.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
