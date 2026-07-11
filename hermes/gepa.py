"""
gepa.py — Genetic Evolution of Parameter Adaptation.

Maintains populations of parameter sets for MIDAS skills,
scores outcomes from loop results, and evolves winning
configurations across runs. Persists state to JSON.
"""

from __future__ import annotations

import json
import math
import random
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional


PARAM_BOUNDS = {
    "pivot_len": (2, 8, int),
    "min_opp_breaks": (1, 4, int),
    "max_opp_breaks": (2, 5, int),
    "retrace_threshold": (0.5, 0.8, float),
}

DEFAULT_PARAMS = {
    "pivot_len": 3,
    "min_opp_breaks": 2,
    "max_opp_breaks": 2,
    "retrace_threshold": 0.665,
}


@dataclass
class Individual:
    params: dict[str, Any]
    fitness: float = 0.0
    generation: int = 0
    run_count: int = 0
    created_at: float = 0.0

    def __post_init__(self):
        if not self.created_at:
            self.created_at = time.time()

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Individual:
        return cls(
            params=d.get("params", dict(DEFAULT_PARAMS)),
            fitness=d.get("fitness", 0.0),
            generation=d.get("generation", 0),
            run_count=d.get("run_count", 0),
            created_at=d.get("created_at", 0.0),
        )


@dataclass
class Population:
    individuals: list[Individual] = field(default_factory=list)
    generation: int = 0
    best_fitness: float = 0.0
    total_runs: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "generation": self.generation,
            "best_fitness": self.best_fitness,
            "total_runs": self.total_runs,
            "individuals": [i.to_dict() for i in self.individuals],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Population:
        return cls(
            individuals=[Individual.from_dict(i) for i in d.get("individuals", [])],
            generation=d.get("generation", 0),
            best_fitness=d.get("best_fitness", 0.0),
            total_runs=d.get("total_runs", 0),
        )


def score_run(loop_result: dict[str, Any]) -> float:
    details = loop_result.get("details", {})
    quant = details.get("quant", {})
    structure = details.get("structure", {})
    synth = details.get("synthesis", {})

    metrics = quant.get("metrics", {})
    net_pnl = metrics.get("net_pnl", 0)
    win_rate = metrics.get("win_rate", 0)
    profit_factor = metrics.get("profit_factor", 0)
    max_dd = abs(metrics.get("max_drawdown", 0))
    trade_count = quant.get("trade_count", 0)

    if trade_count == 0:
        return 0.05

    pnl_score = math.tanh(net_pnl / 500) * 0.3
    wr_score = win_rate * 0.2
    pf_score = min(profit_factor / 3.0, 1.0) * 0.25
    dd_penalty = min(max_dd / 5000, 1.0) * 0.15
    volume_bonus = min(trade_count / 50, 1.0) * 0.1

    parity = quant.get("parity")
    parity_bonus = 0.0
    if parity and parity.get("pass"):
        parity_bonus = 0.1

    raw = pnl_score + wr_score + pf_score - dd_penalty + volume_bonus + parity_bonus
    return round(max(0.0, min(1.0, raw)), 4)


def init_population(size: int = 8) -> Population:
    individuals = []
    individuals.append(Individual(params=dict(DEFAULT_PARAMS), generation=0))

    for i in range(1, size):
        params = {}
        for key, (lo, hi, typ) in PARAM_BOUNDS.items():
            if typ == int:
                params[key] = random.randint(lo, hi)
            else:
                params[key] = round(random.uniform(lo, hi), 3)
        individuals.append(Individual(params=params, generation=0))

    return Population(individuals=individuals)


def tournament_select(pop: Population, k: int = 3) -> Individual:
    contestants = random.sample(pop.individuals, min(k, len(pop.individuals)))
    return max(contestants, key=lambda i: i.fitness)


def crossover(a: Individual, b: Individual) -> dict[str, Any]:
    child = {}
    for key in PARAM_BOUNDS:
        _, _, typ = PARAM_BOUNDS[key]
        if random.random() < 0.5:
            val = a.params.get(key, DEFAULT_PARAMS[key])
        else:
            val = b.params.get(key, DEFAULT_PARAMS[key])
        child[key] = typ(val)
    return child


def mutate(params: dict[str, Any], rate: float = 0.2) -> dict[str, Any]:
    mutated = dict(params)
    for key, (lo, hi, typ) in PARAM_BOUNDS.items():
        if random.random() < rate:
            if typ == int:
                delta = random.choice([-1, 1])
                mutated[key] = max(lo, min(hi, mutated.get(key, DEFAULT_PARAMS[key]) + delta))
            else:
                spread = (hi - lo) * 0.15
                val = mutated.get(key, DEFAULT_PARAMS[key]) + random.gauss(0, spread)
                mutated[key] = round(max(lo, min(hi, val)), 3)
    return mutated


def evolve(pop: Population, elite_ratio: float = 0.25) -> Population:
    n = len(pop.individuals)
    if n < 2:
        return pop

    sorted_inds = sorted(pop.individuals, key=lambda i: i.fitness, reverse=True)
    elite_count = max(1, int(n * elite_ratio))
    next_gen = []

    for ind in sorted_inds[:elite_count]:
        elite = Individual(
            params=dict(ind.params),
            fitness=ind.fitness,
            generation=pop.generation + 1,
            run_count=ind.run_count,
        )
        next_gen.append(elite)

    while len(next_gen) < n:
        parent_a = tournament_select(pop)
        parent_b = tournament_select(pop)
        child_params = crossover(parent_a, parent_b)
        child_params = mutate(child_params)
        next_gen.append(Individual(params=child_params, generation=pop.generation + 1))

    best = max(i.fitness for i in next_gen)
    return Population(
        individuals=next_gen,
        generation=pop.generation + 1,
        best_fitness=best,
        total_runs=pop.total_runs,
    )


def save(pop: Population, path: str | Path) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(pop.to_dict(), indent=2), encoding="utf-8")


def load(path: str | Path) -> Optional[Population]:
    p = Path(path)
    if not p.exists():
        return None
    try:
        return Population.from_dict(json.loads(p.read_text(encoding="utf-8")))
    except Exception:
        return None
