import asyncio
import json
import os
import shutil
import uuid
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load backend/.env (HF_TOKEN etc.) before anything reads os.environ.
load_dotenv()

from typing import Optional  # noqa: E402

from fastapi import FastAPI, File, Form, HTTPException, UploadFile  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from app.agents import crew as strategist_crew  # noqa: E402
from app.pipeline import circuits, history, optimizer, strategy, vision, weather  # noqa: E402
from app.pipeline import frames as frames_module  # noqa: E402
from app.pipeline import session as session_module  # noqa: E402
from app.pipeline import trend as trend_module  # noqa: E402

BASE_DIR = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "..", "data", "uploads")
TRACK_PATH = os.path.join(BASE_DIR, "data", "silverstone.json")

# A multi-lap session needs more frames than a single lap. CLIP runs at roughly
# 1s/frame on CPU, so this caps analysis latency at ~2 minutes.
SESSION_MAX_FRAMES = 120


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
    """Original endpoint, unchanged. The frontend's existing lap flow depends
    on it, so it stays even though /api/circuits/silverstone supersedes it."""
    return load_track()


@app.get("/api/circuits")
def list_circuits():
    return {"circuits": circuits.available()}


@app.get("/api/circuits/{circuit_id}")
def get_circuit(circuit_id: str):
    circuit = circuits.load(circuit_id)
    if circuit is None:
        raise HTTPException(404, f"No built data for circuit '{circuit_id}'. Run scripts/build_circuit_data.py.")
    return circuit


def _score_video(session_id: str, video: UploadFile, corners: list, lap_duration_sec: float):
    """Shared vision pass: save upload -> extract frames -> CLIP score -> drop
    non-racing -> map to corners. Used by the session and strategy endpoints;
    /api/analyze keeps its own inlined copy so it cannot be broken from here."""
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    video_path = os.path.join(session_dir, "lap.mp4")
    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    frame_dir = os.path.join(session_dir, "frames")
    extracted = frames_module.extract_frames(video_path, frame_dir, max_frames=SESSION_MAX_FRAMES)
    analyses = vision.analyze_frames([f["path"] for f in extracted])

    enriched = []
    dropped = 0
    for f, analysis in zip(extracted, analyses):
        if analysis["is_racing"] < vision.RACING_THRESHOLD:
            dropped += 1
            continue
        enriched.append(
            {
                "frame_index": f["frame_index"],
                "timestamp_sec": f["timestamp_sec"],
                "corner": trend_module.map_corner(f["timestamp_sec"], lap_duration_sec, corners),
                "wetness_score": round(analysis["wetness"], 3),
                "image_url": f"/media/{session_id}/frames/{f['filename']}",
            }
        )

    if not enriched:
        raise HTTPException(422, "No racing footage detected in this video -- got title cards/graphics only")
    return enriched, dropped


@app.post("/api/analyze-session")
async def analyze_session(
    video: UploadFile = File(...),
    circuit_id: str = Form("silverstone"),
    lap_duration_sec: Optional[float] = Form(None),
    simulated: bool = Form(False),
):
    """Multi-lap analysis: a real trend over TIME rather than over track
    position. See app/pipeline/session.py for why the single-lap slope was
    measuring the wrong thing."""
    circuit = circuits.load(circuit_id)
    if circuit is None:
        raise HTTPException(404, f"No built data for circuit '{circuit_id}'")

    lap_duration = lap_duration_sec or circuit.get("avg_lap_time_sec") or 90.0
    session_id = str(uuid.uuid4())
    corner_defs = circuits.corners_for_mapping(circuit)

    enriched, dropped = _score_video(session_id, video, corner_defs, lap_duration)
    session_module.segment_laps(enriched, lap_duration)
    lap_summaries = session_module.build_lap_summaries(enriched)
    # Excludes sparse/partial laps (almost always the tail end of an upload
    # whose length isn't an exact multiple of lap_duration_sec) from the trend
    # fit and from standing in as "current conditions" -- see session.py.
    # `lap_summaries` itself keeps every lap, flagged, for the UI.
    usable = session_module.usable_laps(lap_summaries)
    current_lap = usable[-1]
    session_trend = session_module.compute_session_trend(usable)

    forecast_raw = await weather.get_precipitation_forecast(
        minutes_ahead=15, lat=circuit.get("lat", weather.SILVERSTONE_LAT), lon=circuit.get("lon", weather.SILVERSTONE_LON)
    )
    # Same rule as the single-lap path: decisions are taken on the NET slope
    # (measured trend + weather), never on the raw measured trend alone.
    weather_term = weather.weather_adjustment(
        forecast_raw["precipitation_mm"], forecast_raw.get("precipitation_probability_pct")
    )
    net_slope = session_trend["slope_per_lap"] + weather_term["adjustment"]
    direction = trend_module.direction_for_slope(net_slope)
    session_trend["net_slope_per_lap"] = round(net_slope, 4)
    # compute_session_trend()'s own `direction`/`summary` describe the measured
    # lap-over-lap trend and keep their own numbers alongside them; this is the
    # direction everything acts on.
    session_trend["measured_direction"] = session_trend["direction"]
    session_trend["direction"] = direction

    for f in enriched:
        f["label"] = trend_module.label_for_score(f["wetness_score"], net_slope)

    forecast = weather.project_condition(
        current_lap["avg_wetness"],
        # Already per-lap -- no conversion needed here, unlike the single-lap path.
        session_trend["slope_per_lap"],
        forecast_raw["precipitation_mm"],
        num_laps=10,
        avg_lap_time_sec=lap_duration,
        precipitation_probability_pct=forecast_raw.get("precipitation_probability_pct"),
    )

    sc_risk = history.get_sc_risk(net_slope, current_lap["avg_wetness"], circuit=circuit)
    recommendation = strategy.recommend(
        current_lap["avg_wetness"],
        direction,
        net_slope,
        projected_wetness=forecast["projected_wetness"],
        rain_probability_pct=forecast["rain_probability_pct"],
    )

    return {
        "session_id": session_id,
        "circuit_id": circuit_id,
        "circuit_name": circuit.get("name"),
        "simulated": simulated,
        "lap_duration_sec": lap_duration,
        "lap_count": len(lap_summaries),
        "laps": lap_summaries,
        "frames": enriched,
        "dropped_non_racing_frames": dropped,
        "trend": session_trend,
        "forecast": forecast,
        "safety_car_risk": sc_risk,
        "recommendation": recommendation,
    }


