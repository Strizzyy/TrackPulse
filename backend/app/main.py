import asyncio
import json
import os
import shutil
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load backend/.env (HF_TOKEN etc.) before anything reads os.environ.
load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from app.agents import crew as strategist_crew  # noqa: E402
from app.pipeline import frames as frames_module  # noqa: E402
from app.pipeline import history, strategy, vision, weather  # noqa: E402
from app.pipeline import trend as trend_module  # noqa: E402

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "..", "data", "uploads")
TRACK_PATH = os.path.join(BASE_DIR, "data", "silverstone.json")


@asynccontextmanager
async def lifespan(app: FastAPI):
    vision.load()  # warm the CLIP model once before serving requests
    yield


app = FastAPI(title="TrackPulse", lifespan=lifespan)

# Hackathon-permissive CORS: frontend runs on a different dev port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/media", StaticFiles(directory=UPLOAD_DIR), name="media")


def load_track() -> dict:
    with open(TRACK_PATH) as f:
        return json.load(f)


def nearest_reference_frames(projected_wetness, horizon_laps, frames, sample_laps=(1, 5, 10)):
    """We can't generate a real photo of a future lap -- nobody can. What
    we *can* do honestly: for a few laps ahead, find the real frame from
    THIS lap whose measured wetness score is closest to the projected
    score, and show that as "here's roughly what this would look like",
    clearly labeled as a reference, not a real photo of that future lap."""
    references = []
    for lap in sample_laps:
        if lap not in horizon_laps:
            continue
        target = projected_wetness[horizon_laps.index(lap)]
        closest = min(frames, key=lambda f: abs(f["wetness_score"] - target))
        references.append(
            {
                "lap": lap,
                "projected_wetness": target,
                "reference_image_url": closest["image_url"],
                "reference_label": closest["label"],
                "note": "closest real frame from this lap, not a real photo of a future lap",
            }
        )
    return references


@app.get("/api/track/silverstone")
def get_track():
    return load_track()


@app.post("/api/analyze")
async def analyze(video: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    video_path = os.path.join(session_dir, "lap.mp4")
    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    frame_dir = os.path.join(session_dir, "frames")
    extracted = frames_module.extract_frames(video_path, frame_dir)

    track = load_track()
    lap_duration = extracted[-1]["timestamp_sec"] if len(extracted) > 1 else track["avg_lap_time_sec"]

    # analyze_frames() gets both signals (wetness + is-this-actually-track-
    # footage) in one CLIP pass per frame. Real YouTube clips often have
    # title cards / sponsor bumpers spliced in -- those get dropped here
    # instead of being scored as if they were track conditions.
    analyses = vision.analyze_frames([f["path"] for f in extracted])

    enriched = []
    dropped_non_racing = 0
    for f, analysis in zip(extracted, analyses):
        if analysis["is_racing"] < vision.RACING_THRESHOLD:
            dropped_non_racing += 1
            continue
        corner = trend_module.map_corner(f["timestamp_sec"], lap_duration, track["corners"])
        enriched.append(
            {
                "frame_index": f["frame_index"],
                "timestamp_sec": f["timestamp_sec"],
                "corner": corner,
                "wetness_score": round(analysis["wetness"], 3),
                "image_url": f"/media/{session_id}/frames/{f['filename']}",
            }
        )

    if not enriched:
        raise HTTPException(422, "No racing footage detected in this video -- got title cards/graphics only")

    trend_stats = trend_module.compute_trend(enriched)
    for f in enriched:
        f["label"] = trend_module.label_for_score(f["wetness_score"], trend_stats["recent_slope"])

    corners_summary = trend_module.build_corner_summary(enriched)
    current = trend_module.current_condition_summary(enriched, trend_stats["recent_slope"])

    forecast_raw = await weather.get_precipitation_forecast(minutes_ahead=15)
    forecast = weather.project_condition(
        current["wetness_score"],
        trend_stats["recent_slope"],
        forecast_raw["precipitation_mm"],
        num_laps=10,
        avg_lap_time_sec=track["avg_lap_time_sec"],
    )

    forecast["reference_frames"] = nearest_reference_frames(
        forecast["projected_wetness"], forecast["horizon_laps"], enriched
    )

    sc_risk = history.get_sc_risk(trend_stats["recent_slope"], current["wetness_score"])
    recommendation = strategy.recommend(current["wetness_score"], trend_stats["direction"], trend_stats["recent_slope"])
    trend_summary = trend_module.trend_summary_text(trend_stats["direction"], corners_summary)

    # Chief Strategist: one LLM call over the already-computed signals above.
    # Runs in a thread since crew.kickoff() is blocking; falls back to the
    # deterministic rule-engine text (never mock/placeholder) if no HF_TOKEN
    # is configured or the call fails for any reason -- see app/agents/crew.py.
    agent_note = await asyncio.to_thread(
        strategist_crew.synthesize,
        {
            "current_label": current["label"],
            "current_score": current["wetness_score"],
            "trend_direction": trend_stats["direction"],
            "trend_summary": trend_summary,
            "rain_probability_pct": forecast["rain_probability_pct"],
            "projected_wetness": forecast["projected_wetness"],
            "sc_base_rate_pct": sc_risk["base_rate_pct"],
            "sc_risk_pct": sc_risk["risk_pct"],
            "rule_based_call": recommendation["tire_call"],
            "compound": recommendation["compound"],
            "urgency": recommendation["urgency"],
        },
    )

    return {
        "session_id": session_id,
        "current_condition": {
            "label": current["label"],
            "wetness_score": current["wetness_score"],
            "image_url": current["image_url"],
            "timestamp_sec": current["timestamp_sec"],
        },
        "frames": enriched,
        "dropped_non_racing_frames": dropped_non_racing,
        "corners": corners_summary,
        "trend": {
            "slope": round(trend_stats["slope"], 3),
            "direction": trend_stats["direction"],
            "summary": trend_summary,
        },
        "forecast": forecast,
        "safety_car_risk": sc_risk,
        "recommendation": recommendation,
        "strategist_note": agent_note or recommendation["tire_call"],
        "agent_synthesis_used": agent_note is not None,
    }
