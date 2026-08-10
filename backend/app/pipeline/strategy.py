from typing import Dict

# Score bands for the three tyre regimes. The exact cut points matter less
# than the fact that `direction` is consulted inside every one of them: a
# track at 0.3 that is drying out and a track at 0.3 with rain arriving call
# for opposite decisions, and an earlier version of this file returned the
# same "no tire change needed" for both.
WET_BAND = 0.6
DAMP_BAND = 0.35


def recommend(current_score: float, direction: str, recent_slope: float) -> Dict:
    """Map (condition, trajectory) -> a tyre call.

    Deliberately a transparent rule table rather than a model: a strategist
    has to be able to disagree with it out loud, which means being able to
    see exactly why it said what it said.
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
        if direction == "wetting":
            # The case the old rule table missed entirely: a dry-reading track
            # with rain arriving used to return "no tire change needed", which
            # is the one situation where silence is actively dangerous.
            compound = "slicks -> intermediates"
            urgency = "high"
            call = "Rain arriving on a dry track -- inters are being prepped, be ready to box."
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
