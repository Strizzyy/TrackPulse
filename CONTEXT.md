# TrackPulse -- Project Context

This file is the single source of truth for anyone joining this project cold
(teammate, or an AI assistant helping a teammate). Paste this whole file as
context before asking for help on this repo.

## What this is

**TrackPulse** is an AI pit-wall copilot built for the **Weather Whiplash** hackathon
problem statement: a live track-condition detector. The base requirement is: feed in
track photos/video frames, classify each as dry/damp/wet/drying (Hugging Face), show a
trend over time, and issue a tire-change call to action.

We expanded that into a compressed simulation of an F1 race strategist's job: upload a
1-lap video and get back not just a condition label, but a wetness trend, a
weather-driven forecast for the next several laps, a safety-car risk read grounded in
real historical F1 data, and a tire/pit-window recommendation -- synthesized by an LLM
agent (CrewAI) into a race-engineer-style radio call, with a human strategist meant to
stay in the loop rather than the AI deciding unilaterally.

Scope decisions already made: **Silverstone only** (no track picker), Python backend +
TypeScript frontend, footage sourced from real YouTube F1 clips (not a 40k-image trained
classifier -- there's no such dataset and collecting one wasn't feasible; see "Vision
calibration" below for what we actually did instead).

## Architecture

```
video upload (mp4)
  -> OpenCV frame extraction (~1fps, capped 60 frames)         [backend/app/pipeline/frames.py]
  -> CLIP zero-shot scoring, per frame: wetness + is-racing     [backend/app/pipeline/vision.py]
  -> drop non-racing frames (title cards/sponsor bumpers)
  -> corner mapping (timestamp -> corner, pure geometry)
     + trend (slope/direction) + per-corner summary             [backend/app/pipeline/trend.py]
  -> live weather forecast + lap projection (Open-Meteo)        [backend/app/pipeline/weather.py]
  -> historical Safety Car/VSC risk (FastF1-derived, cached)    [backend/app/pipeline/history.py]
  -> rule-based tire/pit-window recommendation                  [backend/app/pipeline/strategy.py]
  -> Chief Strategist LLM synthesis (CrewAI, one agent)         [backend/app/agents/crew.py]
  -> single JSON response                                       [backend/app/main.py]
     -> React frontend renders it                                [frontend/src/App.tsx]
```

Only the Chief Strategist step is a real CrewAI/LLM agent. Everything upstream (vision,
weather, history, rule engine) is plain deterministic Python -- deliberately, not an
oversight. Those steps don't benefit from LLM "reasoning" (there's nothing to decide,
just data to fetch/compute), and keeping them as plain functions keeps the pipeline fast
and reliable; the CrewAI layer wraps their combined output for the one step that
actually benefits from natural-language synthesis. If the LLM call fails or no
`HF_TOKEN` is configured, the response falls back to the deterministic rule-engine text
-- the request never crashes because of the agent step (`agent_synthesis_used: false`
in that case).

## Repo structure

```
backend/
  app/
    main.py              # FastAPI app, the /api/analyze endpoint, response assembly
    pipeline/
      frames.py           # video -> frames (OpenCV)
      vision.py           # CLIP scoring -- see "Vision calibration" below, read before touching
      trend.py             # corner mapping, trend calc, corner/current-condition summaries
      weather.py           # Open-Meteo forecast + lap projection
      history.py           # reads cached FastF1 stats, computes SC risk
      strategy.py          # tire/pit-window rule engine
    agents/
      crew.py              # Chief Strategist CrewAI agent (the one LLM call)
    data/
      silverstone.json     # track metadata: corners, sector-time proportions, avg lap time
      sc_stats.json         # real FastF1-derived Silverstone SC/VSC stats (not a placeholder)
  scripts/
    fetch_sc_stats.py       # one-time FastF1 pull -> sc_stats.json (needs internet, run manually)
    fetch_footage.py        # yt-dlp helper for sourcing reference clips
    calibrate_vision.py     # loads already-extracted frames, tests vision.py scoring against them
    smoke_test.py            # synthetic-video sanity check, no real footage needed
  .env.example              # copy to .env, add HF_TOKEN to activate the LLM agent
  pyproject.toml / uv.lock   # uv-managed, see Quickstart in README.md

frontend/
  src/
    types.ts               # TypeScript mirror of the backend response shape -- SOURCE OF TRUTH for the contract
    api.ts                  # fetch wrappers: getTrack(), analyzeLap()
    App.tsx                  # main flow: upload -> render results
    components/
      TrendChart.tsx          # Recharts: measured wetness + forecast projection
      CornerStrip.tsx          # per-corner real frame image + label
      RecommendationPanel.tsx  # tire call, SC risk, radio call (agent vs. fallback badge)
    labelColors.ts            # dry/damp/drying/wet -> color mapping
```

