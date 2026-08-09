"""One-time script: pulls Silverstone historical race sessions via FastF1 and
computes an empirical Safety Car / VSC deployment rate to replace the
placeholder in app/data/sc_stats.json.

Run manually, not at request time (needs internet, first pull can be slow):
    uv run python scripts/fetch_sc_stats.py

NOTE: FastF1's track_status Status codes below are best-effort from memory
(4=SC deployed, 6/7=VSC deploy/end) -- double check against the installed
FastF1 version's docs (fastf1.core / session.track_status) if the counts
look wrong.
"""

import json
import os

import fastf1

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".fastf1cache")
os.makedirs(CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(CACHE_DIR)

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "app", "data", "sc_stats.json")
YEARS = range(2019, 2026)
SC_STATUS_CODES = {"4", "6", "7"}


def main():
    sessions_checked = 0
    sc_sessions = 0
    first_deploy_laps = []

    for year in YEARS:
        try:
            session = fastf1.get_session(year, "Silverstone", "R")
            session.load(telemetry=False, laps=True, weather=False, messages=False)
        except Exception as e:
            print(f"skip {year}: {e}")
            continue

        sessions_checked += 1
        status = session.track_status
        sc_laps = status[status["Status"].isin(SC_STATUS_CODES)]
        if len(sc_laps) > 0:
            sc_sessions += 1
            try:
                first_time = sc_laps.iloc[0]["Time"]
                lap_number = session.laps[session.laps["Time"] <= first_time]["LapNumber"].max()
                if lap_number == lap_number:  # not NaN
                    first_deploy_laps.append(int(lap_number))
            except Exception:
                pass

    rate = round((sc_sessions / sessions_checked) * 100, 1) if sessions_checked else 0
    avg_first_lap = (
        round(sum(first_deploy_laps) / len(first_deploy_laps), 1) if first_deploy_laps else None
    )

    result = {
        "track_id": "silverstone",
        "sessions_analyzed": sessions_checked,
        "sc_or_vsc_rate_pct": rate,
        "avg_first_deployment_lap": avg_first_lap,
    }
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Wrote {OUTPUT_PATH}: {result}")


if __name__ == "__main__":
    main()
