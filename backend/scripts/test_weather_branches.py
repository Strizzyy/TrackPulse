"""Forces every branch of weather.project_condition() with stubbed forecast
data -- NOT part of the app.

It has not rained at Silverstone during any test run, so the live API has
only ever returned zeros and only the drying branch has ever executed. The
rain branches were untested code shipping into a demo about rain. This
substitutes known forecast values so all three paths actually run.

Run: uv run python scripts/test_weather_branches.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline import weather  # noqa: E402

CASES = [
    # name,                     mm,      prob,   current, slope,  expect
    ("dry, stable",             [0.0],   [0.0],  0.20,    0.0,    "falling"),
    ("dry, rain likely soon",   [0.0],   [70.0], 0.20,    0.0,    "rising"),
    ("dry, rain falling",       [0.8],   [90.0], 0.20,    0.0,    "rising"),
    ("wet, drying, no rain",    [0.0],   [5.0],  0.80,   -0.03,   "falling"),
    ("wet, rain falling",       [1.5],   [95.0], 0.80,    0.0,    "rising"),
    ("damp, drying vs rain",    [0.5],   [80.0], 0.50,   -0.04,   "rising"),
    ("no data at all",          [],      [],     0.50,    0.0,    "falling"),
]

failures = 0
for name, mm, prob, current, slope, expect in CASES:
    result = weather.project_condition(
        current_score=current,
        recent_slope=slope,
        precipitation_mm=mm,
        num_laps=5,
        avg_lap_time_sec=90.5,
        precipitation_probability_pct=prob,
    )
    projected = result["projected_wetness"]
    direction = "rising" if projected[-1] > current else "falling"
    ok = direction == expect
    failures += not ok

    print(f"{'PASS' if ok else 'FAIL'}  {name}")
    print(f"      rain {result['rain_probability_pct']}% / {result['precipitation_mm']}mm"
          f"  -> adjustment {result['weather_adjustment']:+.2f}/lap")
    print(f"      {current} -> {projected}  ({direction}, expected {expect})")
    print(f"      {result['forecast_rationale']}")

# The mislabel this file was written to catch: rain_probability_pct used to be
# millimetres * 100, so light drizzle reported an impossible-looking figure.
drizzle = weather.project_condition(0.5, 0.0, [0.3], 3, 90.5, precipitation_probability_pct=[40.0])
if drizzle["rain_probability_pct"] != 40.0:
    print(f"FAIL  rain_probability_pct is {drizzle['rain_probability_pct']}, expected the API's 40.0")
    failures += 1
else:
    print("PASS  rain_probability_pct reports the API probability, not mm * 100")

print(f"\n{len(CASES) + 1 - failures}/{len(CASES) + 1} passed")
sys.exit(1 if failures else 0)
