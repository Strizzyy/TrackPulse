"""Finds which vertical slice of the frame to score, by measuring instead of
guessing -- NOT part of the app.

vision.WETNESS_CROP_BAND was tuned for halo-cam onboards, where the tarmac
sits in the top third. Other camera angles put it somewhere else entirely
(a cockpit/driver-POV clip has sky and grandstands up top), and scoring the
wrong band means measuring the weather rather than the track surface.

Give it a known-dry folder and a known-wet folder of frames; it scores both
under each candidate band and reports the separation (wet avg - dry avg).
The winning band is the one that separates them most -- a band that scores
dry and wet alike is worthless no matter how low the dry number looks.

Usage:
    uv run python scripts/sweep_crop.py --dry <dry_frames_dir> --wet <wet_frames_dir>
    uv run python scripts/sweep_crop.py --dry <d> --wet <w> --limit 15

--limit caps frames per folder (default 20) since this runs every band over
every frame and CLIP on CPU is not fast.
"""
import argparse
import os
import statistics
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.pipeline import vision  # noqa: E402
from calibrate_vision import frame_paths, select_frames  # noqa: E402

CANDIDATE_BANDS = [
    (0.00, 0.35),  # current default -- halo-cam onboard, tarmac in the top strip
    (0.00, 0.25),  # sky only, in a driver-POV clip -- the confound check: if this
                   # separates dry from wet as well as the tarmac bands do, the
                   # score is reading the weather overhead, not the track surface
    (0.00, 0.50),
    (0.30, 0.60),
    (0.40, 0.58),  # driver-POV: measured tarmac band (horizon ~0.42, dash ~0.58)
    (0.35, 0.70),
    (0.50, 0.95),  # cockpit POV with the tarmac low in frame
    (0.00, 1.00),  # full frame, as a baseline
]


def score_folder(directory: str, band, limit: int):
    paths = select_frames(frame_paths(directory), limit)
    if not paths:
        raise SystemExit(f"no frames found in {directory}")
    scores = []
    for p in paths:
        result = vision.analyze_frame(p, crop_band=band)
        if result["is_racing"] >= vision.RACING_THRESHOLD:
            scores.append(result["wetness"])
    return scores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", required=True, help="folder of known-DRY frames")
    parser.add_argument("--wet", required=True, help="folder of known-WET frames")
    parser.add_argument("--limit", type=int, default=20, help="max frames per folder")
    args = parser.parse_args()

    backend = os.path.join(os.path.dirname(__file__), "..")
    resolve = lambda d: d if os.path.isabs(d) else os.path.join(backend, d)  # noqa: E731

    print(f"{'band':>14} {'dry avg':>9} {'wet avg':>9} {'separation':>11}")
    print("-" * 46)

    results = []
    for band in CANDIDATE_BANDS:
        dry = score_folder(resolve(args.dry), band, args.limit)
        wet = score_folder(resolve(args.wet), band, args.limit)
        if not dry or not wet:
            print(f"{str(band):>14}  -- all frames dropped as non-racing")
            continue
        dry_avg, wet_avg = statistics.mean(dry), statistics.mean(wet)
        separation = wet_avg - dry_avg
        results.append((separation, band, dry_avg, wet_avg))
        print(f"{str(band):>14} {dry_avg:9.3f} {wet_avg:9.3f} {separation:11.3f}")

    if not results:
        return
    separation, band, dry_avg, wet_avg = max(results)
    print(f"\nbest separation: band {band} (dry {dry_avg:.3f} -> wet {wet_avg:.3f}, gap {separation:.3f})")
    if separation < 0.2:
        print("WARNING: even the best band barely separates dry from wet -- the")
        print("prompts are the problem, not the crop. Re-tune PROMPT_PAIRS next.")
    print("\nTo adopt: set WETNESS_CROP_BAND in app/pipeline/vision.py to that band,")
    print("then re-run calibrate_vision.py --expect dry / --expect wet to confirm.")


if __name__ == "__main__":
    main()
