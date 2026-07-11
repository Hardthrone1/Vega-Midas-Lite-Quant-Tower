"""
skill_registry.py — Discover and load MIDAS skills from SKILL.md files.

Scans skills/ directories for SKILL.md YAML frontmatter, imports the
corresponding Python module, and exposes SKILL_DESCRIPTOR for each.
"""

from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Optional


@dataclass
class SkillEntry:
    skill_id: str
    name: str
    skill_dir: Path
    module_name: str
    phase: int
    tags: list[str] = field(default_factory=list)
    runtime_skill: bool = False
    entrypoint: Optional[Callable] = None
    descriptor: Optional[dict[str, Any]] = None
    _loaded: bool = False

    def load(self) -> bool:
        if self._loaded:
            return self.entrypoint is not None
        self._loaded = True
        skill_path = str(self.skill_dir)
        if skill_path not in sys.path:
            sys.path.insert(0, skill_path)
        try:
            mod = importlib.import_module(self.module_name)
            desc = getattr(mod, "SKILL_DESCRIPTOR", None)
            if desc:
                self.descriptor = desc
                self.entrypoint = desc.get("entrypoint")
                return True
        except Exception:
            pass
        return False


def _parse_frontmatter(text: str) -> dict[str, Any]:
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}
    end = -1
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end < 0:
        return {}

    result: dict[str, Any] = {}
    current_key = None
    for line in lines[1:end]:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if ":" in line and not line[0].isspace():
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip()
            if val == ">" or val == "|":
                result[key] = ""
                current_key = key
            elif val.startswith("[") and val.endswith("]"):
                items = [s.strip().strip("'\"") for s in val[1:-1].split(",")]
                result[key] = [i for i in items if i]
            elif val.lower() in ("true", "false"):
                result[key] = val.lower() == "true"
            else:
                result[key] = val.strip("'\"") if val else ""
                current_key = None
        elif current_key is not None and line[0].isspace():
            existing = result.get(current_key, "")
            result[current_key] = (existing + " " + stripped).strip()
        elif line.startswith("  ") and ":" in line:
            pass

    return result


def _extract_hermes_metadata(text: str) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    in_hermes = False
    for line in text.split("\n"):
        stripped = line.strip()
        if stripped == "hermes:":
            in_hermes = True
            continue
        if in_hermes:
            if not line.startswith("    ") and not line.startswith("\t\t"):
                if stripped and not stripped.startswith("-"):
                    in_hermes = False
                    continue
            if ":" in stripped:
                k, _, v = stripped.partition(":")
                k = k.strip()
                v = v.strip()
                if v.startswith("[") and v.endswith("]"):
                    meta[k] = [s.strip().strip("'\"") for s in v[1:-1].split(",") if s.strip()]
                elif v.lower() in ("true", "false"):
                    meta[k] = v.lower() == "true"
                else:
                    meta[k] = v.strip("'\"") if v else ""
    return meta


def discover(skills_dir: str | Path) -> list[SkillEntry]:
    skills_path = Path(skills_dir)
    if not skills_path.is_dir():
        return []

    entries = []
    for skill_md in sorted(skills_path.glob("*/SKILL.md")):
        text = skill_md.read_text(encoding="utf-8")
        fm = _parse_frontmatter(text)
        hermes = _extract_hermes_metadata(text)

        skill_id = hermes.get("skill_id", "")
        name = fm.get("name", skill_md.parent.name)
        tags = hermes.get("tags", [])
        runtime = hermes.get("runtime_skill", False)

        dir_name = skill_md.parent.name
        module_name = dir_name.replace("-", "_")

        entry = SkillEntry(
            skill_id=skill_id,
            name=name,
            skill_dir=skill_md.parent,
            module_name=module_name,
            phase=5,
            tags=tags if isinstance(tags, list) else [tags],
            runtime_skill=runtime,
        )
        entries.append(entry)

    return entries


def load_all(entries: list[SkillEntry]) -> list[SkillEntry]:
    for e in entries:
        e.load()
    return entries


def get_by_id(entries: list[SkillEntry], skill_id: str) -> Optional[SkillEntry]:
    for e in entries:
        if e.skill_id == skill_id:
            return e
    return None


def get_by_name(entries: list[SkillEntry], name: str) -> Optional[SkillEntry]:
    name_lower = name.lower().replace("-", "_").replace(" ", "_")
    for e in entries:
        normalized = e.name.lower().replace("-", "_").replace(" ", "_")
        if normalized == name_lower or e.module_name == name_lower:
            return e
    return None


def build_skills_system_prompt(entries: list[SkillEntry]) -> str:
    lines = ["# Available MIDAS Skills", ""]
    for e in entries:
        status = "loaded" if e._loaded and e.entrypoint else "available"
        tags_str = ", ".join(e.tags) if e.tags else ""
        lines.append(f"- **{e.name}** ({e.skill_id}) [{status}]")
        if tags_str:
            lines.append(f"  Tags: {tags_str}")
        lines.append(f"  Module: `{e.module_name}` in `{e.skill_dir.name}/`")
        lines.append("")
    return "\n".join(lines)
