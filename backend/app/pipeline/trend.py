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
SLOPE_EPS = 0.01


def label_for_score(score: float, slope: float) -> str:
    if score < DRY_CUTOFF:
        return "dry"
    if score > WET_CUTOFF:
        return "wet"
    return "drying" if slope < -SLOPE_EPS else "damp"


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


def compute_trend(frames: List[Dict], window_sec: float = 15.0) -> Dict:
    timestamps = np.array([f["timestamp_sec"] for f in frames], dtype=float)
    scores = np.array([f["wetness_score"] for f in frames], dtype=float)

    overall_slope = float(np.polyfit(timestamps, scores, 1)[0]) if len(frames) > 1 else 0.0

    recent_mask = timestamps >= (timestamps[-1] - window_sec)
    if recent_mask.sum() > 1:
        recent_slope = float(np.polyfit(timestamps[recent_mask], scores[recent_mask], 1)[0])
    else:
        recent_slope = overall_slope

    if recent_slope < -SLOPE_EPS:
        direction = "drying"
    elif recent_slope > SLOPE_EPS:
        direction = "wetting"
    else:
        direction = "stable"

    return {"slope": overall_slope, "recent_slope": recent_slope, "direction": direction}


def build_corner_summary(frames: List[Dict]) -> List[Dict]:
    """One entry per corner, including a representative real frame image --
    the frame whose own wetness score is closest to the corner's average,
    so what's shown is an actual photo of that corner, not a swatch."""
    by_corner: Dict[str, List[Dict]] = {}
    order: List[str] = []
    for f in frames:
        corner = f["corner"]
        if corner not in by_corner:
            by_corner[corner] = []
            order.append(corner)
        by_corner[corner].append(f)

    summary = []
    for corner in order:
        corner_frames = by_corner[corner]
        avg = sum(f["wetness_score"] for f in corner_frames) / len(corner_frames)
        representative = min(corner_frames, key=lambda f: abs(f["wetness_score"] - avg))
        summary.append(
            {
                "corner": corner,
                "avg_wetness": round(avg, 3),
                "label": label_for_score(avg, 0.0),
                "image_url": representative["image_url"],
            }
        )
    return summary


def current_condition_summary(frames: List[Dict], recent_slope: float, window: int = 5) -> Dict:
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
        "label": label_for_score(avg, recent_slope),
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
