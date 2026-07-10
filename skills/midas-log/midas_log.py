"""
midas_log.py — Obsidian + MEMORY.md persistence, as a Hermes runtime skill.

Skill ID:   AGT-LOG-001
Phase:      5
Status:     LIVE — creates Obsidian vault notes + appends to MEMORY.md.

Persists skill results as timestamped markdown notes with YAML frontmatter
for Obsidian indexing, and appends session summaries to MEMORY.md for
cross-session context (what the Vega-memory-policy.js does in the JS world).
"""

from __future__ import annotations

import json
import datetime as _dt
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional


SKILL_ID = "AGT-LOG-001"

DEFAULT_VAULT_DIR = "obsidian-vault"
DEFAULT_MEMORY_FILE = "MEMORY.md"


@dataclass
class LogResult:
    skill_id: str
    ok: bool
    vault_note: str = ""
    memory_appended: bool = False
    tags: list[str] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _build_tags(result: dict[str, Any]) -> list[str]:
    tags = ["#midas"]

    verdict = result.get("verdict", "").lower()
    if verdict:
        tags.append(f"#{verdict.replace('-', '_')}")

    if result.get("trade_count"):
        tags.append("#backtest")
    if result.get("parity"):
        tags.append("#parity")
    if result.get("gate_open") is not None:
        tags.append("#structure")
    if result.get("provider"):
        tags.append(f"#{result['provider']}")

    return tags


def _build_vault_note(result: dict[str, Any], tags: list[str], ts: str) -> str:
    lines = [
        "---",
        f"date: {ts[:10]}",
        f"timestamp: {ts}",
        f"tags: {json.dumps(tags)}",
    ]

    if "verdict" in result:
        lines.append(f"verdict: {result['verdict']}")
        lines.append(f"confidence: {result.get('confidence', 0)}")
    if "trade_count" in result:
        lines.append(f"trade_count: {result['trade_count']}")
    if "metrics" in result:
        m = result["metrics"]
        lines.append(f"net_pnl: {m.get('net_pnl', 0)}")
        lines.append(f"win_rate: {m.get('win_rate', 0)}")
        lines.append(f"profit_factor: {m.get('profit_factor', 0)}")

    lines.append("---")
    lines.append("")
    lines.append(f"# MIDAS Run — {ts[:10]}")
    lines.append("")

    if "reasoning" in result:
        lines.append("## Decision Reasoning")
        for r in result["reasoning"]:
            lines.append(f"- {r}")
        lines.append("")

    if "signals" in result:
        lines.append("## Signals")
        for k, v in result["signals"].items():
            lines.append(f"- **{k}**: {v}")
        lines.append("")

    if "risk_flags" in result:
        flags = result["risk_flags"]
        if flags:
            lines.append("## Risk Flags")
            for f in flags:
                lines.append(f"- {f}")
            lines.append("")

    if "metrics" in result:
        lines.append("## Metrics")
        for k, v in result["metrics"].items():
            lines.append(f"- **{k}**: {v}")
        lines.append("")

    if "trade_count" in result:
        lines.append(f"**Trades**: {result['trade_count']}")

    if "parity" in result and result["parity"]:
        p = result["parity"]
        lines.append(f"**Parity**: {p.get('matched', '?')}/{p.get('pine_trades', '?')} matched")

    return "\n".join(lines) + "\n"


def _build_memory_entry(result: dict[str, Any], ts: str) -> str:
    lines = [f"## {ts[:10]} — MIDAS Run"]

    if "verdict" in result:
        lines.append(f"- Verdict: **{result['verdict']}** (confidence {result.get('confidence', 0)})")
    if "trade_count" in result:
        m = result.get("metrics", {})
        lines.append(f"- Trades: {result['trade_count']}, PnL: ${m.get('net_pnl', 0)}, WR: {m.get('win_rate', 0)}")
    if "reasoning" in result:
        for r in result["reasoning"][:3]:
            lines.append(f"  - {r}")
    if "risk_flags" in result and result["risk_flags"]:
        lines.append(f"- Flags: {', '.join(result['risk_flags'])}")

    lines.append("")
    return "\n".join(lines)


def log_result(
    result: dict[str, Any],
    vault_path: Optional[str] = None,
    memory_path: Optional[str] = None,
) -> LogResult:
    if not result:
        return LogResult(SKILL_ID, ok=False, error="empty result")

    ts = _dt.datetime.now(_dt.timezone.utc).isoformat()
    tags = _build_tags(result)

    vault_note_name = ""
    if vault_path:
        vault_dir = Path(vault_path)
        vault_dir.mkdir(parents=True, exist_ok=True)
        note_name = f"{ts[:10]}_midas_run_{ts[11:13]}{ts[14:16]}.md"
        note_content = _build_vault_note(result, tags, ts)
        try:
            (vault_dir / note_name).write_text(note_content, encoding="utf-8")
            vault_note_name = note_name
        except OSError as e:
            return LogResult(SKILL_ID, ok=False, error=f"vault write failed: {e}")

    memory_appended = False
    if memory_path:
        memory_entry = _build_memory_entry(result, ts)
        try:
            mem = Path(memory_path)
            if not mem.exists():
                mem.write_text("# MIDAS Memory\n\nCross-session decision log.\n\n", encoding="utf-8")
            with mem.open("a", encoding="utf-8") as f:
                f.write(memory_entry)
            memory_appended = True
        except OSError as e:
            return LogResult(SKILL_ID, ok=False, error=f"memory write failed: {e}")

    return LogResult(
        skill_id=SKILL_ID,
        ok=True,
        vault_note=vault_note_name,
        memory_appended=memory_appended,
        tags=tags,
    )


SKILL_DESCRIPTOR = {
    "id": SKILL_ID,
    "name": "MIDAS Log",
    "entrypoint": log_result,
    "phase": 5,
    "runtime_skill": True,
}


def _main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="midas_log", description="Obsidian + MEMORY.md logging skill.")
    ap.add_argument("--result", required=True, help="skill result JSON path to log")
    ap.add_argument("--vault-path", help="Obsidian vault directory")
    ap.add_argument("--memory-path", help="MEMORY.md file path")
    ap.add_argument("--output", help="write log result JSON to file")
    args = ap.parse_args(argv)

    result = json.loads(Path(args.result).read_text(encoding="utf-8"))
    log = log_result(result, args.vault_path, args.memory_path)
    out = json.dumps(log.to_dict(), indent=2)
    print(out)
    if args.output:
        Path(args.output).write_text(out, encoding="utf-8")
    return 0 if log.ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
