"""Loads the per-circuit JSON produced offline by scripts/build_circuit_data.py.

Read-only and cached in memory. FastF1 is never called at request time -- the
demo must not depend on a live pull (plan doc 5.3), and these files are the
frozen output of one.
"""

import json
import os
from typing import Dict, List, Optional

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "circuits")
LEGACY_TRACK_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "silverstone.json")

_cache: Dict[str, Dict] = {}


def available() -> List[Dict]:
    """Summary of every circuit with built data -- what the picker renders."""
    if not os.path.isdir(DATA_DIR):
        return []
    out = []
    for filename in sorted(os.listdir(DATA_DIR)):
        if not filename.endswith(".json"):
            continue
        circuit = load(filename[:-5])
        if circuit:
            out.append(
                {
                    "circuit_id": circuit["circuit_id"],
                    "name": circuit["name"],
                    "race_laps": circuit.get("race_laps"),
                    "avg_lap_time_sec": circuit.get("avg_lap_time_sec"),
                    "pit_loss_sec": circuit.get("pit_loss_sec"),
                    "sc_or_vsc_rate_pct": circuit.get("sc_or_vsc_rate_pct"),
                    "rain_frequency_pct": circuit.get("rain_frequency_pct"),
                    "corner_count": len(circuit.get("corners") or []),
                    # Real racing-line geometry so the circuit picker can draw
                    # true mini-maps, not just names.
                    "track_outline": circuit.get("track_outline"),
                }
            )
    return out


def load(circuit_id: str) -> Optional[Dict]:
    if circuit_id in _cache:
        return _cache[circuit_id]

    path = os.path.join(DATA_DIR, f"{circuit_id}.json")
    if not os.path.exists(path):
        # Silverstone predates the per-circuit build and still has a hand-made
        # file; fall back to it so the original endpoint keeps working even if
        # build_circuit_data.py has never been run.
        if circuit_id == "silverstone" and os.path.exists(LEGACY_TRACK_PATH):
            with open(LEGACY_TRACK_PATH) as f:
                legacy = json.load(f)
            legacy.setdefault("circuit_id", "silverstone")
            _cache[circuit_id] = legacy
            return legacy
        return None

    with open(path) as f:
        circuit = json.load(f)
    _cache[circuit_id] = circuit
    return circuit


def corners_for_mapping(circuit: Dict) -> List[Dict]:
    """trend.map_corner() wants {name, start_pct, end_pct}. The built files
    carry extra fields (distance, number) that it ignores, and the legacy
    Silverstone file already has exactly this shape."""
    return [
        {"name": c["name"], "start_pct": c["start_pct"], "end_pct": c["end_pct"]}
        for c in (circuit.get("corners") or [])
    ]
