"""One-time offline pull: builds per-circuit strategy data from real FastF1
race sessions and writes app/data/circuits/{circuit_id}.json.

Generalises fetch_sc_stats.py (which did only Silverstone SC rates) to five
circuits and a much wider set of signals. Everything here is derived from real
sessions -- the only modelled part is the fuel correction used to strip fuel
burn out of the degradation regression, and its constants live in
app/pipeline/fuel.py so they are visible and arguable.

SLOW: 5 circuits x 7 years, plus one telemetry-loaded session per circuit for
corner geometry. First run downloads a lot and can take tens of minutes. Run it
once, commit the JSON, and never call FastF1 at request time (the demo must not
depend on a live pull).

    uv run python scripts/build_circuit_data.py
    uv run python scripts/build_circuit_data.py --circuit monza   # just one
"""

import argparse
import json
import os
import sys
import warnings

import fastf1
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline import fuel  # noqa: E402

warnings.filterwarnings("ignore", category=FutureWarning)

# FastF1 logs heavily; without this our own progress lines sit in a buffer
# behind it and the run looks hung.
sys.stdout.reconfigure(line_buffering=True)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".fastf1cache")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "data", "circuits")
YEARS = range(2019, 2026)

# Chosen for strategic variety, not convenience: high-deg vs low-deg, pit loss
# from ~18s to ~24s, wet-prone (Spa) vs reliably dry (Monza), and Monaco where
# track position beats strategy outright. If the optimiser is working, its
# output should look visibly different across these five.
CIRCUITS = [
    {"id": "silverstone", "event": "Silverstone", "name": "Silverstone Circuit", "lat": 52.0786, "lon": -1.0169},
    {"id": "monaco", "event": "Monaco", "name": "Circuit de Monaco", "lat": 43.7347, "lon": 7.4206},
    {"id": "spa", "event": "Spa", "name": "Circuit de Spa-Francorchamps", "lat": 50.4372, "lon": 5.9714},
    {"id": "monza", "event": "Monza", "name": "Autodromo Nazionale Monza", "lat": 45.6156, "lon": 9.2811},
    {"id": "suzuka", "event": "Suzuka", "name": "Suzuka International Racing Course", "lat": 34.8431, "lon": 136.5407},
]

SC_STATUS_CODES = {"4", "6", "7"}
GREEN = "1"
MIN_STINT_LAPS = 5  # shorter stints are too noisy to regress


def load_race(year, event, telemetry=False):
    session = fastf1.get_session(year, event, "R")
    session.load(telemetry=telemetry, laps=True, weather=True, messages=False)
    return session


def green_racing_laps(laps):
    """Green-flag laps only, excluding in- and out-laps. SC/VSC laps and pit
    laps would otherwise dominate a degradation fit with times that have
    nothing to do with tyre wear."""
    mask = (
        laps["LapTime"].notna()
        & laps["PitInTime"].isna()
        & laps["PitOutTime"].isna()
        & laps["TrackStatus"].astype(str).eq(GREEN)
    )
    return laps[mask]


def corner_percentages(session):
    """Real corner geometry: FastF1 gives each corner's Distance in metres from
    the start/finish line. Converting to start_pct/end_pct replaces the invented
    placeholder percentages that silverstone.json has carried from the start.

    Each corner's slice runs to the midpoint between it and the next corner, so
    the slices tile the whole lap with no gaps -- frames between two corners get
    attributed to the nearer one.
    """
    info = session.get_circuit_info()
    if info is None or info.corners is None or not len(info.corners):
        return None, None

    corners = info.corners.sort_values("Distance")
    try:
        lap_distance = float(session.laps.pick_fastest().get_telemetry()["Distance"].max())
    except Exception:
        lap_distance = float(corners["Distance"].max())
    if not lap_distance or lap_distance <= 0:
        return None, None

    distances = corners["Distance"].astype(float).to_list()
    boundaries = [0.0]
    for i in range(len(distances) - 1):
        boundaries.append((distances[i] + distances[i + 1]) / 2.0)
    boundaries.append(lap_distance)

    out = []
    for i, (_, row) in enumerate(corners.iterrows()):
        number = int(row["Number"])
        letter = str(row.get("Letter") or "").strip()
        out.append(
            {
                "name": f"Turn {number}{letter}",
                "number": number,
                "distance_m": round(float(row["Distance"]), 1),
                "start_pct": round(boundaries[i] / lap_distance, 4),
                "end_pct": round(boundaries[i + 1] / lap_distance, 4),
            }
        )
    return out, round(lap_distance, 1)


