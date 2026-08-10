"""Strategy optimiser: enumerate plausible pit strategies, simulate each with
race_sim, rank by total race time.

Brute force on purpose. The candidate space is small (1-3 stops over three dry
compounds with a sensible minimum stint length), so an exhaustive search is
both instant and completely explainable -- there is no search heuristic to
justify to anyone. The interesting output isn't the winner, it's the *gap* to
the alternatives: "2-stop by 4.2s over the 1-stop" is a strategist's decision,
"2-stop" alone is not.
"""

from itertools import combinations, product
from typing import Dict, List, Optional

from app.pipeline import race_sim

# Sporting regulations: a dry race requires at least two different compounds.
# That requirement is waived in a wet race, which is why the rule is applied
# conditionally below rather than unconditionally.
MIN_COMPOUNDS_DRY = 2

# Projected wetness above which wet-weather rubber becomes an option at all,
# and above which the full wet (rather than the intermediate) is worth running.
# Matches the dry/wet label cutoffs in trend.py so the strategy layer and the
# vision layer agree on what "wet" means.
WET_COMPOUND_THRESHOLD = 0.35
FULL_WET_THRESHOLD = 0.65

# Below this, a stint isn't a real strategy -- it's an in-lap and an out-lap.
MIN_STINT_LAPS = 8

MAX_STOPS = 3

# Headroom over the longest stint teams were actually observed running on a
# compound at this circuit. Without a life cap the optimiser will happily put
# a soft tyre on for 35 laps at Monaco -- where measured degradation is nearly
# flat, so nothing in the arithmetic penalises it, but no team would ever do
# it. The cap comes from real stint data, not an opinion about tyres.
STINT_LIFE_HEADROOM = 1.25

# Used only when a compound has no observed stint data at this circuit.
FALLBACK_MAX_STINT_LAPS = {
    "SOFT": 22, "MEDIUM": 32, "HARD": 45, "INTERMEDIATE": 30, "WET": 30,
}

# Simulated gap below which track position outweighs raw pace. An extra stop
# rejoins you in traffic, which this simulator does not model at all.
TRACK_POSITION_MARGIN_SEC = 15.0


def max_stint_laps(circuit: Dict, compound: str) -> int:
    measured = (circuit.get("degradation") or {}).get(compound.upper())
    observed = measured.get("max_observed_stint_laps") if measured else None
    if observed:
        return int(observed * STINT_LIFE_HEADROOM)
    return FALLBACK_MAX_STINT_LAPS.get(compound.upper(), 30)


def _stint_splits(total_laps: int, n_stints: int) -> List[List[int]]:
    """Every way to divide the race into n stints of at least MIN_STINT_LAPS,
    on a coarse grid. A 3-lap resolution keeps the search small without
    meaningfully changing the answer -- stint lengths are not decided to the lap
    this far ahead of the race anyway."""
    if n_stints == 1:
        return [[total_laps]]

    step = 3
    cut_options = range(MIN_STINT_LAPS, total_laps - MIN_STINT_LAPS + 1, step)
    splits = []
    for cuts in combinations(cut_options, n_stints - 1):
        lengths = []
        previous = 0
        for cut in cuts:
            lengths.append(cut - previous)
            previous = cut
        lengths.append(total_laps - previous)
        if all(length >= MIN_STINT_LAPS for length in lengths):
            splits.append(lengths)
    return splits


