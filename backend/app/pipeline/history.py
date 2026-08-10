import json
import os
from typing import Dict

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "sc_stats.json")


def get_sc_risk(recent_slope: float, current_score: float) -> Dict:
    with open(DATA_PATH) as f:
        stats = json.load(f)

    base_rate = stats.get("sc_or_vsc_rate_pct", 20)
    risk = base_rate
    rationale_bits = [f"Historical SC/VSC rate at {stats.get('track_id', 'this track')} is {base_rate}%."]

    if current_score > 0.5:
        risk += 15
        rationale_bits.append("Track currently wet, which historically raises incident risk.")
    if recent_slope > 0.01:
        risk += 10
        rationale_bits.append("Conditions worsening lap on lap.")

    risk = min(risk, 95)
    return {
        "risk_pct": round(risk, 1),
        "base_rate_pct": base_rate,
        "rationale": " ".join(rationale_bits),
    }