## API contract

Two endpoints. This is the exact current response shape (`backend/app/main.py`) --
if you change field names, update `frontend/src/types.ts` to match, that's the whole
contract.

`GET /api/track/silverstone` -> static track metadata:
```json
{
  "track_id": "silverstone",
  "name": "Silverstone Circuit (GP Layout)",
  "avg_lap_time_sec": 90.5,
  "lat": 52.0786, "lon": -1.0169,
  "corners": [ { "name": "Abbey", "start_pct": 0.0, "end_pct": 0.04 }, ... ]
}
```

`POST /api/analyze` (multipart, field name `video`) -> full strategist report:
```json
{
  "session_id": "uuid",
  "current_condition": { "label": "damp", "wetness_score": 0.45, "image_url": "/media/.../frame_0047.jpg", "timestamp_sec": 89.3 },
  "frames": [ { "frame_index", "timestamp_sec", "corner", "wetness_score", "label", "image_url" }, ... ],
  "dropped_non_racing_frames": 9,
  "corners": [ { "corner": "Abbey", "avg_wetness": 0.29, "label": "dry", "image_url": "/media/.../frame_0001.jpg" }, ... ],
  "trend": { "slope": 0.003, "direction": "stable", "summary": "Track is stable; 4 of 15 corners still damp or wet." },
  "forecast": {
    "horizon_laps": [1..10], "projected_wetness": [...], "rain_probability_pct": 0.0, "avg_lap_time_sec": 90.5,
    "reference_frames": [ { "lap": 1, "projected_wetness": 0.72, "reference_image_url": "...", "reference_label": "wet", "note": "closest real frame from this lap, not a real photo of a future lap" }, ... ]
  },
  "safety_car_risk": { "risk_pct": 71.4, "base_rate_pct": 71.4, "rationale": "Historical SC/VSC rate at silverstone is 71.4%." },
  "recommendation": { "tire_call": "...", "compound": "intermediates", "urgency": "low", "pit_window_laps": [5, 8] },
  "strategist_note": "Hold on intermediates, conditions stable.",
  "agent_synthesis_used": true
}
```

Frame images are served as static files under `/media/{session_id}/frames/{filename}` --
always fetch them relative to the backend origin (`mediaUrl()` in `frontend/src/api.ts`
already does this).

## Vision calibration (read before touching `vision.py`)

This mattered enough to be worth its own section because the naive version was
actively wrong, and it was only caught by testing against a real video.

A real onboard F1 frame is ~80% car/halo/driver and ~20% visible track, under flat
light that makes dry asphalt look dark. Scoring the **full frame** against generic
"dry racetrack" / "wet racetrack" prompts read a **known-100%-dry** real lap as ~0.53
average wetness (worse than a coin flip) -- CLIP was matching against the car's dark,
glossy bodywork, not the road.

Fix, measured against that same known-dry video (`scripts/calibrate_vision.py`):
- **Crop to the top 35% of the frame** before scoring (where the track actually is on
  an onboard shot) -- dropped the average to ~0.29.
