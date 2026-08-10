"""Multi-lap session analysis -- a real trend over TIME.

Why this exists: trend.compute_trend() fits wetness against timestamp within a
single ~90s lap. Inside one lap, time and track position are the same axis, so
that slope actually measures "are the last corners wetter than the first", not
"is the track drying". Every real clip tested returned a slope of -0.0; only a
synthetic ramp with a manufactured time axis ever produced one.

Bucketing frames into laps and comparing lap averages gives an axis where time
varies and position doesn't -- which is what the problem statement's "trend over
time, better or worse?" actually asks for.
"""

from typing import Dict, List, Optional

import numpy as np

from app.pipeline import trend as trend_module

# Per-LAP epsilon. trend.SLOPE_EPS (0.01) is calibrated per SECOND, so it can't
# be reused here -- 0.01/lap is roughly 0.0001/s.
#
# Scale comes from the label cutoffs: wet (0.65) to dry (0.35) is a 0.3 swing.
# A track making that transition over a 35-lap stint is moving ~0.009/lap, so
# anything at or above that is a real, race-relevant trend. An earlier value of
# 0.02/lap was far too coarse -- it called a measured -0.014/lap "stable", which
# extrapolates to a complete wet-to-dry change inside half a race distance.
LAP_SLOPE_EPS = 0.008


def segment_laps(frames: List[Dict], lap_duration_sec: float) -> List[Dict]:
    """Tag each frame with the lap it belongs to. Fixed-duration segmentation:
    we don't detect start/finish crossings, we divide by a known lap time."""
    if lap_duration_sec <= 0:
        for frame in frames:
            frame["lap_index"] = 0
        return frames
    for frame in frames:
        frame["lap_index"] = int(frame["timestamp_sec"] // lap_duration_sec)
    return frames


def build_lap_summaries(frames: List[Dict]) -> List[Dict]:
    """One entry per lap: average wetness, label, and a real representative
    frame -- same approach as trend.build_corner_summary, one level up."""
    by_lap: Dict[int, List[Dict]] = {}
    for frame in frames:
        by_lap.setdefault(frame["lap_index"], []).append(frame)

    summaries = []
    for lap_index in sorted(by_lap):
        lap_frames = by_lap[lap_index]
        avg = sum(f["wetness_score"] for f in lap_frames) / len(lap_frames)
        representative = min(lap_frames, key=lambda f: abs(f["wetness_score"] - avg))
        summaries.append(
            {
                "lap": lap_index + 1,
                "avg_wetness": round(avg, 3),
                "label": trend_module.label_for_score(avg, 0.0),
                "frame_count": len(lap_frames),
                "image_url": representative["image_url"],
                "corners": trend_module.build_corner_summary(lap_frames),
            }
        )
    return summaries


def compute_session_trend(lap_summaries: List[Dict]) -> Dict:
    """Slope in wetness per LAP -- directly usable by weather.project_condition,
    which applies its adjustment once per lap. (The single-lap path has to
    convert, because compute_trend returns per-second.)"""
    if len(lap_summaries) < 2:
        return {
            "slope_per_lap": 0.0,
            "direction": "stable",
            "laps_analyzed": len(lap_summaries),
            "summary": "Only one lap of data -- no trend over time available yet.",
        }

    laps = np.array([s["lap"] for s in lap_summaries], dtype=float)
    scores = np.array([s["avg_wetness"] for s in lap_summaries], dtype=float)
    slope = float(np.polyfit(laps, scores, 1)[0])

    if slope < -LAP_SLOPE_EPS:
        direction = "drying"
    elif slope > LAP_SLOPE_EPS:
        direction = "wetting"
    else:
        direction = "stable"

    first, last = lap_summaries[0], lap_summaries[-1]
    change = last["avg_wetness"] - first["avg_wetness"]
    summary = (
        f"Track is {direction} across {len(lap_summaries)} laps: "
        f"{first['avg_wetness']:.2f} on lap {first['lap']} to "
        f"{last['avg_wetness']:.2f} on lap {last['lap']} "
        f"({change:+.2f}, {slope:+.3f} per lap)."
    )

    return {
        "slope_per_lap": round(slope, 4),
        "direction": direction,
        "laps_analyzed": len(lap_summaries),
        "total_change": round(change, 3),
        "summary": summary,
    }


def wetness_projection(
    lap_summaries: List[Dict],
    slope_per_lap: float,
    race_laps: int,
    start_lap: Optional[int] = None,
) -> List[float]:
    """Extrapolate measured wetness forward over a race distance, so the race
    simulator knows which laps are wet. Clamped to [0, 1]; deliberately a
    straight-line continuation of what was measured, not a curve fit -- see the
    same reasoning in weather.project_condition."""
    if not lap_summaries:
        return [0.0] * race_laps
    current = lap_summaries[-1]["avg_wetness"]
    start_lap = start_lap if start_lap is not None else lap_summaries[-1]["lap"]

    projection = []
    for lap in range(1, race_laps + 1):
        laps_ahead = max(lap - start_lap, 0)
        projection.append(round(min(max(current + slope_per_lap * laps_ahead, 0.0), 1.0), 3))
    return projection
