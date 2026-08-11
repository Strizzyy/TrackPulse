"""Deterministic race simulator: how long does a given pit strategy take?

No model fitting and no ML. Total race time is just the sum of every lap, where
each lap is:

    base lap time
      + fuel penalty for the fuel still on board   (fuel.py -- modelled)
      + tyre degradation for that tyre's age       (measured off real stints)
      + wet-condition penalty if the track is wet  (declared constants)

plus a pit-loss penalty per stop (measured per circuit). Every term is visible
and arguable, which is the whole point -- a strategist has to be able to say
"your degradation number is too aggressive" and see what changes.
"""

from typing import Dict, List, Optional

from app.pipeline import fuel

# Pace offsets by compound, seconds per lap relative to the hardest available
# tyre. Softer rubber is faster when new and wears faster; the wear half comes
# from real data (per-circuit `degradation`), this is only the fresh-tyre pace
# delta, which is fairly stable across circuits.
COMPOUND_PACE_OFFSET_SEC = {
    "SOFT": -0.7,
    "MEDIUM": -0.35,
    "HARD": 0.0,
    "INTERMEDIATE": 6.0,
    "WET": 12.0,
}

# Fallback degradation if a circuit's regression produced nothing usable for a
# compound. Deliberately pessimistic-neutral rather than zero: a missing number
# should not make a compound look free.
DEFAULT_DEG_S_PER_LAP = {
    "SOFT": 0.11,
    "MEDIUM": 0.07,
    "HARD": 0.045,
    "INTERMEDIATE": 0.09,
    "WET": 0.06,
}

DRY_COMPOUNDS = ("SOFT", "MEDIUM", "HARD")
WET_COMPOUNDS = ("INTERMEDIATE", "WET")

# A wet track costs everyone lap time regardless of tyre choice.
WET_LAP_PENALTY_SEC = 8.0

# Running the wrong rubber for the conditions. Calibrated against Pirelli's
# published crossover guidance rather than picked by feel:
#   - slicks -> inters when lap times reach ~110-112% of dry pace, i.e. slicks
#     are the wrong tyre well before the track is fully wet;
#   - full wet crossover ~115-118% of dry pace;
#   - slicks on a genuinely wet track are not "slow", they are undriveable.
# The slick mismatch is therefore CONVEX in wetness (exponent 1.5): a barely
# damp track (0.2-0.35) costs slicks a few tenths to ~3s, the slick/inter
# crossover lands at ~0.48 wetness -- between the damp (0.35) and full-wet
# (0.65) label cutoffs, which is where real teams switch -- and a soaked track
# costs slicks 40s/lap, an arithmetic stand-in for "crash risk, not a plan".
SLICKS_ON_WET_PENALTY_SEC = 40.0
SLICK_MISMATCH_ONSET = 0.2

# Wet rubber on a drying track: inters lose ~10s to slicks once the line is
# dry (6s pace offset + this), full wets more (they blister and overheat).
WET_TYRE_ON_DRY_PENALTY_SEC = {"INTERMEDIATE": 4.0, "WET": 9.0}

# Inters aquaplane in standing water (they clear ~30 L/s vs the full wet's
# ~85 L/s). Above the full-wet cutoff this ramps in, putting the inter/wet
# crossover at ~0.75 wetness so full wets actually win somewhere.
INTER_AQUAPLANE_PENALTY_SEC = 20.0


def compound_degradation(circuit: Dict, compound: str) -> float:
    """Measured per-circuit degradation where it is trustworthy, reference
    values where it is not.

    build_circuit_data.py flags a circuit "low" confidence when its measured
    degradation is non-monotonic across compounds (a harder tyre appearing to
    wear faster than a softer one). That is a regression artefact rather than a
    property of the circuit, and simulating on it produces plans no strategist
    would recognise -- so the reference curve is used instead. The measured
    numbers stay in the JSON and in the API response either way.
    """
    if circuit.get("degradation_confidence") == "low":
        return DEFAULT_DEG_S_PER_LAP.get(compound.upper(), 0.08)

    measured = (circuit.get("degradation") or {}).get(compound.upper())
    if measured and measured.get("s_per_lap") is not None:
        # Occasionally a fit comes out slightly negative on a low-deg circuit
        # (track rubbering in outweighs wear). Clamp at zero rather than letting
        # a tyre get faster forever.
        return max(float(measured["s_per_lap"]), 0.0)
    return DEFAULT_DEG_S_PER_LAP.get(compound.upper(), 0.08)


def lap_time(
    circuit: Dict,
    compound: str,
    tyre_age: int,
    lap_number: int,
    total_laps: int,
    wetness: float = 0.0,
) -> float:
    base = circuit.get("avg_lap_time_sec") or 90.0
    pace = COMPOUND_PACE_OFFSET_SEC.get(compound.upper(), 0.0)
    deg = compound_degradation(circuit, compound) * tyre_age
    fuel_penalty = fuel.fuel_time_penalty_sec(lap_number, total_laps)
    wetness = max(0.0, min(wetness, 1.0))
    wet_penalty = WET_LAP_PENALTY_SEC * wetness

    # Tyre/conditions mismatch, scaled by how wrong it is.
    upper = compound.upper()
    if upper in WET_COMPOUNDS:
        mismatch = WET_TYRE_ON_DRY_PENALTY_SEC.get(upper, 4.0) * (1.0 - wetness)
        if upper == "INTERMEDIATE" and wetness > 0.65:
            mismatch += INTER_AQUAPLANE_PENALTY_SEC * (wetness - 0.65) / 0.35
    else:
        over = max(0.0, wetness - SLICK_MISMATCH_ONSET) / (1.0 - SLICK_MISMATCH_ONSET)
        mismatch = SLICKS_ON_WET_PENALTY_SEC * over**1.5

    return base + pace + deg + fuel_penalty + wet_penalty + mismatch


def simulate(
    stints: List[Dict],
    circuit: Dict,
    total_laps: Optional[int] = None,
    wetness_by_lap: Optional[List[float]] = None,
) -> Dict:
    """Run a strategy. `stints` is [{"compound": "MEDIUM", "laps": 20}, ...].

    `wetness_by_lap` optionally carries the projected track state per lap (this
    is where the CLIP vision read feeds in) -- index i is lap i+1.
    """
    total_laps = total_laps or sum(s["laps"] for s in stints)
    pit_loss = circuit.get("pit_loss_sec") or 22.0

    lap_number = 1
    total = 0.0
    detail = []

    for i, stint in enumerate(stints):
        compound = stint["compound"].upper()
        stint_time = 0.0
        for age in range(1, stint["laps"] + 1):
            if lap_number > total_laps:
                break
            wetness = 0.0
            if wetness_by_lap and lap_number - 1 < len(wetness_by_lap):
                wetness = wetness_by_lap[lap_number - 1]
            stint_time += lap_time(circuit, compound, age, lap_number, total_laps, wetness)
            lap_number += 1
        total += stint_time
        detail.append(
            {
                "stint": i + 1,
                "compound": compound,
                "laps": stint["laps"],
                "stint_time_sec": round(stint_time, 2),
            }
        )

    stops = max(len(stints) - 1, 0)
    total += stops * pit_loss

    return {
        "stints": detail,
        "stops": stops,
        "pit_loss_sec": pit_loss,
        "pit_time_lost_sec": round(stops * pit_loss, 1),
        "total_time_sec": round(total, 2),
        "total_time_display": _format(total),
    }


def _format(seconds: float) -> str:
    hours, rem = divmod(int(seconds), 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"