- **Prompt wording matters a lot.** Prompts describing the *whole onboard scene*
  ("an onboard camera view from inside a Formula 1 car, driving on a dry/wet
  track...") outperformed generic "dry/wet asphalt tarmac" prompts, which scored
  *worse than random* even cropped (0.66 avg on known-dry frames) and were dropped
  entirely rather than kept at a lower ensemble weight.
- Real clips have non-track frames spliced in (title cards, sponsor bumpers). A
  separate CLIP check (`is_racing_frame` / `analyze_frame`'s `is_racing` signal)
  filters these out before they pollute the trend -- verified against a real clip that
  had a Pirelli sponsor card mid-video.
- **"Current condition" is a smoothed average of the last 5 frames**, not the literal
  last frame -- a single frame is noisy enough that using just one produced a "current
  condition" banner that visibly contradicted the corner-by-corner breakdown.

Current calibration is based on **one** real reference video (a dry Silverstone
qualifying-style onboard lap). It is not validated against real wet footage yet --
that's the single highest-value thing the data teammate can do (see below).

## What's real vs. not built

**Fully real, verified against real footage, no mock data:**
- CLIP vision scoring (calibrated as above)
- Weather forecast (live Open-Meteo call)
- Safety-car historical stats (real FastF1 pull for Silverstone: 7 sessions analyzed,
  71.4% SC/VSC rate, avg first-deployment lap 22.5 -- `scripts/fetch_sc_stats.py`,
  re-runnable, needs internet)
- CrewAI Chief Strategist LLM agent (Hugging Face Inference Providers; needs `HF_TOKEN`
  in `backend/.env` with "Make calls to Inference Providers" permission enabled on the
  token, or it gracefully falls back to rule-based text)

**Explicitly not built (known gaps, not bugs):**
- **Human-in-the-loop accept/override controls.** The recommendation panel is
  currently display-only. This was planned scope and is the single biggest thing
  missing from the original "human stays in the loop" pitch. Frontend work.
- **Pre-race setup/wing recommendation.** Was flagged as first-to-cut under time
  pressure in the original plan; time went to fixing vision accuracy instead.
- **Multi-track support.** Silverstone only, by deliberate scope choice.
- Corner/sector percentages in `silverstone.json` are **rough estimates**, not
  surveyed sector-time data -- see the `note` field in that file.

## For the frontend teammate

Current state: React + Vite + TypeScript + Tailwind + Recharts. Functional, wired to
the real backend contract above, no mock data -- but intentionally basic UI/UX (that
was always meant to be your area to build out).

What exists: upload flow, current-condition card (with real frame image), trend chart
with forecast overlay, per-corner strip (each with its real frame image), a
"predicted condition" section (closest real frame per forecast lap, clearly labeled as
a reference, not a generated future photo), and a recommendation panel that shows
whether the LLM agent or the rule-based fallback produced the radio call.

Highest-value next things, roughly in order:
1. **Human-in-the-loop controls** -- accept/override buttons on the recommendation
   card, a confirmed-decision log. This is the biggest gap vs. the original pitch.
2. Visual polish generally -- current styling is functional, not designed.
3. A real (if stylized) Silverstone track map instead of the corner strip, using
   `silverstone.json`'s corner list.

Run it: `cd frontend && npm install && npm run dev`. `src/types.ts` is the contract --
if the backend response shape ever changes, that file (and only that file) needs
updating to match.

## For the data teammate

Current state: one real reference video has been used to calibrate and validate the
vision pipeline (a dry Silverstone onboard lap) -- see "Vision calibration" above.
That's real but thin: it validates "dry reads as dry" but nothing has validated "wet
reads as wet" yet.

Highest-value next things, roughly in order:
1. **Source a real wet-session clip** (search terms like "Silverstone wet race
   onboard," "Silverstone rain FP onboard lap") and run it through
   `scripts/calibrate_vision.py` (point it at a session's frame folder under
   `backend/data/uploads/{session_id}/frames/`, or extract frames from a new clip
   first) to check whether genuinely wet frames actually score high. If they don't,
   the prompts/crop in `vision.py` need another calibration pass the same way the dry
   case was: measure, don't guess.
2. **Refine `silverstone.json`'s corner `start_pct`/`end_pct` values** using real
   sector-time data if findable -- current values are rough visual estimates, flagged
   as such in the file's own `note` field. The backend reads this file generically, so
   no code changes are needed when better numbers land.
3. `scripts/fetch_footage.py` is a small yt-dlp + frame-slicing helper already written
   for this (needs `pip install yt-dlp` separately, not part of the backend's deps).

## Running the whole thing locally

See `README.md` for the two-command quickstart. In short: `uv sync` + `uvicorn` for the
backend (port 8000), `npm install` + `npm run dev` for the frontend (port 5173, expects
the backend at `localhost:8000` by default). The backend works fully without an
`HF_TOKEN` (rule-based fallback everywhere the LLM would otherwise be used); add one to
`backend/.env` to activate the real CrewAI agent step.