def stint_degradation(laps, total_laps):
    """Seconds lost per lap of tyre age, per compound.

    Fuel burn makes every stint look like it is getting FASTER, which would
    swamp the degradation signal, so lap times are fuel-corrected first (see
    app/pipeline/fuel.py). What is left is attributable to the tyre.
    """
    rows = []
    # Year MUST be part of the key. Grouping on (Driver, Stint, Compound) alone
    # merges the same driver's stint 2 from every season into one pseudo-stint,
    # which produced "109-lap" stints at a 78-lap circuit and regressed a single
    # line through several different races at once.
    for (_, _, _, compound), stint in laps.groupby(["Year", "Driver", "Stint", "Compound"]):
        if not compound or str(compound).upper() in ("NONE", "UNKNOWN", ""):
            continue
        if len(stint) < MIN_STINT_LAPS:
            continue
        age = stint["TyreLife"].astype(float).to_numpy()
        secs = stint["LapTime"].dt.total_seconds().to_numpy()
        lap_no = stint["LapNumber"].astype(float).to_numpy()
        if np.isnan(age).any() or np.isnan(secs).any():
            continue

        corrected = secs - np.array([fuel.fuel_time_penalty_sec(n, total_laps) for n in lap_no])

        # Symmetric IQR filter for traffic and mistakes. An earlier version kept
        # only laps below 1.05x the median, which is one-sided: it trims the
        # slow end of a stint (exactly where tyre wear shows up) and biases the
        # slope towards zero, differently for short and long stints.
        q1, q3 = np.percentile(corrected, [25, 75])
        spread = q3 - q1
        keep = (corrected >= q1 - 1.5 * spread) & (corrected <= q3 + 1.5 * spread)
        if keep.sum() < MIN_STINT_LAPS:
            continue

        slope, intercept = np.polyfit(age[keep], corrected[keep], 1)
        predicted = slope * age[keep] + intercept
        ss_res = float(np.sum((corrected[keep] - predicted) ** 2))
        ss_tot = float(np.sum((corrected[keep] - corrected[keep].mean()) ** 2))
        r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

        rows.append(
            {
                "compound": str(compound).upper(),
                "s_per_lap": float(slope),
                "stint_laps": int(len(stint)),
                "r2": r2,
            }
        )

    if not rows:
        return {}

    df = pd.DataFrame(rows)
    out = {}
    for compound, group in df.groupby("compound"):
        # Median across stints and years: individual stints are noisy, but the
        # central tendency across hundreds of them is a real circuit property.
        out[compound] = {
            "s_per_lap": round(float(group["s_per_lap"].median()), 4),
            "typical_stint_laps": int(group["stint_laps"].median()),
            # 90th percentile of observed stint lengths -- the longest a team
            # actually trusted this tyre here. The optimiser uses it as a hard
            # cap, which is what stops it recommending a 35-lap soft stint.
            "max_observed_stint_laps": int(group["stint_laps"].quantile(0.9)),
            "median_fit_r2": round(float(group["r2"].median()), 3),
            "samples": int(len(group)),
        }
    return out


DRY_COMPOUNDS = ("SOFT", "MEDIUM", "HARD")

# Tyre-age ceiling for the panel fit, so every compound is measured over a
# comparable window rather than soft-over-15-laps vs hard-over-40.
PANEL_MAX_TYRE_AGE = 20


def degradation_panel(per_race_laps):
    """Degradation per compound, controlling for track evolution.

    A plain per-stint regression of lap time on tyre age conflates two things
    that both move lap times through a race: the tyre wearing out, and the track
    rubbering in and getting faster. They cannot be separated *within* a stint --
    tyre age and lap number are perfectly collinear there (age = lap - start),
    which is why the first version of this produced non-monotonic nonsense like
    hard wearing faster than soft at every circuit.

    They are separable *across* stints, because different drivers run different
    compounds at different points in the race. This fits, per race:

        lap_time = driver_effect + evolution x lap_number
                   + SUM_over_compounds ( degradation_c x tyre_age_on_c )

    Driver dummies absorb car and driver pace, the lap_number term absorbs track
    evolution, and what is left on each compound's age term is wear.
    """
    per_compound = {c: [] for c in DRY_COMPOUNDS}
    evolution = []

    for laps in per_race_laps:
        green = green_racing_laps(laps)
        green = green[green["Compound"].astype(str).str.upper().isin(DRY_COMPOUNDS)]
        green = green[green["TyreLife"].notna() & green["LapNumber"].notna()]
        if len(green) < 100:
            continue

        total_laps = int(green["LapNumber"].max())
        drivers = sorted(green["Driver"].unique())
        compounds = [c for c in DRY_COMPOUNDS if (green["Compound"].str.upper() == c).any()]
        if len(drivers) < 5 or len(compounds) < 2:
            continue

        # Compare compounds over the SAME tyre-age window. Hard stints run far
        # longer than soft ones, so an unrestricted fit compares a soft tyre's
        # first 15 laps against a hard tyre's first 40 -- and because the long
        # hard stints run to the end of the race, their age term ends up
        # collinear with the lap-number (track evolution) term and absorbs it.
        green = green[green["TyreLife"] <= PANEL_MAX_TYRE_AGE]
        if len(green) < 100:
            continue

        secs = green["LapTime"].dt.total_seconds().to_numpy()
        lap_no = green["LapNumber"].astype(float).to_numpy()
        age = green["TyreLife"].astype(float).to_numpy()
        y = secs - np.array([fuel.fuel_time_penalty_sec(n, total_laps) for n in lap_no])

        # Trim outliers once, globally: traffic, lock-ups, damage.
        q1, q3 = np.percentile(y, [25, 75])
        keep = (y >= q1 - 1.5 * (q3 - q1)) & (y <= q3 + 1.5 * (q3 - q1))

        columns = [(green["Driver"] == d).to_numpy(dtype=float) for d in drivers]
        columns.append(lap_no)
        for compound in compounds:
            mask = (green["Compound"].str.upper() == compound).to_numpy(dtype=float)
            columns.append(age * mask)

        design = np.column_stack(columns)[keep]
        target = y[keep]
        if design.shape[0] <= design.shape[1]:
            continue

        try:
            coefficients, *_ = np.linalg.lstsq(design, target, rcond=None)
        except np.linalg.LinAlgError:
            continue

        evolution.append(float(coefficients[len(drivers)]))
        for i, compound in enumerate(compounds):
            per_compound[compound].append(float(coefficients[len(drivers) + 1 + i]))

    return (
        {c: values for c, values in per_compound.items() if values},
        float(np.median(evolution)) if evolution else None,
    )


