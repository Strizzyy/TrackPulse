"""Ad-hoc calibration script -- NOT part of the app. Loads the already-
extracted frames from a previous real-video session and tries candidate
prompt sets against them, so prompt tuning doesn't require re-running the
whole /api/analyze pipeline (video upload + extraction) every iteration.

Ground truth for this specific run: the whole "max verstappen pole lap"
clip is a dry-track lap per the user -- so a good scorer should read
uniformly low wetness across real racing frames, and should flag the
non-racing frames (title/sponsor cards spliced into the clip) as such.

Usage: uv run python scripts/calibrate_vision.py <session_id>
"""
import glob
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline import vision  # noqa: E402


def main():
    session_id = sys.argv[1]
    frame_dir = os.path.join(os.path.dirname(__file__), "..", "data", "uploads", session_id, "frames")
    paths = sorted(glob.glob(os.path.join(frame_dir, "*.jpg")))
    print(f"{len(paths)} frames in {frame_dir}\n")

    for p in paths:
        result = vision.analyze_frame(p)
        flag = "  <-- NON-RACING" if result["is_racing"] < 0.5 else ""
        print(
            f"{os.path.basename(p):>16}  wetness={result['wetness']:.3f}  "
            f"is_racing={result['is_racing']:.3f}{flag}"
        )


if __name__ == "__main__":
    main()