@app.post("/api/strategy/plan")
async def strategy_plan(
    circuit_id: str = Form(...),
    video: Optional[UploadFile] = File(None),
    lap_duration_sec: Optional[float] = Form(None),
    race_laps: Optional[int] = Form(None),
):
    """Full race strategy: enumerate pit plans, simulate each, rank by total
    race time. If a lap video is supplied, the CLIP wetness read seeds the
    projected track state so conditions actually move the recommendation --
    that is where the vision pipeline plugs into the strategy layer."""
    circuit = circuits.load(circuit_id)
    if circuit is None:
        raise HTTPException(404, f"No built data for circuit '{circuit_id}'")

    total_laps = race_laps or circuit.get("race_laps") or 52
    wetness_by_lap = None
    conditions = {"source": "assumed dry -- no lap video supplied", "current_wetness": 0.0}

    if video is not None:
        lap_duration = lap_duration_sec or circuit.get("avg_lap_time_sec") or 90.0
        session_id = str(uuid.uuid4())
        enriched, _ = _score_video(
            session_id, video, circuits.corners_for_mapping(circuit), lap_duration
        )
        session_module.segment_laps(enriched, lap_duration)
        lap_summaries = session_module.build_lap_summaries(enriched)
        # Same partial-lap exclusion as /api/analyze-session -- a sparse tail
        # lap otherwise becomes both the seed "current" wetness AND drags the
        # trend used to project the rest of the race, so it was the single
        # biggest source of a wrong strategy call.
        usable = session_module.usable_laps(lap_summaries)
        current_lap = usable[-1]
        session_trend = session_module.compute_session_trend(usable)
        # start_lap=1: the uploaded footage's lap numbering is its own, not the
        # race's. The measured condition is "now" = race lap 1, and the trend
        # continues from there. Defaulting to the video's last lap number left
        # the first several race laps pinned flat at the current value.
        wetness_by_lap = session_module.wetness_projection(
            usable, session_trend["slope_per_lap"], total_laps, start_lap=1
        )
        conditions = {
            "source": "measured from uploaded footage (CLIP)",
            "current_wetness": current_lap["avg_wetness"],
            "direction": session_trend["direction"],
            "slope_per_lap": session_trend["slope_per_lap"],
            "laps_analyzed": session_trend["laps_analyzed"],
            "session_id": session_id,
        }

    plan = optimizer.optimise(circuit, total_laps=total_laps, wetness_by_lap=wetness_by_lap)
    return {
        "circuit_id": circuit_id,
        "circuit_name": circuit.get("name"),
        "conditions": conditions,
        "projected_wetness_by_lap": wetness_by_lap,
        "strategy": plan,
        "safety_car_risk": history.get_sc_risk(
            (conditions.get("slope_per_lap") or 0.0),
            conditions.get("current_wetness") or 0.0,
            circuit=circuit,
        ),
        "circuit_inputs": {
            "avg_lap_time_sec": circuit.get("avg_lap_time_sec"),
            "pit_loss_sec": circuit.get("pit_loss_sec"),
            "degradation": circuit.get("degradation"),
            # Whether the measured degradation above is actually driving the
            # simulation. It usually is NOT -- real stint data comes out
            # non-monotonic across compounds, so race_sim falls back to
            # reference values. Shipping the numbers without this flag would
            # imply the simulation is running on measured data when it isn't.
            "degradation_confidence": circuit.get("degradation_confidence"),
            "degradation_note": circuit.get("degradation_note"),
            "degradation_in_use": (
                "reference"
                if circuit.get("degradation_confidence") == "low"
                else "measured"
            ),
            "sc_or_vsc_rate_pct": circuit.get("sc_or_vsc_rate_pct"),
            "source": circuit.get("source"),
        },
    }


