"""Sanity checks for the strategy stack -- NOT part of the app.

These assert relationships that must hold if the models are wired up correctly,
rather than exact numbers (the numbers come from real per-circuit data and will
shift when it is rebuilt). A wrong sign or a broken ordering here means the
optimiser's recommendation is meaningless, so this is the first thing to run
after touching fuel.py, race_sim.py or optimizer.py.

Run: uv run python scripts/test_strategy.py
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline import circuits, fuel, optimizer, race_sim  # noqa: E402

failures = []


def check(name, condition, detail=""):
    print(f"{'PASS' if condition else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))
    if not condition:
        failures.append(name)


print("--- fuel model ---")
full = fuel.fuel_time_penalty_sec(1, 52)
empty = fuel.fuel_time_penalty_sec(52, 52)
check("full tank costs more than empty", full > empty, f"{full:.2f}s vs {empty:.2f}s")
check("full-tank penalty is realistic (2-4s)", 2.0 < full < 4.0, f"{full:.2f}s")

print("\n--- per-circuit data ---")
available = circuits.available()
check("at least one circuit built", len(available) > 0, f"{len(available)} found")
for circuit_summary in available:
    circuit = circuits.load(circuit_summary["circuit_id"])
    cid = circuit["circuit_id"]
    pit = circuit.get("pit_loss_sec")
    deg = circuit.get("degradation") or {}

    check(f"{cid}: pit loss in a sane range (14-30s)", pit is not None and 14 <= pit <= 30, f"{pit}s")

    race_laps = circuit.get("race_laps") or 0
    for compound, values in deg.items():
        observed = values.get("max_observed_stint_laps")
        if observed and race_laps:
            check(
                f"{cid}: {compound} max stint <= race distance",
                observed <= race_laps,
                f"{observed} laps in a {race_laps}-lap race",
            )

    # Softer rubber must wear faster than harder rubber. Measured stint data
    # does NOT reliably reproduce that ordering (see degradation_confidence in
    # build_circuit_data.py), so what is asserted here is that the gate caught
    # it and the simulator fell back -- not that the raw numbers are right.
    confidence = circuit.get("degradation_confidence")
    check(f"{cid}: degradation confidence is set", confidence in ("high", "low"), str(confidence))

    if confidence == "high":
        soft, hard = deg["SOFT"]["s_per_lap"], deg["HARD"]["s_per_lap"]
        check(f"{cid}: soft degrades faster than hard", soft > hard, f"soft {soft} vs hard {hard}")
    else:
        used_soft = race_sim.compound_degradation(circuit, "SOFT")
        used_hard = race_sim.compound_degradation(circuit, "HARD")
        check(
            f"{cid}: low-confidence data falls back to reference degradation",
            used_soft == race_sim.DEFAULT_DEG_S_PER_LAP["SOFT"] and used_soft > used_hard,
            f"simulating with soft {used_soft} vs hard {used_hard}",
        )
    corners = circuit.get("corners") or []
    if corners:
        monotonic = all(
            corners[i]["end_pct"] <= corners[i + 1]["start_pct"] + 1e-6 for i in range(len(corners) - 1)
        )
        check(f"{cid}: corner slices are ordered and non-overlapping", monotonic)
        check(
            f"{cid}: corner slices cover the lap",
            abs(corners[0]["start_pct"]) < 1e-6 and abs(corners[-1]["end_pct"] - 1.0) < 0.01,
            f"{corners[0]['start_pct']} -> {corners[-1]['end_pct']}",
        )

if not available:
    print("\nNo circuit data built yet -- run scripts/build_circuit_data.py first.")
    sys.exit(1)

circuit = circuits.load(available[0]["circuit_id"])
laps = circuit.get("race_laps") or 52

print(f"\n--- race simulation ({circuit['circuit_id']}, {laps} laps) ---")
one_stop = race_sim.simulate(
    [{"compound": "MEDIUM", "laps": laps // 2}, {"compound": "HARD", "laps": laps - laps // 2}],
    circuit, laps,
)
two_stop = race_sim.simulate(
    [
        {"compound": "SOFT", "laps": laps // 3},
        {"compound": "MEDIUM", "laps": laps // 3},
        {"compound": "HARD", "laps": laps - 2 * (laps // 3)},
    ],
    circuit, laps,
)
print(f"      1-stop {one_stop['total_time_display']}  |  2-stop {two_stop['total_time_display']}")
check("1-stop pays one pit loss", one_stop["stops"] == 1)
check("2-stop pays two pit losses", two_stop["stops"] == 2)
check(
    "race time is realistic (60-150 min)",
    3600 < one_stop["total_time_sec"] < 9000,
    one_stop["total_time_display"],
)

wet = race_sim.simulate(
    [{"compound": "MEDIUM", "laps": laps // 2}, {"compound": "HARD", "laps": laps - laps // 2}],
    circuit, laps, wetness_by_lap=[1.0] * laps,
)
check("a wet race is slower than a dry one", wet["total_time_sec"] > one_stop["total_time_sec"],
      f"{wet['total_time_display']} vs {one_stop['total_time_display']}")

print("\n--- optimiser ---")
plan = optimizer.optimise(circuit, total_laps=laps)
check("candidates were evaluated", plan["candidates_evaluated"] > 0, f"{plan['candidates_evaluated']}")
check("a strategy was recommended", plan.get("recommended") is not None)
best = plan["recommended"]
compounds = {s["compound"] for s in best["stints"]}
check("recommendation obeys the two-compound rule", len(compounds) >= 2, str(sorted(compounds)))
check(
    "stint laps sum to the race distance",
    sum(s["laps"] for s in best["stints"]) == laps,
    f"{sum(s['laps'] for s in best['stints'])} vs {laps}",
)
print(f"      best: {best['plan']}  {best['total_time_display']}")
for option in plan["best_per_stop_count"]:
    print(f"      {option['stops']}-stop: {option['plan']:<22} +{option['delta_to_best_sec']}s")

print(f"\n{'ALL PASS' if not failures else f'{len(failures)} FAILED: ' + ', '.join(failures)}")
sys.exit(1 if failures else 0)