def merge_degradation(stint_stats, panel_estimates):
    """Panel estimate is the degradation number; the per-stint pass still
    supplies stint lengths (how long teams actually ran each tyre), which the
    panel regression says nothing about."""
    merged = {}
    for compound, stats in stint_stats.items():
        entry = dict(stats)
        values = panel_estimates.get(compound)
        if values:
            entry["s_per_lap_per_stint"] = entry["s_per_lap"]  # keep for comparison
            entry["s_per_lap"] = round(float(np.median(values)), 4)
            entry["races_in_panel"] = len(values)
            entry["method"] = "panel regression, track-evolution controlled"
        else:
            entry["method"] = "per-stint regression (no panel estimate available)"
        merged[compound] = entry
    return merged


def degradation_confidence(deg):
    """Softer rubber must wear faster than harder rubber. Where the measured
    numbers say otherwise, the regression -- not physics -- is wrong.

    Real stint data conflates tyre wear with track evolution, traffic, fuel-model
    error and stint placement in the race, and those effects fall differently on
    short soft stints than on long hard ones. Rather than quietly "correcting"
    real measurements towards an assumption, flag the circuit and let race_sim
    fall back to reference degradation, with the measured values still published
    in the JSON so the disagreement is visible.
    """
    order = [c for c in ("SOFT", "MEDIUM", "HARD") if c in deg]
    if len(order) < 2:
        return "low", "Too few dry compounds with usable stint data."

    values = [deg[c]["s_per_lap"] for c in order]
    if all(values[i] >= values[i + 1] for i in range(len(values) - 1)):
        return "high", "Measured degradation is monotonic across compounds."

    pairs = ", ".join(f"{c}={deg[c]['s_per_lap']}" for c in order)
    return "low", (
        f"Measured degradation is not monotonic across compounds ({pairs}); "
        "reference values are used for simulation instead."
    )


def pit_loss_seconds(per_race_laps):
    """Time lost pitting = (in-lap + out-lap) - 2 x that driver's normal lap.

    The baseline has to be PER DRIVER PER RACE, not a global median. A single
    median across every driver and every year is dragged upwards by backmarkers
    and traffic, which makes the pit stop look cheaper than it is -- a first
    version of this returned 10.1s for Silverstone, roughly half the real ~20s.

    Stops made under safety car are also excluded: the field is slow, so the
    time lost is far lower than a green-flag stop and including them would
    understate the real cost of a strategy decision.
    """
    losses = []
    for laps in per_race_laps:
        for _, driver_laps in laps.groupby("Driver"):
            driver_laps = driver_laps.sort_values("LapNumber")
            green = green_racing_laps(driver_laps)
            if len(green) < 5:
                continue
            baseline = float(green["LapTime"].dt.total_seconds().median())

            secs = driver_laps["LapTime"].dt.total_seconds().to_numpy()
            in_pit = driver_laps["PitInTime"].notna().to_numpy()
            status = driver_laps["TrackStatus"].astype(str).to_numpy()
            for i in range(len(driver_laps) - 1):
                if not in_pit[i] or np.isnan(secs[i]) or np.isnan(secs[i + 1]):
                    continue
                if status[i] != GREEN or status[i + 1] != GREEN:
                    continue  # safety-car stop, not comparable
                losses.append(secs[i] + secs[i + 1] - 2 * baseline)

    if not losses:
        return None
    return round(float(np.median(losses)), 1)


