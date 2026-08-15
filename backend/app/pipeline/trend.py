from typing import Dict, List

import numpy as np

# Calibrated against a real, known-all-dry onboard lap (see
# scripts/calibrate_vision.py): with the cropped-frame + onboard-aware
# prompts in vision.py, genuinely dry racing frames measured median=0.21,
# mean=0.29, p75=0.41, p90=0.64. These cutoffs are set so most real-dry
# frames land in "dry", the rest in "damp"/"drying", and only clear
# outliers reach "wet" -- not the symmetric 0.25/0.6 guess from before
# any real footage had been tested.
DRY_CUTOFF = 0.35
WET_CUTOFF = 0.65

# Per-LAP epsilon, and the ONLY slope threshold in the codebase -- every slope
# that crosses a module boundary is now expressed in wetness per lap, so there
# is exactly one unit and exactly one cut point. (This constant lived in
# session.py while the single-lap path used a separate per-SECOND epsilon; the
# two disagreed about what "drying" meant, which is how one run could report
# direction "drying" next to a positive slope and a rising forecast.)
#
# Scale comes from the label cutoffs: wet (0.65) to dry (0.35) is a 0.3 swing.
# A track making that transition over a 35-lap stint is moving ~0.009/lap, so
# anything at or above that is a real, race-relevant trend. An earlier value of
# 0.02/lap was far too coarse -- it called a measured -0.014/lap "stable", which
# extrapolates to a complete wet-to-dry change inside half a race distance.
LAP_SLOPE_EPS = 0.008


def label_for_score(score: float, slope_per_lap: float) -> str:
    """`slope_per_lap` is wetness per LAP -- see LAP_SLOPE_EPS. Pass 0.0 when
    no trend is available, never a per-second figure."""
    if score < DRY_CUTOFF:
        return "dry"
    if score > WET_CUTOFF:
        return "wet"
    return "drying" if slope_per_lap < -LAP_SLOPE_EPS else "damp"


def direction_for_slope(slope_per_lap: float) -> str:
    """The one place a slope becomes a direction word. Callers that decide
    anything (tyre call, SC risk) must pass the NET slope -- measured visual
    trend plus the weather adjustment -- not the raw measured slope. A dry
    Monza lap measured +0.0112/lap of pure frame noise, which cleared this
    threshold and produced a high-urgency "rain arriving" call while the
    forecast, working from the net +0.0012/lap, drew a flat line."""
    if slope_per_lap < -LAP_SLOPE_EPS:
        return "drying"
    if slope_per_lap > LAP_SLOPE_EPS:
        return "wetting"
    return "stable"


def map_corner(timestamp_sec: float, lap_duration_sec: float, corners: List[Dict]) -> str:
    """Deterministic timestamp -> corner lookup via known sector-time
    proportions. No model involved -- this is geometry, not ML."""
    if lap_duration_sec <= 0:
        return corners[0]["name"]
    pct = (timestamp_sec / lap_duration_sec) % 1.0
    for corner in corners:
        if corner["start_pct"] <= pct < corner["end_pct"]:
            return corner["name"]
    return corners[-1]["name"]


def compute_trend(frames: List[Dict], lap_duration_sec: float) -> Dict:
    """Fit wetness against timestamp across the WHOLE lap, and report it in
    wetness per lap -- the single number every downstream consumer uses.

    There used to be a second fit here over the last 15 seconds
    (`recent_slope`), and the two were wired to different panels: `direction`,
    the frame labels, the tyre call and the SC risk read the 15-second fit,
    while the forecast read the whole-lap fit. On a real Monaco lap those two
    had opposite signs -- a late-lap wet patch (T16-T18) tilted the whole-lap
    fit positive while the T18->T19 drop-off tilted the last 15 seconds
    steeply negative -- so the same run reported "drying" and "slicks, stay
    out" next to a forecast saturating at fully wet within four laps.

    Only the whole-lap fit survives. Five frames at ~1fps cannot support a
    trend, and scaling that window up to a per-lap rate amplifies its noise
    exactly as much as its signal (see the same argument in session.py).

    Note what this slope can and cannot mean: within one lap the time axis and
    the track-position axis are the same axis, so this measures "are the last
    corners wetter than the first", not "is the track drying". Multi-lap
    session mode is the path that can actually measure a trend over time."""
    timestamps = np.array([f["timestamp_sec"] for f in frames], dtype=float)
    scores = np.array([f["wetness_score"] for f in frames], dtype=float)

    slope_per_sec = float(np.polyfit(timestamps, scores, 1)[0]) if len(frames) > 1 else 0.0
    slope_per_lap = slope_per_sec * lap_duration_sec

    return {
        "slope": slope_per_sec,
        "slope_per_lap": slope_per_lap,
        # The MEASURED direction. Callers deciding anything should use the net
        # direction instead -- see direction_for_slope().
        "direction": direction_for_slope(slope_per_lap),
    }