def optimise(
    circuit: Dict,
    total_laps: Optional[int] = None,
    wetness_by_lap: Optional[List[float]] = None,
    top_n: int = 5,
    enforce_tyre_life: bool = True,
) -> Dict:
    total_laps = total_laps or circuit.get("race_laps") or 52

    available = [c for c in race_sim.DRY_COMPOUNDS if c in (circuit.get("degradation") or {})]
    if len(available) < MIN_COMPOUNDS_DRY:
        # Fall back to the standard three if this circuit's data is thin --
        # race_sim already substitutes default degradation per compound.
        available = list(race_sim.DRY_COMPOUNDS)

    # A wet race is not a dry race with a time penalty: it needs wet rubber.
    # This is where the CLIP read actually changes which tyres are on the table,
    # rather than only making every option uniformly slower.
    peak_wetness = max(wetness_by_lap) if wetness_by_lap else 0.0
    wet_race = peak_wetness > WET_COMPOUND_THRESHOLD
    if wet_race:
        available = available + [
            c for c in race_sim.WET_COMPOUNDS
            if c == "INTERMEDIATE" or peak_wetness > FULL_WET_THRESHOLD
        ]

    results = []
    for stops in range(0, MAX_STOPS + 1):
        n_stints = stops + 1
        for lengths in _stint_splits(total_laps, n_stints):
            for compounds in product(available, repeat=n_stints):
                # The two-compound rule does not apply in a wet race -- a team
                # can legally run intermediates start to finish.
                if not wet_race and len(set(compounds)) < MIN_COMPOUNDS_DRY:
                    continue
                if enforce_tyre_life and any(
                    length > max_stint_laps(circuit, compound)
                    for compound, length in zip(compounds, lengths)
                ):
                    continue  # tyre wouldn't survive that stint here
                stints = [
                    {"compound": compound, "laps": length}
                    for compound, length in zip(compounds, lengths)
                ]
                result = race_sim.simulate(stints, circuit, total_laps, wetness_by_lap)
                result["plan"] = " / ".join(
                    f"{s['compound'][0]}{s['laps']}" for s in result["stints"]
                )
                results.append(result)

    if not results:
        if enforce_tyre_life:
            # No plan covers the distance within observed tyre life -- usually
            # thin stint data for this circuit rather than a real impossibility.
            # Retry unconstrained and say so, rather than returning nothing.
            relaxed = optimise(circuit, total_laps, wetness_by_lap, top_n, enforce_tyre_life=False)
            relaxed["tyre_life_enforced"] = False
            relaxed["note"] = (
                "No strategy fits within observed tyre life at this circuit, so the "
                "life cap was lifted. Treat stint lengths as optimistic. " + relaxed["note"]
            )
            return relaxed
        return {"total_laps": total_laps, "candidates_evaluated": 0, "ranked": []}

    results.sort(key=lambda r: r["total_time_sec"])
    best = results[0]
    for result in results:
        result["delta_to_best_sec"] = round(result["total_time_sec"] - best["total_time_sec"], 2)

    # The best of each stop count, so the UI can show "1-stop vs 2-stop vs
    # 3-stop" rather than five near-identical two-stop variants.
    by_stops = {}
    for result in results:
        if result["stops"] not in by_stops:
            by_stops[result["stops"]] = result

    # Pure lap-time simulation has no concept of track position: it assumes an
    # empty circuit, so it will happily trade a pit stop for a few tenths a lap.
    # In reality an extra stop drops you into traffic, and on a circuit where
    # overtaking is hard that costs far more than the simulated gap. Where the
    # margin is inside that noise, say so rather than presenting a false winner.
    # Search ALL results, not just the fastest few -- at a circuit where the
    # optimiser prefers an extra stop, every one of the top entries is a
    # multi-stop plan and the one-stop never appears in that slice.
    fewest_stops = min(results, key=lambda r: (r["stops"], r["total_time_sec"]))
    caveat = None
    if fewest_stops["stops"] < best["stops"] and fewest_stops["delta_to_best_sec"] <= TRACK_POSITION_MARGIN_SEC:
        caveat = (
            f"The {fewest_stops['stops']}-stop is only {fewest_stops['delta_to_best_sec']}s slower on "
            f"pure pace. Overtaking and traffic are NOT modelled here, and that gap is well inside "
            f"what track position is worth -- the {fewest_stops['stops']}-stop is likely the better "
            f"real-world call."
        )

    return {
        "total_laps": total_laps,
        "candidates_evaluated": len(results),
        "tyre_life_enforced": enforce_tyre_life,
        "wet_race": wet_race,
        "compounds_considered": available,
        "recommended": best,
        "track_position_caveat": caveat,
        "fewest_stops_option": fewest_stops if caveat else None,
        "ranked": results[:top_n],
        "best_per_stop_count": [by_stops[k] for k in sorted(by_stops)],
        "note": (
            "Simulated, not measured: lap times are modelled from real per-circuit "
            "degradation and pit loss plus a declared fuel model. Compare the deltas, "
            "not the absolute times."
        ),
    }
