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

Scope decisions already made: Python backend + TypeScript frontend, footage sourced from
real YouTube F1 clips (not a 40k-image trained classifier -- there's no such dataset and
collecting one wasn't feasible; see "Vision calibration" below for what we actually did
instead). Originally Silverstone-only with no track picker -- that scope decision was
superseded on 11 Aug 2026: all 5 circuits (Silverstone, Monaco, Spa, Monza, Suzuka) are
now selectable up front, before choosing single-lap/multi-lap/strategy mode, across all
three modes (see "For the frontend teammate" below).

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
  -> real racing-line outline (fastest-lap X/Y position telemetry, 240 pts)   [added 15 Aug]
  -> per-corner apex speed / gear / slow-medium-fast class                    [added 15 Aug]
  -> per-corner tyre-load model (braking + traction + lateral, wear_share)     [added 15 Aug]
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
Suzuka, a track projected 0.6 wetness drying to 0 by lap 22 returns `I5 / M23 / M25`
(intermediate opening, box lap 5) where a dry assumption returns `H29 / M24`.

**Wet-strategy calibration (15 Aug 2026).** The first version of the wet model
recommended slicks (`M23 / H30`) on that same 0.6-wetness grid -- a real-world DNF --
because a linear, shallow slicks-on-wet penalty let pure lap-time arithmetic trade a
crash risk for a saved pit stop. `race_sim.py` now uses a **convex** slick mismatch
(onset 0.2, exponent 1.5, 40s at fully wet) calibrated so the slick/inter crossover
lands at ~0.48 wetness = ~112% of dry pace (Pirelli's published crossover guidance),
per-compound wet-rubber-on-dry penalties, and an inter aquaplaning term above 0.65
(inters clear ~30 L/s vs full wets ~85 L/s), so full wets actually win above ~0.78.
`optimizer.py` adds `MIN_WET_STINT_LAPS = 3` (wet-rubber stints may be short, e.g. a
3-lap inter opening) and a hard **grip-cliff feasibility rule**: any plan running slicks
on a lap wetter than 0.55 is discarded as infeasible, not merely slow -- the simulator
prices seconds; the strategist is avoiding the crash. Dry-race output is unchanged.

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
                            #   --telemetry-only: fast re-patch of outline/apex/wear fields onto existing JSON
                            #   --circuit <id>:   one circuit only
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
  Dockerfile / .dockerignore # container build (bakes CLIP weights in); usable on any Docker host

deploy/
  README.md                  # the production runbook: EC2 + nginx + Let's Encrypt + S3 + CloudFront
  nginx-trackpulse.conf       # EC2 reverse proxy: 300M uploads, 300s CLIP timeouts
  bootstrap.sh                 # EC2 first-boot setup (swap, Docker, nginx, certbot)
  pause.sh / resume.sh          # stop the instance + release its IP for $0 downtime; bring it back
  iam-policy-trackpulse-dev.json # least-privilege policy for the deploy IAM user
  cloudfront-distribution-config.json, s3-bucket-policy.json  # frontend CDN config

pptscript.md                # presentation / pitch script (uniqueness, architecture, algorithms, vision)

frontend/
  src/
    types.ts               # TypeScript mirror of the backend response shape -- SOURCE OF TRUTH for the contract
    api.ts                  # fetch wrappers: analyzeLap(), analyzeSession(), planStrategy(), getCircuit(Detail)s()
    App.tsx                  # circuit SELECTION SCREEN first (circuitId null) -> mode -> load footage; auth gate; history
    history.ts               # localStorage run history (per account/guest), capped at 20 entries
    trackShapes.ts            # outlineToPath() fits real track_outline into a viewBox; hand-drawn paths are FALLBACK only
    cornerNames.ts            # curated official corner names per circuit keyed by FastF1 corner number ("Turn 9 -- Copse")
    labelColors.ts            # dry/damp/drying/wet -> color mapping (Apex Control palette)
    auth/
      AuthContext.tsx          # localStorage-only signup/login/guest -- NOT a secure backend auth system
    pages/
      AuthScreen.tsx            # login/signup/continue-as-guest screen, shown before the app if not authed
    components/
      shell/
        TopNav.tsx               # brand + selected circuit + "Change" (back to selection) + account
        SideNav.tsx               # mode nav (single/multi/strategy) + history + reset (reset -> selection screen)
        Footer.tsx                 # real backend-reachability + CrewAI-agent-active status
      CircuitSelect.tsx         # LANDING SCREEN: five circuit cards with real racing-line mini-maps + stats
      CircuitIntel.tsx          # tactical map, stats row, SC windows, Corner Character, Honest Degradation
      TrackMap.tsx                # REAL racing-line SVG (track_outline) w/ zoom (wheel/buttons 1-6x) + drag pan,
                                  #   corner markers at real start_pct, hover/click-to-pin telemetry callout card
                                  #   (apex speed, gear, class, distance), direction arrow + start/finish tick.
                                  #   Falls back to trackShapes.ts schematic + "Schematic layout" badge if no outline.
      CornerDegradation.tsx       # turn-by-turn tyre-stress small multiples per compound (Recharts) -- strategy mode
      SingleLapView.tsx          # single-lap report; corner rows are clickable -> "Frame under analysis" panel
      MultiLapView.tsx            # multi-lap session (lap strip, corner-analytics table, wetness/lap chart)
      LapStrip.tsx                  # horizontal strip of real per-lap frame thumbnails
      CornerAnalyticsTable.tsx      # corner x lap wetness pivot, "est. dry lap" derived from the real trend slope
      StrategyBoard.tsx           # selectable plan table, local accept/override, "vs optimal" bar
      HistoryView.tsx             # past runs (this browser only), click to reopen
      TrendChart.tsx               # Recharts: measured wetness + forecast projection
      CornerStrip.tsx               # per-corner real frame image + label
      RecommendationPanel.tsx       # tire call, SC risk, radio call (agent vs. fallback badge)
      Panel.tsx                      # shared glass/tactical-border panel primitive
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

`POST /api/analyze` (multipart, field name `video`, optional `circuit_id` form field
defaulting to `"silverstone"`) -> full strategist report. `circuit_id="silverstone"` (the
default) is pinned byte-identical to the original Silverstone-only behaviour; any other
circuit ID uses that circuit's real FastF1 corner geometry, lap time and coordinates
instead of the hand-made `silverstone.json` -- see `circuits.py` / `main.py`'s `analyze()`:
```json
{
  "session_id": "uuid",
  "circuit_id": "silverstone",
  "circuit_name": "Silverstone Circuit (GP Layout)",
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
                                      rain_frequency_pct, corner_count,
                                      track_outline }, ...]           (outline added 15 Aug, for the picker mini-maps)
GET  /api/circuits/{id}         -> full circuit record incl. real corners + degradation, plus (15 Aug):
                                      track_outline: [[x,y] x 240] unit-box racing line, uniform by lap distance
                                      track_outline_source, corner_wear_note
                                      corners[]: + apex_speed_kmh, apex_gear, speed_class (slow|medium|fast),
                                                 wear_share (sums to 1 across the lap),
                                                 load_brake_pct / load_traction_pct / load_lateral_pct
GET  /api/track/silverstone     -> UNCHANGED legacy endpoint. As of the 11 Aug UI revamp
                                    the frontend no longer calls this directly (App.tsx
                                    dropped getTrack() in favour of the circuit picker /
                                    GET /api/circuits) -- api.ts still exports it, but it's
                                    dead code on the frontend side. Backend behaviour and
                                    /api/analyze's own use of silverstone.json (when
                                    circuit_id="silverstone") are unaffected either way.

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

`/api/analyze` was deliberately untouched by the Race Weekend Strategist work above -- it
stayed the guaranteed-working demo path, and was verified byte-identical in behaviour
afterwards (`pov_wet_full.mp4` -> `wet 0.718`, 16 corners, 56 frames). It WAS extended on
11 Aug 2026 to accept the optional `circuit_id` described earlier in this section --
the `circuit_id="silverstone"` default path is pinned byte-identical to that verification
(re-confirmed live: default call vs. explicit `circuit_id=silverstone` differ only in the
CrewAI agent's own run-to-run phrasing, every deterministic field identical), so the
"guaranteed-working demo path" claim still holds for the default case.

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

### Partial-lap trend contamination (fixed 11 Aug 2026)

A real bug, found verifying session mode against real footage rather than by
inspection: any uploaded clip whose length isn't an exact multiple of `lap_duration_sec`
produces a trailing lap with only 1-2 frames at ~1fps, vs. ~90 for a full lap.
`compute_session_trend()` was weighting that sparse lap the same as every full lap in
its linear fit. Measured live: a flat, real 0.27 (dry) lap followed by a 2-frame noise
tail read as a fabricated **"+0.52/lap wetting"** trend -- which then produced a wrong
tire call, a wrong safety-car risk, and (via `/api/strategy/plan`) a wrong wet-race
strategy recommending intermediates on what was actually a dry track.

`pipeline/session.py`'s `usable_laps()` now excludes any lap with fewer than
`max(5, 0.4 * median_frame_count)` frames from the trend fit and from seeding "current
conditions" -- both `analyze_session` and `strategy_plan` in `main.py` use the filtered
list. The excluded lap is still returned in the `laps` array (flagged `"complete":
false`) so the UI shows it, faded, rather than silently dropping data.

### Weather forecast was Silverstone-only regardless of circuit (fixed 11 Aug 2026)

`weather.get_precipitation_forecast()` had `SILVERSTONE_LAT`/`LON` hardcoded with no
parameters -- selecting Monaco or Suzuka in Multi-lap Session mode still silently pulled
Silverstone's rain forecast. Now takes `lat`/`lon` params (default unchanged, so
`/api/analyze`'s Silverstone-only default path is unaffected); `main.py` passes the
selected circuit's real coordinates for `/api/analyze-session`.

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
- **Human-in-the-loop accept/override controls -- partially addressed.** As of
  11 Aug 2026, `StrategyBoard.tsx` has selectable plan rows and an Accept/Manual-Override
  pair, but it's **local UI state only, not persisted anywhere** (no backend endpoint
  records the decision). If a durable decision log is needed, that part is still unbuilt.
  The single-lap and multi-lap recommendation panels are still display-only.
- **Pre-race setup/wing recommendation.** Was flagged as first-to-cut under time
  pressure in the original plan; time went to fixing vision accuracy instead.
- ~~Real 2D track geometry~~ -- **BUILT 15 Aug 2026.** `build_circuit_data.py` now pulls
  the fastest lap's X/Y position telemetry, rotates it to FastF1's official map angle,
  resamples 240 points uniformly by lap distance and stores it as `track_outline`.
  `TrackMap.tsx` draws that real racing line (badge: "Racing line · FastF1 telemetry");
  the hand-drawn `trackShapes.ts` paths survive only as a fallback for circuit JSON
  built before this. Caveat: it is one fast lap's *racing line*, not the track edges --
  it clips apexes slightly, which is how most F1 track maps are drawn anyway.
- Corner/sector percentages in `silverstone.json` are **rough estimates**, not
  surveyed sector-time data -- see the `note` field in that file. The other 4 circuits'
  corner data in `app/data/circuits/*.json` IS real (FastF1 `get_circuit_info()`).
- **No real backend user/account system.** Login/signup (`auth/AuthContext.tsx`) is a
  real, working loop but stored only in the browser's localStorage -- not secure, doesn't
  sync across devices. Run history (`history.ts`) is similarly local-only. This was a
  deliberate scope call (frontend-only shell) for the 11 Aug UI revamp, not an oversight.

**Race strategy layer -- what is measured vs. modelled.** This distinction matters and
is surfaced in the API response, not just here:

| input | status |
|---|---|
| Corner geometry (all 5 circuits) | **real** -- FastF1 `get_circuit_info`, corner Distance in metres. Counts check out: Monaco 19, Monza 11, Suzuka 18, Silverstone 18, Spa 19 |
| Racing-line outline, per-corner apex speed / gear | **real** -- fastest-lap X/Y + speed telemetry, 2025 race (15 Aug) |
| Per-corner wear distribution (`wear_share`) | **modelled** -- frictional-work-per-unit-mass model over real telemetry (braking `v·dv/ds` + traction + lateral `v²κ`); distributes real per-lap degradation across corners, never invents a total. Labelled via `corner_wear_note` (15 Aug) |
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

**Spa was Barcelona until 15 Aug 2026.** `build_circuit_data.py` passed the event
name `"Spa"` to FastF1, whose fuzzy event lookup silently corrected it to the
**Spanish** Grand Prix -- so every Spa signal (4.6km lap, 14 corners, SC rate, pit
loss, degradation, rain frequency, and the map) was Circuit de Barcelona-Catalunya.
Caught only when corner numbering was checked against real Spa naming. Fixed: the
`CIRCUITS` table now uses full official GP names (`"Belgian Grand Prix"` etc.), the
build log prints `event resolved: <EventName> / <Location>` as a loud sanity check,
and `spa.json` was fully rebuilt from seven seasons of real Belgian GP data (6.94km,
19 corners, La Source 77 km/h into Eau Rouge/Raidillon flat at 300+). **If you add
a circuit, use its full GP name and check the `event resolved` line.**

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

Current state (rebuilt 11 Aug 2026): React + Vite + TypeScript + Tailwind v4 + Recharts,
on a real design system -- **"Apex Control Evolved"**: obsidian (`#050506`) base, glass
panels (`backdrop-filter: blur`), tactical corner-bracket borders, Racing Cyan / Neon
Red-Pink / Gold accent palette, Anybody + JetBrains Mono + Hanken Grotesk typefaces,
Material Symbols icons. Tokens live in `frontend/src/index.css` as a Tailwind v4
`@theme` block. Sourced from three Google Stitch design exports the user supplied
(`stitch_trackpulse_ai_race_strategist (1)/(2)/(3)/`, kept in the repo root for
provenance) -- their example data was fake (a fabricated "Car 16" scenario, an invented
Monaco SC-window screenshot) and was treated as style reference only; every number the
app actually shows still comes from the real backend contract above.

**Flow (revised 15 Aug 2026)**: the app lands on a **circuit selection screen**
(`CircuitSelect.tsx` -- five cards, each drawing its real racing-line mini-map from
`track_outline` plus real stats; `circuitId` is `null` until one is picked) → Circuit
Intel appears (zoomable real track map with pinnable corner telemetry callouts, stats
row, SC windows, Corner Character, Honest Degradation) → then the side-nav modes
single-lap/multi-lap/strategy → load footage. The top bar shows the selected circuit
with a **Change** button back to selection; **Reset session** also returns to selection.
Auth (`auth/AuthContext.tsx`) gates the whole app: login/signup/guest, **local-only**
(see "Explicitly not built" above) -- not a security feature, just enough to namespace
the local run history (`history.ts`, `HistoryView.tsx`) per identity.

**UI conventions worth keeping (15 Aug text-cleanup pass):** every number appears once
(the duplicate Honest Degradation panel in StrategyBoard and the Pit-lane-metrics panel
in Circuit Intel were removed); methodology/honesty explanations live in `title` hover
tooltips on the relevant badge or panel header (`cursor-help`), not in paragraphs under
panels; headlines follow `Mode_Name / Circuit` in all three modes; tyre-compound
colors are the F1 sidewall set (`.compound-*` in `index.css`, validated CVD-safe on the
obsidian surface); slow/medium/fast corner classes share one color mapping between the
map callouts and the Corner Character panel.

Highest-value next things, roughly in order:
1. **Persisting the human-in-the-loop decision.** `StrategyBoard.tsx`'s
   accept/override is real interactive state but local-only -- no backend endpoint
   records it, and the single-lap/multi-lap recommendation panels are still
   display-only.
2. **Per-compound corner physics.** The turn-by-turn tyre-stress chart shares one wear
   *distribution* across compounds (scaled by each compound's s/lap). Softs suffering
   relatively more in traction zones etc. would need a thermal model -- deliberately not
   invented; the shape is honest as-is.
3. **A real backend account system**, if cross-device history/login actually matters --
   current auth is intentionally a local-only shell, not a step toward one.
4. **Visual QA on real devices.** The 15 Aug work was verified in a real browser on
   desktop; mobile (SideNav hidden, selection cards stacked, touch pan on the map) has
   only been reasoned about, not tapped.

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

## Deployment (AWS, live as of 15 Aug 2026)

**Live now:**
- Frontend: https://d2jwudtuujhq9x.cloudfront.net
- Backend API: https://3.109.18.197.sslip.io (docs at `/docs`)

Production runs on AWS under a dedicated `trackpulse-dev` IAM user, separate from the
account's other project. **Backend**: single EC2 `t3.micro` (free-tier eligible; a 2GB
swapfile covers CLIP's memory headroom instead of paying for a bigger instance) running
the backend in Docker, with **nginx terminating TLS and reverse-proxying** to it
(`proxy_read_timeout 300s` -- CLIP inference on a free-tier CPU is slow). The TLS cert is
Let's Encrypt for `<elastic-ip>.sslip.io` -- Let's Encrypt refuses to issue certificates
for `*.amazonaws.com`, so the instance's own AWS-assigned DNS name doesn't work for this;
`sslip.io` (free magic DNS: `<ip>.sslip.io` resolves to `<ip>`, no domain purchase needed)
is the workaround, auto-renewed via cron. **Frontend**: a private S3 bucket behind its own
CloudFront distribution (Origin Access Control, no public bucket access), built with
`VITE_API_BASE` pointed at the backend's HTTPS URL -- CORS is wide open
(`allow_origins=["*"]`) so this doesn't need to be same-origin.

Full click-by-click runbook, every command actually run, and every tradeoff: see
[`deploy/README.md`](./deploy/README.md).

**Cost discipline**: everything here fits free tier except the Elastic IP, which AWS
bills ~$0.005/hr regardless of instance state once an account is past its first 12
months -- the one real recurring cost. An AWS Budget alerts by email if spend exceeds
set thresholds. `deploy/pause.sh` stops the instance **and releases the Elastic IP**
(true $0 while paused -- the EBS volume with the built image is kept, so nothing needs
rebuilding); `deploy/resume.sh` starts it back up, allocates a fresh IP, reissues the
TLS cert for the new `sslip.io` hostname, and rebuilds + redeploys the frontend against
it. No time limit baked in -- pause for a day or three months, resume is the same script
either way, just a new backend URL each time.

`backend/Dockerfile` also exists (bakes the CLIP weights into the image) for any Docker
host; it was written for Hugging Face Spaces before HF made Docker Spaces PRO-only.