def safety_car_stats(sessions):
    checked = 0
    with_sc = 0
    first_laps = []
    for session in sessions:
        checked += 1
        status = session.track_status
        sc = status[status["Status"].isin(SC_STATUS_CODES)]
        if not len(sc):
            continue
        with_sc += 1
        try:
            first_time = sc.iloc[0]["Time"]
            lap = session.laps[session.laps["Time"] <= first_time]["LapNumber"].max()
            if lap == lap:
                first_laps.append(int(lap))
        except Exception:
            pass
    return {
        "sessions_analyzed": checked,
        "sc_or_vsc_rate_pct": round(with_sc / checked * 100, 1) if checked else 0.0,
        "avg_first_deployment_lap": round(sum(first_laps) / len(first_laps), 1) if first_laps else None,
    }


def rain_frequency(sessions):
    wet = 0
    counted = 0
    for session in sessions:
        try:
            weather = session.weather_data
            if weather is None or not len(weather):
                continue
            counted += 1
            if bool(weather["Rainfall"].any()):
                wet += 1
        except Exception:
            continue
    return round(wet / counted * 100, 1) if counted else None


def build(circuit):
    print(f"\n=== {circuit['id']} ===")
    sessions = []
    all_laps = []
    total_laps = None

    for year in YEARS:
        try:
            session = load_race(year, circuit["event"])
        except Exception as e:
            print(f"  skip {year}: {type(e).__name__}: {e}")
            continue
        sessions.append(session)
        laps = session.laps.copy()
        laps["Year"] = year  # keeps stints from different seasons distinct
        all_laps.append(laps)
        try:
            total_laps = int(laps["LapNumber"].max())
        except Exception:
            pass
        print(f"  loaded {year} ({len(laps)} laps)")

    if not sessions:
        print(f"  NO DATA for {circuit['id']} -- skipping")
        return None

    combined = pd.concat(all_laps, ignore_index=True)
    green = green_racing_laps(combined)

    # Corner geometry needs telemetry (FastF1 derives corner Distance from a
    # reference lap), so it is loaded once for the newest usable year only.
    corners, lap_distance = None, None
    for session in reversed(sessions):
        try:
            tel_session = load_race(session.event.year, circuit["event"], telemetry=True)
            corners, lap_distance = corner_percentages(tel_session)
            if corners:
                print(f"  corners from {session.event.year}: {len(corners)}")
                break
        except Exception as e:
            print(f"  corner load failed for {session.event.year}: {type(e).__name__}: {e}")

    panel_estimates, track_evolution = degradation_panel(all_laps)
    base_lap_sec = float(green["LapTime"].dt.total_seconds().median()) if len(green) else None

    data = {
        "circuit_id": circuit["id"],
        "name": circuit["name"],
        "lat": circuit["lat"],
        "lon": circuit["lon"],
        "source": f"FastF1 race sessions {YEARS.start}-{YEARS.stop - 1}",
        "race_laps": total_laps,
        "lap_distance_m": lap_distance,
        "avg_lap_time_sec": round(base_lap_sec, 2) if base_lap_sec else None,
        "pit_loss_sec": pit_loss_seconds(all_laps),
        "rain_frequency_pct": rain_frequency(sessions),
        "degradation": merge_degradation(
            stint_degradation(green, total_laps or 50), panel_estimates
        ),
        "track_evolution_sec_per_lap": round(track_evolution, 4) if track_evolution is not None else None,
        "corners": corners or [],
        "corner_count": len(corners or []),
        "corner_source": "fastf1_circuit_info" if corners else "unavailable",
    }
    data.update(safety_car_stats(sessions))

    confidence, reason = degradation_confidence(data["degradation"])
    data["degradation_confidence"] = confidence
    data["degradation_note"] = reason

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{circuit['id']}.json")
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"  wrote {path}")
    print(f"    lap {data['avg_lap_time_sec']}s | pit loss {data['pit_loss_sec']}s | "
          f"SC {data['sc_or_vsc_rate_pct']}% | rain {data['rain_frequency_pct']}%")
    print(f"    degradation: {data['degradation']}")
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--circuit", help="build a single circuit by id")
    args = parser.parse_args()

    os.makedirs(CACHE_DIR, exist_ok=True)
    fastf1.Cache.enable_cache(CACHE_DIR)

    targets = [c for c in CIRCUITS if not args.circuit or c["id"] == args.circuit]
    if not targets:
        print(f"unknown circuit: {args.circuit}")
        sys.exit(1)

    built = [c["id"] for c in targets if build(c)]
    print(f"\nbuilt {len(built)}/{len(targets)}: {', '.join(built)}")


if __name__ == "__main__":
    main()
