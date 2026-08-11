import json
import os
from typing import Dict, Optional

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "sc_stats.json")

# How much wet running pulls the first incident forward relative to the dry
# historical average. These are stated multipliers, not a fitted model -- the
# honest position is "here is the historical average, and here is the factor
# we are applying to it, argue with the factor if you like" rather than a
# single number with no visible derivation. A strategist can override it.
WET_EARLINESS = 0.65
DAMP_EARLINESS = 0.80
WORSENING_EARLINESS = 0.90

# Wetness per LAP above which the track counts as actively worsening.
WORSENING_SLOPE = 0.01


def get_sc_risk(slope_per_lap: float, current_score: float, circuit: Optional[Dict] = None) -> Dict:
    """`circuit` is a per-circuit record from app/data/circuits/. When omitted
    this falls back to the original Silverstone-only sc_stats.json.

    `slope_per_lap` is wetness per LAP. The WORSENING_SLOPE threshold below has
    always been a per-lap figure, but the single-lap endpoint used to hand this
    a per-second slope -- ~90x too small, so "conditions worsening" could never
    fire on that path no matter how fast the track was filling up."""
    if circuit is not None:
        stats = circuit
    else:
        with open(DATA_PATH) as f:
            stats = json.load(f)

    name = stats.get("track_id") or stats.get("circuit_id") or "this track"
    base_rate = stats.get("sc_or_vsc_rate_pct", 20)
    risk = base_rate
    rationale_bits = [f"Historical SC/VSC rate at {name} is {base_rate}%."]

    if current_score > 0.5:
        risk += 15
        rationale_bits.append("Track currently wet, which historically raises incident risk.")
    if slope_per_lap > WORSENING_SLOPE:
        risk += 10
        rationale_bits.append("Conditions worsening lap on lap.")

    risk = min(risk, 95)

    result = {
        "risk_pct": round(risk, 1),
        "base_rate_pct": base_rate,
        "rationale": " ".join(rationale_bits),
        "sessions_analyzed": stats.get("sessions_analyzed"),
    }
    result.update(_deployment_timing(stats, slope_per_lap, current_score))
    return result


def _deployment_timing(stats: Dict, slope_per_lap: float, current_score: float) -> Dict:
    """*When*, not just whether -- "SC/VSC risk 86%" is not something a
    strategist can act on, but "expect the first one around lap 15, and
    historically it's lap 22 in the dry" is.

    Built on avg_first_deployment_lap, which the FastF1 pull already
    computes and writes to sc_stats.json but which nothing ever read.
    """
    base_lap = stats.get("avg_first_deployment_lap")
    if not base_lap:
        return {"expected_first_sc_lap": None, "sc_timing_note": None}

    factor = 1.0
    reasons = []
    if current_score > 0.6:
        factor *= WET_EARLINESS
        reasons.append("wet track")
    elif current_score > 0.35:
        factor *= DAMP_EARLINESS
        reasons.append("damp track")
    if slope_per_lap > WORSENING_SLOPE:
        factor *= WORSENING_EARLINESS
        reasons.append("conditions worsening")

    projected = base_lap * factor
    # A single lap number would imply precision this doesn't have; a window
    # is what a strategist actually plans against.
    window = [max(1, round(projected * 0.75)), round(projected * 1.25)]

    if reasons:
        note = (
            f"First SC/VSC historically comes around lap {base_lap:.0f} here "
            f"(avg of {stats.get('sessions_analyzed', 'n')} sessions). "
            f"With {' and '.join(reasons)}, expect it earlier -- "
            f"most likely laps {window[0]}-{window[1]}."
        )
    else:
        note = (
            f"First SC/VSC historically comes around lap {base_lap:.0f} here "
            f"(avg of {stats.get('sessions_analyzed', 'n')} sessions). "
            f"Track isn't wet and isn't worsening, so no adjustment -- expect laps "
            f"{window[0]}-{window[1]}."
        )

    return {
        "expected_first_sc_lap": round(projected, 1),
        "historical_first_sc_lap": base_lap,
        "sc_window_laps": window,
        "sc_timing_note": note,
    }
