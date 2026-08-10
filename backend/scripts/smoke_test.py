"""Sanity check with no real footage needed: builds a tiny synthetic video
(fading grey -> blue, standing in for dry -> wet), runs it through the full
/api/analyze pipeline in-process, and prints the response shape.

Run: uv run python scripts/smoke_test.py
"""

import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


def make_synthetic_video(path: str, seconds: int = 8, fps: int = 10):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, fps, (320, 240))
    total = seconds * fps
    for i in range(total):
        t = i / total
        frame = np.full((240, 320, 3), int(150 - 40 * t), dtype=np.uint8)
        frame[:, :, 0] = np.clip(frame[:, :, 0].astype(int) + int(90 * t), 0, 255).astype(np.uint8)
        writer.write(frame)
    writer.release()


def main():
    tmp_path = os.path.join(os.path.dirname(__file__), "_smoke_test.mp4")
    make_synthetic_video(tmp_path)

    client = TestClient(app)
    with open(tmp_path, "rb") as f:
        resp = client.post("/api/analyze", files={"video": ("lap.mp4", f, "video/mp4")})

    print("status:", resp.status_code)
    if resp.status_code != 200:
        print(resp.text)
        os.remove(tmp_path)
        sys.exit(1)

    data = resp.json()
    print("frames:", len(data["frames"]))
    print("current_condition:", data["current_condition"])
    print("trend:", data["trend"])
    print("forecast rain_probability_pct:", data["forecast"]["rain_probability_pct"])
    print("safety_car_risk:", data["safety_car_risk"])
    print("recommendation:", data["recommendation"])
    print("strategist_note:", data["strategist_note"])
    print("agent_synthesis_used:", data["agent_synthesis_used"])

    track_resp = client.get("/api/track/silverstone")
    print("track endpoint status:", track_resp.status_code, "- corners:", len(track_resp.json()["corners"]))

    os.remove(tmp_path)
    print("\nOK -- pipeline runs end to end.")


if __name__ == "__main__":
    main()
