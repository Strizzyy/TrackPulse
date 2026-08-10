"""Scores the strategy optimiser against what actually happened.

This is the check that matters. A simulator can produce confident, plausible,
completely wrong numbers forever; the only way to know whether this one is
useful is to run a real race through it and compare its recommendation with
what the winning team actually did.

For each circuit it pulls a real race, reads the winner's actual stint and
compound sequence, and puts the same race through the optimiser:

    predicted stop count   vs  actual stop count
    predicted compounds    vs  actual compounds
    simulated race time    vs  actual winning time
    predicted SC window    vs  actual first safety car lap

Nothing here feeds the app -- it is evidence about the app.

    uv run python scripts/validate_replay.py
    uv run python scripts/validate_replay.py --year 2024
"""

import argparse
import os
import sys
import warnings

import fastf1
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline import circuits as circuits_module  # noqa: E402
from app.pipeline import history, optimizer  # noqa: E402
from scripts.build_circuit_data import CIRCUITS, SC_STATUS_CODES  # noqa: E402

warnings.filterwarnings("ignore", category=FutureWarning)
sys.stdout.reconfigure(line_buffering=True)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".fastf1cache")


def winner_stints(session):
    """The race winner's actual compound sequence and stint lengths."""
    results = session.results
    if results is None or not len(results):
        return None, None
    winner = results.iloc[0]
    laps = session.laps[session.laps["Driver"] == winner["Abbreviation"]]
    if not len(laps):
        return None, None

    stints = []
    for stint_number, stint in laps.groupby("Stint"):
        compound = str(stint["Compound"].iloc[0]).upper()
        if compound in ("NONE", "UNKNOWN", ""):
            continue
        stints.append({"compound": compound, "laps": int(len(stint))})
    return winner, stints


def actual_first_sc_lap(session):
    status = session.track_status
    # Status codes arrive concatenated ("45" = red flag then SC), so an exact
    # isin() match silently misses those. Substring matching catches them.
    pattern = "|".join(SC_STATUS_CODES)
    sc = status[status["Status"].astype(str).str.contains(pattern, regex=True, na=False)]
    if not len(sc):
        return None
    try:
        first_time = sc.iloc[0]["Time"]
        lap = session.laps[session.laps["Time"] <= first_time]["LapNumber"].max()
        return int(lap) if lap == lap else None
    except Exception:
        return None


