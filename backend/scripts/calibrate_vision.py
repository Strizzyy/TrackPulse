"""Ad-hoc calibration script -- NOT part of the app. Scores a folder of
already-extracted frames with the real vision.py code path, so prompt/crop
tuning doesn't require re-running the whole /api/analyze pipeline (video
upload + extraction) every iteration.

Point it at either an upload session or any folder of frames:
    uv run python scripts/calibrate_vision.py <session_id>
    uv run python scripts/calibrate_vision.py --dir reference_footage/wet_1_frames
    uv run python scripts/calibrate_vision.py --dir <folder> --expect wet

--expect dry|wet turns the run into a pass/fail check: dry frames should
score low (<0.35), wet frames high (>0.65). Without it you just get numbers.

The original calibration run used a "max verstappen pole lap" clip, known
dry throughout -- a good scorer reads uniformly low wetness across its real
racing frames and flags the spliced-in title/sponsor cards as non-racing.
"""
import argparse
import glob
import os
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline import vision  # noqa: E402

DRY_MAX = 0.35
WET_MIN = 0.65


def frame_paths(directory: str):
    paths = []
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        paths.extend(glob.glob(os.path.join(directory, ext)))
    return sorted(paths)


def select_frames(paths, limit):
    """Evenly-spaced sample, not the first N -- the first N frames of a clip
    are its intro/title cards, and the first N of a lap is a single corner."""
    if not limit or len(paths) <= limit:
        return paths
    step = len(paths) / limit
    return [paths[int(i * step)] for i in range(limit)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("session_id", nargs="?", help="upload session id under data/uploads/")
    parser.add_argument("--dir", help="any folder of extracted frames (e.g. from fetch_footage.py)")
    parser.add_argument("--expect", choices=["dry", "wet"], help="ground truth, turns this into a pass/fail check")
    parser.add_argument("--limit", type=int, help="score at most N evenly-spaced frames (CLIP on CPU is slow)")
    args = parser.parse_args()

    backend = os.path.join(os.path.dirname(__file__), "..")
    if args.dir:
        frame_dir = args.dir if os.path.isabs(args.dir) else os.path.join(backend, args.dir)
    elif args.session_id:
        frame_dir = os.path.join(backend, "data", "uploads", args.session_id, "frames")
    else:
        parser.error("pass a session_id or --dir")

    paths = frame_paths(frame_dir)
    if not paths:
        print(f"no frames found in {frame_dir}")
        sys.exit(1)
    paths = select_frames(paths, args.limit)
    print(f"{len(paths)} frames in {frame_dir}")
    print(f"crop band: {vision.WETNESS_CROP_BAND}\n")

    racing_wetness = []
    dropped = 0
    for p in paths:
        result = vision.analyze_frame(p)
        is_racing = result["is_racing"] >= vision.RACING_THRESHOLD
        if is_racing:
            racing_wetness.append(result["wetness"])
        else:
            dropped += 1
        flag = "" if is_racing else "  <-- NON-RACING (dropped)"
        print(
            f"{os.path.basename(p):>18}  wetness={result['wetness']:.3f}  "
            f"is_racing={result['is_racing']:.3f}{flag}"
        )

    if not racing_wetness:
        print("\nevery frame was classified non-racing -- nothing to summarise")
        sys.exit(1)

    avg = statistics.mean(racing_wetness)
    print(f"\n--- {len(racing_wetness)} racing frames ({dropped} dropped) ---")
    print(f"avg={avg:.3f}  min={min(racing_wetness):.3f}  max={max(racing_wetness):.3f}")

    if args.expect == "dry":
        ok = sum(w < DRY_MAX for w in racing_wetness)
        print(f"expected DRY: {ok}/{len(racing_wetness)} frames below {DRY_MAX}")
        print("PASS" if avg < DRY_MAX else f"FAIL -- avg {avg:.3f} should be < {DRY_MAX}")
    elif args.expect == "wet":
        ok = sum(w > WET_MIN for w in racing_wetness)
        print(f"expected WET: {ok}/{len(racing_wetness)} frames above {WET_MIN}")
        print("PASS" if avg > WET_MIN else f"FAIL -- avg {avg:.3f} should be > {WET_MIN}")


if __name__ == "__main__":
    main()
