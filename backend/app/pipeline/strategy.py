from typing import Dict, List, Optional

from app.pipeline.trend import DRY_CUTOFF
from app.pipeline.weather import RAIN_LIKELY_PCT

# Score bands for the three tyre regimes. The exact cut points matter less
# than the fact that `direction` is consulted inside every one of them: a
# track at 0.3 that is drying out and a track at 0.3 with rain arriving call
# for opposite decisions, and an earlier version of this file returned the
# same "no tire change needed" for both.
WET_BAND = 0.6
DAMP_BAND = 0.35


def _reaches_damp(projected_wetness: Optional[List[float]]) -> bool:
    """Does the projection actually arrive somewhere that needs a tyre change?

    A direction alone is not a reason to pit. A dry Monza lap measured
    +0.0112/lap -- above the direction threshold, so `direction` read
    "wetting" -- but from 0.05 that reaches 0.16 after ten laps, still deep in
    the dry band. The rule table fired a HIGH-urgency "box on lap 1-2" anyway,
    because it read the derivative and never asked where it was heading.

    No projection supplied (older callers, tests) => don't block the call.
    """
    if not projected_wetness:
        return True
    return max(projected_wetness) >= DRY_CUTOFF


def recommend(
    current_score: float,
    direction: str,
    slope_per_lap: float,
    projected_wetness: Optional[List[float]] = None,
    rain_probability_pct: float = 0.0,
) -> Dict:
    """Map (condition, trajectory, destination) -> a tyre call.

    Deliberately a transparent rule table rather than a model: a strategist
    has to be able to disagree with it out loud, which means being able to
    see exactly why it said what it said.

    `direction` and `slope_per_lap` must be the NET figures -- measured visual
    trend plus the weather adjustment, the same ones the forecast curve is
    drawn from. They used to be the raw measured trend while the forecast used
    the net, which is how a high-urgency "rain arriving" call printed above a
    flat projection.

    `projected_wetness` is the forecast curve, so the call can be gated on
    where the track ends up rather than on the sign of a slope.
    `rain_probability_pct` exists so this function cannot announce rain that
    the forecast does not have -- it once said "rain arriving on a dry track"
    directly beneath a displayed 0% rain probability.
    """
    if current_score > WET_BAND:
        if direction == "drying":
            # Still wet, but the crossover to inters is coming -- say so now
            # rather than reporting "fully wet" right up until it isn't.
            compound = "full wets -> intermediates"
            urgency = "medium"
            call = "Still fully wet, but the track's coming to us -- inters ready, we'll call the crossover."
            pit_window_laps = [3, 6]
        else:
            compound = "full wets"
            urgency = "low"
            call = "Stay out on wets, track still fully wet."
            pit_window_laps = [5, 8]

    elif current_score > DAMP_BAND:
        if direction == "drying":
            compound = "intermediates -> slicks soon"
            urgency = "medium"
            call = "Track drying -- inters losing performance, box in 2-3 laps for slicks."
            pit_window_laps = [2, 4]
        elif direction == "wetting":
            compound = "intermediates -> full wets"
            urgency = "high"
            call = "Conditions worsening -- inters are on the edge, full wets ready to go."
            pit_window_laps = [1, 3]
        else:
            compound = "intermediates"
            urgency = "low"
            call = "Hold on intermediates, conditions stable."
            pit_window_laps = [5, 8]

    else:
        if direction == "wetting" and _reaches_damp(projected_wetness):
            # The case the old rule table missed entirely: a dry-reading track
            # with rain arriving used to return "no tire change needed", which
            # is the one situation where silence is actively dangerous. It now
            # only fires if the projection actually reaches the damp band.
            compound = "slicks -> intermediates"
            urgency = "high"
            if rain_probability_pct >= RAIN_LIKELY_PCT:
                call = "Rain arriving on a dry track -- inters are being prepped, be ready to box."
            else:
                # Wetting up on camera with nothing in the forecast. Still worth
                # calling, but don't blame rain the weather API doesn't have.
                call = (
                    "Track wetting up on camera with no rain in the forecast -- "
                    "inters are being prepped, but check the read before we commit."
                )
            pit_window_laps = [1, 2]
        elif direction == "drying":
            compound = "slicks"
            urgency = "low"
            call = "Track's drying nicely, slicks are the right call -- stay out."
            pit_window_laps = [6, 10]
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
