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

### Race Weekend Strategist layer (added 11 Aug 2026)

Alongside the single-lap flow above, TrackPulse now plans a full race across **five
circuits** (Silverstone, Monaco, Spa, Monza, Suzuka), chosen for strategic variety:

```
offline, once:  FastF1 2019-2025 race sessions
  -> real corner geometry (get_circuit_info, Distance in metres)
  -> tyre degradation per compound (panel regression, track-evolution controlled)
  -> pit loss, SC/VSC rate + first-deployment lap, rain frequency, race distance
  -> app/data/circuits/{id}.json          [scripts/build_circuit_data.py]

at request time (no FastF1 call, ever):
  circuit JSON + optional lap video
  -> CLIP wetness -> projected track state per race lap  [pipeline/session.py]
  -> lap-time model: base + fuel + degradation + conditions  [pipeline/race_sim.py]
  -> enumerate every 0-3 stop plan, rank by race time        [pipeline/optimizer.py]
  -> ranked strategies + track-position caveat               [POST /api/strategy/plan]
```

The vision pipeline stays load-bearing: measured wetness decides which compounds are
even considered (intermediates appear above 0.35) and shifts the recommended plan. At
Spa, the same circuit returns `M29 / H37` assuming dry and `H32 / H34` when real wet
footage is supplied.

