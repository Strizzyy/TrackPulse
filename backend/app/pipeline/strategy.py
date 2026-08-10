from typing import Dict


def recommend(current_score: float, direction: str, recent_slope: float) -> Dict:
    if current_score > 0.6:
        compound = "full wets"
        urgency = "low"
        call = "Stay out on wets, track still fully wet."
        pit_window_laps = [5, 8]
    elif current_score > 0.35:
        if direction == "drying":
            compound = "intermediates -> slicks soon"
            urgency = "medium"
            call = "Track drying -- inters losing performance, box in 2-3 laps for slicks."
            pit_window_laps = [2, 4]
        else:
            compound = "intermediates"
            urgency = "low"
            call = "Hold on intermediates, conditions stable."
            pit_window_laps = [5, 8]
    else:
        compound = "slicks"
        urgency = "low"
        call = "Track is dry, no tire change needed."
        pit_window_laps = [5, 8]

    return {
        "tire_call": call,
        "compound": compound,
        "urgency": urgency,
        "pit_window_laps": pit_window_laps,
    }