def validate(circuit_meta, year):
    circuit = circuits_module.load(circuit_meta["id"])
    if circuit is None:
        return None

    try:
        session = fastf1.get_session(year, circuit_meta["event"], "R")
        session.load(telemetry=False, laps=True, weather=False, messages=False)
    except Exception as e:
        print(f"  {circuit_meta['id']}: could not load {year} ({type(e).__name__})")
        return None

    winner, actual = winner_stints(session)
    if not actual:
        print(f"  {circuit_meta['id']}: no usable stint data for {year}")
        return None

    total_laps = int(session.laps["LapNumber"].max())
    plan = optimizer.optimise(circuit, total_laps=total_laps)
    predicted = plan["recommended"]

    actual_time = None
    try:
        raw = winner["Time"]
        if pd.notna(raw):
            actual_time = raw.total_seconds()
    except Exception:
        pass

    actual_stops = len(actual) - 1
    predicted_stops = predicted["stops"]

    # The optimiser's own caveat: where a lower-stop plan is within noise, that
    # is the call it expects a strategist to make. Credit it if that matches.
    alt = plan.get("fewest_stops_option")
    stops_match = predicted_stops == actual_stops or (
        alt is not None and alt["stops"] == actual_stops
    )

    predicted_compounds = [s["compound"] for s in predicted["stints"]]
    actual_compounds = [s["compound"] for s in actual]
    compounds_match = set(predicted_compounds) == set(actual_compounds)

    # Only a clean, dry, uninterrupted race is a fair test. The optimiser models
    # neither rain nor red flags, so scoring it against a race that had either
    # measures the wrong thing -- 2024 Monaco and Suzuka were both red-flagged
    # on lap 1, which is why the winner's "stint 1" is a single lap and the
    # actual race time is inflated by a stoppage the simulator knows nothing of.
    wet_race = any(s["compound"] in ("INTERMEDIATE", "WET") for s in actual)
    red_flagged = any(s["laps"] <= 2 for s in actual) or bool(
        session.track_status["Status"].astype(str).str.contains("5", na=False).any()
    )
    comparable = not wet_race and not red_flagged
    reason = "wet race" if wet_race else ("red flag" if red_flagged else "")

    sc_actual = actual_first_sc_lap(session)
    sc_risk = history.get_sc_risk(0.0, 0.0, circuit=circuit)
    window = sc_risk.get("sc_window_laps")
    sc_hit = bool(window and sc_actual and window[0] <= sc_actual <= window[1])

    return {
        "circuit": circuit_meta["id"],
        "year": year,
        "winner": winner.get("Abbreviation", "?"),
        "laps": total_laps,
        "predicted_plan": predicted["plan"],
        "predicted_stops": predicted_stops,
        "alt_stops": alt["stops"] if alt else None,
        "actual_plan": " / ".join(f"{s['compound'][0]}{s['laps']}" for s in actual),
        "actual_stops": actual_stops,
        "stops_match": stops_match,
        "compounds_match": compounds_match,
        "predicted_time_sec": predicted["total_time_sec"],
        "actual_time_sec": actual_time,
        "sc_window": window,
        "sc_actual_lap": sc_actual,
        "sc_hit": sc_hit,
        "comparable": comparable,
        "excluded_reason": reason,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2024)
    args = parser.parse_args()

    os.makedirs(CACHE_DIR, exist_ok=True)
    fastf1.Cache.enable_cache(CACHE_DIR)

    print(f"Validating optimiser against real {args.year} races\n")
    rows = [r for r in (validate(c, args.year) for c in CIRCUITS) if r]
    if not rows:
        print("No races could be validated.")
        sys.exit(1)

    print(f"\n{'circuit':<13}{'winner':<8}{'predicted':<20}{'actual':<22}{'stops':<8}{'compounds':<11}{'time delta':<16}{'note'}")
    print("-" * 112)
    for r in rows:
        stops = "MATCH" if r["stops_match"] else f"{r['predicted_stops']} vs {r['actual_stops']}"
        compounds = "MATCH" if r["compounds_match"] else "differ"
        if r["actual_time_sec"]:
            pct = abs(r["predicted_time_sec"] - r["actual_time_sec"]) / r["actual_time_sec"] * 100
            delta = f"{r['predicted_time_sec'] - r['actual_time_sec']:+.0f}s ({pct:.1f}%)"
        else:
            delta = "n/a"
        note = "" if r["comparable"] else f"EXCLUDED: {r['excluded_reason']}"
        print(
            f"{r['circuit']:<13}{r['winner']:<8}{r['predicted_plan']:<20}{r['actual_plan']:<22}"
            f"{stops:<8}{compounds:<11}{delta:<16}{note}"
        )

    print(f"\n{'circuit':<13}{'SC window':<14}{'actual SC lap':<15}{'hit'}")
    print("-" * 52)
    for r in rows:
        window = f"{r['sc_window'][0]}-{r['sc_window'][1]}" if r["sc_window"] else "n/a"
        actual = str(r["sc_actual_lap"]) if r["sc_actual_lap"] else "none"
        print(f"{r['circuit']:<13}{window:<14}{actual:<15}{'YES' if r['sc_hit'] else 'no'}")

    # Score only on races the simulator actually claims to model.
    scored = [r for r in rows if r["comparable"]]
    excluded = [r for r in rows if not r["comparable"]]

    excluded_desc = ", ".join(f"{r['circuit']} - {r['excluded_reason']}" for r in excluded)
    print(f"\nScored on {len(scored)} clean dry race(s); {len(excluded)} excluded "
          f"({excluded_desc or 'none'}).")

    if scored:
        stops_hit = sum(r["stops_match"] for r in scored)
        compounds_hit = sum(r["compounds_match"] for r in scored)
        timed = [r for r in scored if r["actual_time_sec"]]
        avg_error = (
            sum(
                abs(r["predicted_time_sec"] - r["actual_time_sec"]) / r["actual_time_sec"] * 100
                for r in timed
            )
            / len(timed)
            if timed
            else None
        )
        print(f"  stop count correct:   {stops_hit}/{len(scored)}")
        print(f"  compound set correct: {compounds_hit}/{len(scored)}")
        if avg_error is not None:
            print(f"  mean race-time error: {avg_error:.1f}%")

    with_sc = [r for r in rows if r["sc_actual_lap"]]
    if with_sc:
        print(f"  SC window contained the real deployment: "
              f"{sum(r['sc_hit'] for r in with_sc)}/{len(with_sc)}")
    else:
        print("  no safety car deployed in any of these races -- SC window untested")


if __name__ == "__main__":
    main()