# Lap-consistency guard for per-corner reads (15 Aug 2026).
#
# Water on a circuit is spatially correlated: rain falls on the track, not on
# one corner. So a corner reading "wet" (0.79) inside a lap whose overall
# character is bone dry (median 0.15) is not a puddle -- it is the camera
# pointing at something CLIP can't read. Measured case: a sunny, dry Monaco
# onboard read Rascasse / Antony Noghes at 0.79-0.80 across several
# consecutive frames (the crop band there is Pirelli barriers and a shaded
# wall, almost no tarmac; at ~50 km/h that scene fills the band for 3-4 s so
# temporal smoothing can't reject it, and CLIP was measured unable to tell
# "road" from "barrier" in this crop -- see vision.py).
#
# The guard: a corner more than CORNER_OUTLIER_GAP above/below the lap median
# is pulled toward the median by CORNER_SHRINK. It is anchored on the MEDIAN,
# so a genuinely wet lap (median ~0.8) or a genuinely half-wet lap keeps its
# spread -- only isolated outliers against a consistent lap are damped, and
# their raw average is still returned as `avg_wetness_raw` so nothing is
# hidden. Corners within the gap of the median are untouched.
#
# And it only fires when the lap is otherwise CONSISTENT: if the
# interquartile range of corner averages is wide, the lap has genuine spread
# (a drying line, half the circuit wet) and the guard stands down entirely so
# real transitions are never flattened. A tight lap (IQR small) with a corner
# sticking out is the artifact case. Measured on a synthetic half-wet lap
# (IQR ~0.45): an outlier-count rule alone still pulled the genuinely dry end
# of the lap up to "damp"; the IQR rule leaves it alone.
CORNER_OUTLIER_GAP = 0.30
CORNER_SHRINK = 0.6
CORNER_CONSISTENT_IQR = 0.20


def _median(values: List[float]) -> float:
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2.0


def build_corner_summary(frames: List[Dict]) -> List[Dict]:
    """One entry per corner, including a representative real frame image --
    the frame whose own wetness score is closest to the corner's average,
    so what's shown is an actual photo of that corner, not a swatch.

    Applies the lap-consistency guard above to isolated outlier corners."""
    by_corner: Dict[str, List[Dict]] = {}
    order: List[str] = []
    for f in frames:
        corner = f["corner"]
        if corner not in by_corner:
            by_corner[corner] = []
            order.append(corner)
        by_corner[corner].append(f)

    raw_avgs = {
        corner: sum(f["wetness_score"] for f in by_corner[corner]) / len(by_corner[corner])
        for corner in order
    }
    values = sorted(raw_avgs.values())
    lap_median = _median(values) if values else 0.0
    if len(values) >= 4:
        q1, q3 = values[len(values) // 4], values[(3 * len(values)) // 4]
        guard_active = (q3 - q1) <= CORNER_CONSISTENT_IQR
    else:
        guard_active = False

    summary = []
    for corner in order:
        corner_frames = by_corner[corner]
        raw_avg = raw_avgs[corner]
        gap = raw_avg - lap_median
        if guard_active and abs(gap) > CORNER_OUTLIER_GAP:
            avg = lap_median + gap * (1.0 - CORNER_SHRINK)
        else:
            avg = raw_avg
        representative = min(corner_frames, key=lambda f: abs(f["wetness_score"] - raw_avg))
        summary.append(
            {
                "corner": corner,
                "avg_wetness": round(avg, 3),
                "avg_wetness_raw": round(raw_avg, 3),
                "label": label_for_score(avg, 0.0),
                "image_url": representative["image_url"],
            }
        )
    return summary


def current_condition_summary(frames: List[Dict], slope_per_lap: float, window: int = 5) -> Dict:
    """"Current condition" needs to be a smoothed read, not the literal
    last frame's raw score -- individual frames are noisy (a single frame
    can swing well above the surrounding average, see calibrate_vision.py)
    and using just one was producing a "current condition" banner that
    visibly contradicted the corner-by-corner breakdown. Averages the last
    `window` frames, then picks the real frame among them closest to that
    average so the displayed image still matches the displayed number --
    and the label comes from the averaged score, not the representative
    frame's own (still slightly noisy) individual label."""
    recent = frames[-window:]
    avg = sum(f["wetness_score"] for f in recent) / len(recent)
    representative = min(recent, key=lambda f: abs(f["wetness_score"] - avg))
    return {
        "label": label_for_score(avg, slope_per_lap),
        "wetness_score": round(avg, 3),
        "image_url": representative["image_url"],
        "timestamp_sec": representative["timestamp_sec"],
    }


def trend_summary_text(direction: str, corners_summary: List[Dict]) -> str:
    damp_or_wet = [c for c in corners_summary if c["label"] in ("damp", "drying", "wet")]
    text = f"Track is {direction}"
    if damp_or_wet and len(damp_or_wet) < len(corners_summary):
        text += f"; {len(damp_or_wet)} of {len(corners_summary)} corners still damp or wet."
    else:
        text += "."
    return text