@app.post("/api/analyze")
async def analyze(video: UploadFile = File(...), circuit_id: str = Form("silverstone")):
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    video_path = os.path.join(session_dir, "lap.mp4")
    with open(video_path, "wb") as f:
        shutil.copyfileobj(video.file, f)

    frame_dir = os.path.join(session_dir, "frames")
    extracted = frames_module.extract_frames(video_path, frame_dir)

    # circuit_id="silverstone" (the default, and the only option before the
    # 5-circuit picker existed) keeps using the original hand-made
    # silverstone.json exactly as before -- this endpoint's Silverstone
    # behaviour is pinned byte-identical (see CONTEXT.md). Any other circuit
    # uses the real FastF1-derived corner geometry from app/data/circuits/
    # instead, so the single-lap flow works for all 5, not just Silverstone.
    if circuit_id == "silverstone":
        track = load_track()
        corners = track["corners"]
        avg_lap_time_sec = track["avg_lap_time_sec"]
        history_circuit = None  # get_sc_risk() falls back to sc_stats.json
        lat, lon = weather.SILVERSTONE_LAT, weather.SILVERSTONE_LON
        circuit_name = track["name"]
    else:
        circuit = circuits.load(circuit_id)
        if circuit is None:
            raise HTTPException(404, f"No data for circuit '{circuit_id}'")
        corners = circuits.corners_for_mapping(circuit)
        avg_lap_time_sec = circuit.get("avg_lap_time_sec") or 90.0
        history_circuit = circuit
        lat = circuit.get("lat", weather.SILVERSTONE_LAT)
        lon = circuit.get("lon", weather.SILVERSTONE_LON)
        circuit_name = circuit.get("name")

    lap_duration = extracted[-1]["timestamp_sec"] if len(extracted) > 1 else avg_lap_time_sec

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
        corner = trend_module.map_corner(f["timestamp_sec"], lap_duration, corners)
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

    # ONE slope drives every panel below: the whole-lap fit, in wetness per lap,
    # plus the weather adjustment. Labels, current condition, the forecast curve,
    # SC risk and the tyre call previously split across different numbers -- first
    # two different fits of the measured trend, then the raw measured trend for the
    # decisions and the net for the forecast. Both splits produced calls that
    # contradicted the curve drawn directly above them.
    trend_stats = trend_module.compute_trend(enriched, avg_lap_time_sec)
    measured_slope = trend_stats["slope_per_lap"]

    forecast_raw = await weather.get_precipitation_forecast(minutes_ahead=15, lat=lat, lon=lon)
    weather_term = weather.weather_adjustment(
        forecast_raw["precipitation_mm"], forecast_raw.get("precipitation_probability_pct")
    )
    # Net = what the track is actually projected to do. This, not the raw
    # measured slope, is what everything downstream decides on.
    net_slope = measured_slope + weather_term["adjustment"]
    direction = trend_module.direction_for_slope(net_slope)

    for f in enriched:
        f["label"] = trend_module.label_for_score(f["wetness_score"], net_slope)

    corners_summary = trend_module.build_corner_summary(enriched)
    current = trend_module.current_condition_summary(enriched, net_slope)

    forecast = weather.project_condition(
        current["wetness_score"],
        measured_slope,
        forecast_raw["precipitation_mm"],
        num_laps=10,
        avg_lap_time_sec=avg_lap_time_sec,
        precipitation_probability_pct=forecast_raw.get("precipitation_probability_pct"),
    )

    forecast["reference_frames"] = nearest_reference_frames(
        forecast["projected_wetness"], forecast["horizon_laps"], enriched
    )

    sc_risk = history.get_sc_risk(net_slope, current["wetness_score"], circuit=history_circuit)
    recommendation = strategy.recommend(
        current["wetness_score"],
        direction,
        net_slope,
        projected_wetness=forecast["projected_wetness"],
        rain_probability_pct=forecast["rain_probability_pct"],
    )
    trend_summary = trend_module.trend_summary_text(direction, corners_summary)

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
            "sc_timing_note": sc_risk.get("sc_timing_note"),
            "rule_based_call": recommendation["tire_call"],
            "compound": recommendation["compound"],
            "urgency": recommendation["urgency"],
            "pit_window_laps": recommendation["pit_window_laps"],
        },
    )

    return {
        "session_id": session_id,
        "circuit_id": circuit_id,
        "circuit_name": circuit_name,
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
            # Per LAP, matching forecast.measured_slope. This used to be the
            # per-SECOND figure sitting beside a direction computed from a
            # different fit entirely, so the panel could show "drying" above a
            # positive number.
            "slope": round(measured_slope, 4),
            # Measured + weather, and the only direction shown anywhere: it is
            # what the tyre call, SC risk and forecast curve are all taken from.
            "net_slope": round(net_slope, 4),
            "direction": direction,
            "summary": trend_summary,
        },
        "forecast": forecast,
        "safety_car_risk": sc_risk,
        "recommendation": recommendation,
        "strategist_note": agent_note or recommendation["tire_call"],
        "agent_synthesis_used": agent_note is not None,
    }