**Multi-lap session mode** (`POST /api/analyze-session`) fixes a conceptual flaw in the
single-lap trend -- see "Trend over time" below.

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
      circuits.py          # loads app/data/circuits/*.json, cached; never calls FastF1
      session.py           # multi-lap segmentation + trend over TIME (not track position)
      fuel.py              # fuel load -> lap time; the one modelled strategy input
      race_sim.py          # per-lap time model + whole-race simulation
      optimizer.py         # enumerates 0-3 stop plans, ranks by simulated race time
    agents/
      crew.py              # Chief Strategist CrewAI agent (the one LLM call)
    data/
      silverstone.json     # legacy hand-made track metadata; still served by /api/track/silverstone
      sc_stats.json         # real FastF1-derived Silverstone SC/VSC stats (not a placeholder)
      circuits/*.json       # 5 circuits built from real FastF1 sessions -- the strategy inputs
  scripts/
    build_circuit_data.py   # ONE-TIME FastF1 pull -> app/data/circuits/*.json (slow; commit output)
    validate_replay.py      # scores the optimiser against real race results
    test_strategy.py        # sanity checks for fuel/race_sim/optimizer + circuit data
    test_weather_branches.py# forces all three weather branches with stubbed forecasts
    sweep_crop.py           # picks the vision crop band by dry/wet separation
    fetch_sc_stats.py       # superseded by build_circuit_data.py; kept for reference
    fetch_footage.py        # yt-dlp helper for sourcing reference clips
    calibrate_vision.py     # loads already-extracted frames, tests vision.py scoring against them
    smoke_test.py            # BROKEN, see "Known broken" below
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
  "safety_car_risk": {
    "risk_pct": 86.4, "base_rate_pct": 71.4, "sessions_analyzed": 7,
    "rationale": "Historical SC/VSC rate at silverstone is 71.4%. Track currently wet, ...",
    "expected_first_sc_lap": 14.6, "historical_first_sc_lap": 22.5, "sc_window_laps": [11, 18],
    "sc_timing_note": "First SC/VSC historically comes around lap 22 here (avg of 7 sessions). With wet track, expect it earlier -- most likely laps 11-18."
  },
  "recommendation": { "tire_call": "...", "compound": "intermediates", "urgency": "low", "pit_window_laps": [5, 8] },
  "strategist_note": "Hold on intermediates, conditions stable.",
  "agent_synthesis_used": true
}
```

### Race Weekend Strategist endpoints

```
GET  /api/circuits              -> [{ circuit_id, name, race_laps, avg_lap_time_sec,
                                      pit_loss_sec, sc_or_vsc_rate_pct,
                                      rain_frequency_pct, corner_count }, ...]
GET  /api/circuits/{id}         -> full circuit record incl. real corners + degradation
GET  /api/track/silverstone     -> UNCHANGED legacy endpoint, still used by the lap flow

POST /api/analyze-session       (multipart: video, circuit_id, lap_duration_sec?, simulated?)
  -> { lap_count, laps[{lap, avg_wetness, label, image_url, corners[]}],
       trend{slope_per_lap, direction, summary}, forecast, safety_car_risk,
       recommendation, simulated }

POST /api/strategy/plan         (multipart: circuit_id, video?, race_laps?)
  -> { conditions{source, current_wetness, direction, slope_per_lap},
       projected_wetness_by_lap,
       strategy{ recommended{plan, stints[], stops, total_time_display},
                 best_per_stop_count[], ranked[], candidates_evaluated,
                 wet_race, compounds_considered, track_position_caveat, note },
       circuit_inputs{...} }
```

`/api/analyze` is deliberately untouched by all of this -- it stays the
guaranteed-working demo path, and was verified byte-identical in behaviour afterwards
(`pov_wet_full.mp4` -> `wet 0.718`, 16 corners, 56 frames).

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

**Validated against real wet footage as of 10 Aug 2026.** Until then only the dry lap
had been measured, so "wet reads as wet" was an assumption. Four wet Silverstone clips
were sourced and scored against the dry reference lap, 20 evenly-spaced frames each:

| clip                                | expected | avg wetness | result       |
|-------------------------------------|----------|-------------|--------------|
| dry reference lap (F1 halo cam)     | dry      | 0.171       | PASS (<0.35) |
| driver-POV wet lap (SR3, overcast)  | wet      | 0.727       | PASS (>0.65) |
| wet trackside short                 | wet      | 0.766       | PASS         |
| wet trackside short (heavy spray)   | wet      | 0.744       | PASS         |
| wet trackside short, vertical 9:16  | wet      | 0.539       | FAIL         |
| damp track on slicks (10min, real)  | damp     | 0.609       | reads "drying", between dry and wet as intended |

Dry-vs-wet separation is real and large (~0.55) on landscape footage. The one failure
is a vertical 9:16 phone short, where the top-35% crop lands on grandstands rather than
track. Vertical video is out of scope -- don't demo with it.

The top-35% crop was also re-challenged on the driver-POV clip (where the top third is
sky, not tarmac) with `scripts/sweep_crop.py` across 8 candidate bands. It still won by
a wide margin and beat a sky-only band, so it is not merely reading cloud cover. The
full sweep table is in the comments in `vision.py`.

The mid-range now has real evidence too: a 10-minute damp-track-on-slicks clip reads
0.609 and is labelled "drying", sitting cleanly between the dry lap's 0.171 and the wet
lap's 0.727. So all three regimes are measured, not just the two extremes.

Repro: `scripts/fetch_footage.py <url> <name>` to download and slice, then
`uv run python scripts/calibrate_vision.py --dir reference_footage/<name>_frames --expect wet --limit 20`
and `uv run python scripts/sweep_crop.py --dry <dry_frames> --wet <wet_frames> --limit 12`.

## Trend over time: why single-lap slope was the wrong measurement

`trend.compute_trend()` fits wetness against timestamp **within one ~90s lap**. Inside a
single lap, time and track position are the same axis, so that slope measures "are the
last corners wetter than the first", not "is the track drying". Every real clip returned
`slope: -0.0`; only a synthetic ramp with a manufactured time axis produced one.

`pipeline/session.py` buckets frames into laps and compares **lap averages**, which is an
axis where time varies and position does not. On the same `damp_slicks.mp4` that the
single-lap path reads as flat, session mode measures a real decline:

```
L1 0.580  L2 0.666  L3 0.634  L4 0.593  L5 0.556  L6 0.569  L7 0.544   -0.014/lap, drying
```

Two unit bugs were fixed along the way, both from mixing per-second and per-lap rates:
- `project_condition()` applies its slope once per lap but was being handed a per-second
  slope, under-weighting the measured trend ~90x. That is why the forecast curve looked
  like it ignored the vision data.
- The obvious correction (scale `recent_slope` up by the lap length) is wrong too:
  `recent_slope` is fitted over a 15-second window of about five frames, so scaling it
  amplifies its noise as much as its signal and produced a fictitious +0.26/lap trend.
  The whole-lap fit is used instead.

## Trend validation and the rule-engine fix (10 Aug 2026)

Every real clip so far scores a roughly flat slope, so `trend.py`'s slope maths, the
forecast blend, and the urgency branches in `strategy.py` had never actually run on a
changing signal. No downloadable real drying lap was found (the obvious candidate, an
ELMS dry-to-wet clip, is DRM protected and was not pursued further).

Instead `reference_footage/synthetic_drying.mp4` was built from real frames -- wet POV
frames, then a mixed section, then dry-reference frames -- giving a guaranteed falling
ramp. **This is a control, not evidence**: it does not show CLIP handles a genuinely
drying surface, because true intermediate states are absent and the camera angle changes
mid-clip. What it does is exercise the downstream code, which had never been exercised.

It worked (slope -0.026, direction "drying", corners grading 0.82 wet -> 0.11 dry) and it
surfaced a real bug: the final branch of `strategy.recommend()` ignored `direction`
entirely, so a drying track returned "Track is dry, no tire change needed" -- and, worse,
so did a *dry track with rain arriving*. `strategy.py` now consults direction inside all
three score bands; the dangerous silent case (dry + wetting) returns a high-urgency
"rain arriving, be ready to box".

## What's real vs. not built

**Fully real, verified against real footage, no mock data:**
- CLIP vision scoring (calibrated as above)
- Weather forecast (live Open-Meteo call)
- Safety-car historical stats (real FastF1 pull for Silverstone: 7 sessions analyzed,
  71.4% SC/VSC rate, avg first-deployment lap 22.5 -- `scripts/fetch_sc_stats.py`,
  re-runnable, needs internet)
- Safety-car *timing* prediction: `avg_first_deployment_lap` was already in
  `sc_stats.json` and read by nothing. `history.py` now projects a first-deployment lap
  and window from it, pulled earlier by stated multipliers when the track is wet/damp or
  worsening (e.g. wet -> lap 14.6, window 11-18, vs. the dry historical lap 22.5). The
  multipliers are declared constants, not a fitted model, so they can be argued with.
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

**Race strategy layer -- what is measured vs. modelled.** This distinction matters and
is surfaced in the API response, not just here:

| input | status |
|---|---|
| Corner geometry (all 5 circuits) | **real** -- FastF1 `get_circuit_info`, corner Distance in metres. Counts check out: Monaco 19, Monza 11, Suzuka 18, Silverstone 18 |
| Pit loss | **real** -- 20.5s Monaco to 25.8s Monza, from in/out laps vs each driver's own green-lap median, safety-car stops excluded |
| SC/VSC rate + first-deployment lap | **real** -- per circuit, 7 seasons |
| Rain frequency | **real** -- `session.weather_data`, 0% at Monza to 42.9% at Silverstone |
| Race distance, base lap time | **real** |
| Tyre degradation | **measured but NOT trusted** -- see below |
| Fuel effect | **modelled** -- declared constants in `pipeline/fuel.py` |
| Race time / optimal strategy | **modelled** -- transparent arithmetic in `race_sim.py` |

**Degradation is the honest failure here.** Three methods were tried: per-stint
regression, a panel regression controlling for track evolution with driver fixed
effects, and the same restricted to a matched tyre-age window. All three produce
non-monotonic results at all five circuits (a harder tyre appearing to wear faster than
a softer one), because real stint data conflates wear with track evolution, traffic, and
teams choosing compounds *because* of the stint they plan to run. Rather than quietly
bending real measurements towards an assumption, `build_circuit_data.py` flags the
circuit `degradation_confidence: "low"` and `race_sim.py` falls back to reference
degradation. The measured numbers stay in the JSON and in the API response so the
disagreement is visible. **Do not claim measured per-circuit degradation is driving the
simulation -- it currently is not.**

**Validation against real races** (`scripts/validate_replay.py`) -- the optimiser scored
against what winning teams actually did in 2023, excluding races it does not model
(wet races, red flags):

| circuit | predicted | actual (winner) | stops | compounds | race-time error |
|---|---|---|---|---|---|
| Monza | M23 / H28 | M20 / H31 | match | match | +2.3% |
| Silverstone | M23 / H29 | M33 / S19 | match | differ | -2.7% |
| Spa | M29 / H37 | M26 / H26 / S14 | 1 vs 2 | differ | +7.0% |
| Suzuka | H29 / M24 | M16 / M21 / H16 | 1 vs 3 | match | -6.3% |

Stop count correct 2/4, compound set correct 2/4, **mean race-time error 4.6%**. Monaco
2023 excluded (wet). That is a genuine, unflattering result and the right one to quote:
the simulator is close on race time and roughly half-right on stop strategy.

**Known broken:**
- `scripts/smoke_test.py` no longer passes. It feeds the pipeline synthetic solid-colour
  frames, which the non-racing filter added later correctly rejects with a 422. The
  "sanity check with no real footage needed" hasn't worked since that filter landed.
  Either give it real frames or have it bypass the filter. Use a real clip meanwhile.

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

Current state: **wet validation is done** (10 Aug 2026) -- see the table under "Vision
calibration" above. Five reference clips (one dry, four wet) live in
`backend/reference_footage/`, gitignored, re-downloadable with `scripts/fetch_footage.py`.
Both directions of the classifier are now measured rather than assumed.

Tooling added for that work, reusable for any future clip:
- `scripts/calibrate_vision.py --dir <folder> --expect dry|wet --limit N` -- scores any
  frame folder through the real `vision.py` code path and prints avg/min/max plus an
  explicit PASS/FAIL against the 0.35 / 0.65 thresholds. Still accepts a bare
  `<session_id>` for frames under `backend/data/uploads/`.
- `scripts/sweep_crop.py --dry <folder> --wet <folder>` -- scores a known-dry and a
  known-wet folder under 8 candidate crop bands and reports which band *separates* them
  best. Separation is the metric that matters: a band that reads everything as dry looks
  great on dry footage and is worthless.
- `scripts/fetch_footage.py --slice <name>` skips the download for a clip you already have.

Highest-value next things, roughly in order:
1. **Refine `silverstone.json`'s corner `start_pct`/`end_pct` values** using real
   sector-time data if findable -- current values are rough visual estimates, flagged
   as such in the file's own `note` field. The backend reads this file generically, so
   no code changes are needed when better numbers land. This is now the top data task.
2. **Pick and rehearse the demo clip.** The driver-POV wet lap is the strongest
   candidate: it is a genuine full lap (so timestamp -> corner mapping is meaningful)
   and it reads 0.727 wet against the dry lap's 0.171. The three wet shorts are useful
   as calibration frames but are *not* full laps, so corner mapping on them is
   meaningless -- do not upload them in the demo.
3. Optional: a wet clip filmed from an F1 halo cam (same geometry as the dry reference)
   would be the cleanest possible A/B, since the current wet/dry pair differs in camera
   angle as well as conditions. Nice-to-have, not a blocker.

## Running the whole thing locally

See `README.md` for the two-command quickstart. In short: `uv sync` + `uvicorn` for the
backend (port 8000), `npm install` + `npm run dev` for the frontend (port 5173, expects
the backend at `localhost:8000` by default). The backend works fully without an
`HF_TOKEN` (rule-based fallback everywhere the LLM would otherwise be used); add one to
`backend/.env` to activate the real CrewAI agent step.
