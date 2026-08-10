"""Data-teammate utility: download a YouTube clip and slice it into
reference frames for eyeballing / labeling (not used at request time --
runtime extraction is app/pipeline/frames.py).

Usage:
    uv tool install yt-dlp   # separate one-off install, not in the backend's deps
    python scripts/fetch_footage.py <youtube_url> <clip_name>
    python scripts/fetch_footage.py --slice <clip_name>   # already downloaded

Saves to reference_footage/<clip_name>.mp4 and reference_footage/<clip_name>_frames/.
Feed the frames folder to scripts/calibrate_vision.py --dir.
"""

import os
import subprocess
import sys

import cv2


def download(url: str, out_path: str):
    subprocess.run(["yt-dlp", "-f", "mp4", "-o", out_path, url], check=True)


def slice_frames(video_path: str, out_dir: str, fps: float = 1.0):
    os.makedirs(out_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    interval = max(int(video_fps / fps), 1)
    idx = saved = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % interval == 0:
            cv2.imwrite(os.path.join(out_dir, f"frame_{saved:04d}.jpg"), frame)
            saved += 1
        idx += 1
    cap.release()
    print(f"saved {saved} frames to {out_dir}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python scripts/fetch_footage.py <youtube_url> <clip_name>")
        print("       python scripts/fetch_footage.py --slice <clip_name>")
        sys.exit(1)

    url, name = sys.argv[1], sys.argv[2]
    out_root = os.path.join(os.path.dirname(__file__), "..", "reference_footage")
    os.makedirs(out_root, exist_ok=True)
    video_path = os.path.join(out_root, f"{name}.mp4")

    if url != "--slice":
        download(url, video_path)
    slice_frames(video_path, os.path.join(out_root, f"{name}_frames"))
