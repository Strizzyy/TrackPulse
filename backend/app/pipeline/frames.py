import os
from typing import Dict, List

import cv2

MAX_FRAMES = 60
TARGET_FPS = 1.0


def extract_frames(video_path: str, output_dir: str) -> List[Dict]:
    """Slice a lap video into ~1fps frames, capped at MAX_FRAMES total."""
    os.makedirs(output_dir, exist_ok=True)
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / video_fps if video_fps else 0

    if duration_sec <= 0:
        frame_interval = max(int(video_fps), 1)
    else:
        wanted = max(min(int(duration_sec * TARGET_FPS), MAX_FRAMES), 1)
        frame_interval = max(total_frames // wanted, 1)

    frames: List[Dict] = []
    frame_idx = 0
    saved_idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_idx % frame_interval == 0:
            timestamp_sec = frame_idx / video_fps
            filename = f"frame_{saved_idx:04d}.jpg"
            path = os.path.join(output_dir, filename)
            cv2.imwrite(path, frame)
            frames.append(
                {
                    "frame_index": saved_idx,
                    "timestamp_sec": round(timestamp_sec, 2),
                    "path": path,
                    "filename": filename,
                }
            )
            saved_idx += 1
            if saved_idx >= MAX_FRAMES:
                break
        frame_idx += 1

    cap.release()
    if not frames:
        raise ValueError("No frames could be extracted from the video")
    return frames
