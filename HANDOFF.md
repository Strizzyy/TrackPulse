# TrackPulse — Handoff Context (10–11 Aug 2026)

Paste this whole file as context before continuing work on this repo. It covers
everything changed in these sessions, why, and what is still open. `CONTEXT.md` remains
the project's overall source of truth; this file is the delta on top of commit `ba50a6b`.

**Nothing in here is committed yet.** All changes are in the working tree.

> **Part 2 (11 Aug) — Race Weekend Strategist** is at the bottom of this file. It adds
> five circuits, a race simulator, a pit-strategy optimiser, multi-lap trend analysis,
> and validation against real race results. Read Part 1 first for the vision work it
> builds on.

---

## 0. TL;DR

The session started as one data task: *"validate the vision model against real wet
footage — only dry has ever been tested."* That task is complete and passed. Chasing it
surfaced three genuine bugs in code downstream of vision, all of which were fixed and
verified:

1. The tyre rule engine ignored trend direction in two of three score bands, so a drying
   track — and, worse, a dry track with rain arriving — both returned "no tire change needed".
2. `avg_first_deployment_lap` from the real FastF1 pull was sitting in `sc_stats.json`
   and read by nothing. Safety-car *timing* prediction now exists.
3. `rain_probability_pct` was millimetres × 100 wearing a percentage label, and two of
   the three weather projection branches had never executed.

Verified live end to end, including the CrewAI LLM agent with a real `HF_TOKEN`.

---

## 1. What was verified (the original task)

### Vision: wet validation — PASS

Five reference clips sourced from YouTube via `yt-dlp`, sliced at ~1fps, scored through
the real `vision.py` code path. 20 evenly-spaced frames each:

| clip | expected | avg wetness | result |
|---|---|---|---|
| `dry_ref` (Verstappen pole lap, F1 halo cam) | dry | **0.171** | PASS (<0.35) |
| `pov_wet_full` (SR3 driver POV, overcast) | wet | **0.727** | PASS (>0.65) |
| `short_wet_1` (trackside) | wet | 0.766 | PASS |
| `short_wet_3` (trackside, heavy spray) | wet | 0.744 | PASS |
| `short_wet_2` (trackside, **vertical 9:16**) | wet | 0.539 | **FAIL** |
| `damp_slicks` (10 min, real damp landscape) | damp | **0.609**, labelled "drying" | sits correctly between dry and wet |

Dry-vs-wet separation is ~0.55. **All three regimes now have real evidence**, not just
the two extremes. `vision.py`'s prompts and crop did **not** need retuning.

The single failure is explainable and was deliberately not chased: vertical 9:16 phone
video puts grandstands, not tarmac, in the top-35% crop. **Vertical video is out of
scope — do not demo with it.**

### The crop band was challenged and survived

A driver-POV frame has sky and grandstands in its top third, so the top-35% crop looked
like it must be measuring weather rather than track surface. Tested rather than assumed,
via the new `sweep_crop.py` (dry ref vs. wet POV, 12 frames each,
separation = wet avg − dry avg):

| band | dry avg | wet avg | separation |
|---|---|---|---|
| **(0.00, 0.35)** — current | 0.240 | 0.732 | **+0.492** |
| (0.00, 0.25) — sky-only confound check | 0.301 | 0.635 | +0.334 |
| (0.00, 0.50) | 0.338 | 0.557 | +0.219 |
| (0.40, 0.58) — POV's actual tarmac band | 0.544 | 0.425 | −0.119 |
| (0.00, 1.00) — full frame | 0.326 | 0.360 | +0.033 |

The current band wins by a wide margin and beats the sky-only band, so it is not merely
reading cloud cover — though the sky plainly contributes some signal. The "real tarmac"
bands score *negative* separation because they land on the dark navy bodywork of the dry
clip's car, which reads as wet. **One global band cannot align to two camera geometries.**
`WETNESS_CROP_BAND` was left at `(0.0, 0.35)`.

### Trend/forecast/urgency code: previously never executed

Every real clip scores a roughly flat slope, so `trend.py`'s slope maths, the forecast
blend, and the urgency branches in `strategy.py` had **never run on a changing signal**.

No downloadable real drying lap was found. The obvious candidate (an ELMS dry-to-wet
clip) returns `This video is DRM protected` from yt-dlp; **DRM was not worked around and
must not be** — that clip is permanently off the table.

Instead `backend/reference_footage/synthetic_drying.mp4` was built from real frames:
8 wet POV frames → 12 alternating wet/dry ("mixed") → 8 dry-reference frames, each held
1 second. Builder script: `scratchpad/make_drying_lap.py` (outside the repo).

> **This is a control, not evidence.** It does not show CLIP handles a genuinely drying
> surface — true intermediate damp states are absent and the camera angle changes
> mid-clip. It only exercises downstream code on a falling signal. **Do not present it
> to judges as proof the model detects drying.**

It worked — slope −0.026, direction `drying`, corners grading 0.82 wet → 0.11 dry — and
it exposed bug #1 below.

---

## 2. Code changes

### `backend/app/pipeline/vision.py`
- `WETNESS_CROP_FRAC = 0.35` → **`WETNESS_CROP_BAND = (0.0, 0.35)`**, a `(start, end)`
  fraction-of-height tuple. Same effective default; other camera geometries are now
  testable without editing code.
- `_crop_top()` → `_crop_band(image, band)`.
- `analyze_frame(image_path, crop_band=None)` — optional per-call override. Only the
  calibration scripts pass it; the request pipeline always uses the configured default.
- Comments record the wet-validation numbers and the full sweep table.

**No behavioural change to the request path.** Scores are identical to before.

### `backend/app/pipeline/strategy.py` — BUG FIX
The final `else` branch (score ≤ 0.35) ignored `direction` entirely. Consequences:
- a drying track returned *"Track is dry, no tire change needed"*;
- **a dry-reading track with rain arriving returned the same thing** — the one case
  where silence is actively dangerous;
- the demo's signature *"box in 2-3 laps for slicks"* call only existed in the narrow
  0.35–0.6 band.

Separately, at 0.609 the `>0.6` branch announced *"track still fully wet"* while the
label read `drying` — visibly contradicting the trend text in the same response.

Now `direction` is consulted in **all three** bands (`WET_BAND = 0.6`, `DAMP_BAND = 0.35`
are named constants):

| score | direction | call |
|---|---|---|
| >0.6 | drying | "Still fully wet, but the track's coming to us — inters ready, we'll call the crossover" (medium, laps 3–6) |
| >0.6 | else | "Stay out on wets" (low, 5–8) |
| 0.35–0.6 | drying | "Inters losing performance, box in 2-3 laps for slicks" (medium, 2–4) |
| 0.35–0.6 | wetting | "Conditions worsening — full wets ready" (**high**, 1–3) |
| 0.35–0.6 | stable | "Hold on intermediates" (low, 5–8) |
| ≤0.35 | **wetting** | **"Rain arriving on a dry track — be ready to box" (high, 1–2)** ← was silent |
| ≤0.35 | drying | "Track's drying nicely, slicks are right — stay out" (low, 6–10) |
| ≤0.35 | stable | "Track is dry, no tire change needed" (low, 5–8) |

Verified before/after on real clips:

| clip | before | after |
|---|---|---|
| synthetic drying | "Track is dry, no tire change needed" | "Track's drying nicely, slicks are the right call" |
| `damp_slicks` (0.609, drying) | "Stay out on wets, track still fully wet" | "Still fully wet, but the track's coming to us — inters ready" |
| `pov_wet_full` (0.718, stable) | unchanged | unchanged |

### `backend/app/pipeline/history.py` — NEW: safety-car timing
`sc_stats.json` already contained `avg_first_deployment_lap: 22.5` from the real FastF1
pull, and **nothing read it**. `get_sc_risk()` now also returns:

- `expected_first_sc_lap` — historical lap × earliness factor
- `historical_first_sc_lap` — the unadjusted 22.5
- `sc_window_laps` — `[projected × 0.75, projected × 1.25]`; a single lap number would
  imply precision this doesn't have
- `sc_timing_note` — plain-English rationale
- `sessions_analyzed` — passed through (7)

Earliness multipliers are **named module constants, not a fitted model** — deliberately
arguable: `WET_EARLINESS = 0.65`, `DAMP_EARLINESS = 0.80`, `WORSENING_EARLINESS = 0.90`.

Live example on a wet track: *"First SC/VSC historically comes around lap 22 here (avg of
7 sessions). With wet track, expect it earlier — most likely laps 11-18."* (expected lap
14.6 vs. the dry 22.5).

### `backend/app/pipeline/weather.py` — BUG FIX + branch coverage
**Mislabel:** `rain_probability_pct` was `mean(precipitation_mm) * 100`. 0.3mm of drizzle
displayed as "30% rain probability". Open-Meteo's `minutely_15` block **does** support a
real `precipitation_probability` field (confirmed by probing the API before changing the
call) — it is now requested and reported. `precipitation_mm` is reported separately.

**Untested branches:** it has not rained at Silverstone during any test run, so the live
API only ever returned zeros and **only the drying branch had ever executed**. The old
binary also collapsed "no rain" and "probably about to rain" into the same assumption.
Now three-way, with named constants:

| condition | per-lap adjustment |
|---|---|
| rain falling (>0.1mm) | `RAIN_FALLING_ADJUSTMENT = +0.05` |
| rain likely (≥50% chance, none falling) | `RAIN_LIKELY_ADJUSTMENT = +0.02` |
| no signal | `DRYING_ADJUSTMENT = −0.01` |

New response fields expose the arithmetic instead of a black-box curve:
`measured_slope`, `weather_adjustment`, `forecast_rationale`, `precipitation_mm`.

`project_condition()` gained a trailing `precipitation_probability_pct=None` kwarg
(backward compatible); `main.py` passes it.

**Known judgment call:** with a measured drying slope of −0.04 and rain falling (+0.05),
the net is **+0.01 — rising**. Incoming rain outvotes observed drying. Intentional, but
it is a real decision encoded in the numbers.

### `backend/app/agents/crew.py`
- Prompt now receives `sc_timing_note` and `pit_window_laps`.
- Asks for 2–4 sentences (was 1–3) covering the tyre call **and** the safety-car window
  in lap numbers, with an explicit instruction: *"Never invent a number the crew did not
  report."*

### `backend/app/main.py`
- Passes `precipitation_probability_pct` into `project_condition()`.
- Passes `sc_timing_note` and `pit_window_laps` into the agent signal dict.

### Frontend
- `types.ts` (**the contract**) — `SafetyCarRisk` gained `sessions_analyzed`,
  `expected_first_sc_lap`, `historical_first_sc_lap?`, `sc_window_laps?`,
  `sc_timing_note`. `Forecast` gained `precipitation_mm`, `measured_slope`,
  `weather_adjustment`, `forecast_rationale`.
- `RecommendationPanel.tsx` — safety-car card shows "first deployment expected ~lap N
  (laps A–B)" plus the timing note.
- `App.tsx` — header reads "rain chance: X% (Y mm)" instead of the old mislabel; a line
  under the trend chart prints the projection arithmetic (`measured slope + weather
  adjustment per lap`), serving the plan's "explicitly NOT a black-box model" pitch.
- `npx tsc --noEmit` passes clean. (`npm install` was required first — `node_modules`
  was absent.)

### Scripts
- **`calibrate_vision.py`** (modified) — now takes `--dir <folder>` (any frame folder,
  not just `data/uploads/<session_id>/frames`), `--expect dry|wet` for PASS/FAIL against
  the 0.35/0.65 thresholds, and `--limit N` using **evenly-spaced** sampling. Exports
  `frame_paths()` and `select_frames()` for reuse.
- **`sweep_crop.py`** (new) — scores a known-dry and a known-wet folder under 8 candidate
  crop bands and reports which band *separates* them best. Separation is the metric that
  matters: a band that reads everything as dry looks great on dry footage and is useless.
- **`test_weather_branches.py`** (new) — stubs forecast data to force all three weather
  branches plus the mislabel regression. **8/8 pass.** Exits non-zero on failure.
- **`fetch_footage.py`** (modified) — `--slice <name>` to slice an already-downloaded clip.

---

## 3. Verified live

Backend + frontend dev servers were run and a real `HF_TOKEN` added to `backend/.env`.

- `agent_synthesis_used: **True**` — the CrewAI agent is genuinely working, not falling back.
- Real agent output, picking up the new timing data:
  > *"Slicks are the right call, stay out. Expect Safety Car between laps 17-28."*
- The agent correctly **agreed** with the rule engine rather than overriding it.

Observation for whoever polishes the demo: the radio call is a bit terse and generic
("plan accordingly" is chatbot, not race engineer). Model is `Qwen/Qwen2.5-7B-Instruct`,
`temperature=0.4`. Both are env/one-line configurable (`HF_LLM_MODEL` in `.env`). §4 of
the plan doc calls this voice the single most memorable thing judges will hear.

---

## 4. Reference footage

In `backend/reference_footage/` — **gitignored**, will not appear in the repo. Re-download
with `uv run python scripts/fetch_footage.py <url> <name>` (needs `uv tool install yt-dlp`).

| file | source | notes |
|---|---|---|
| `dry_ref.mp4` | `youtube.com/watch?v=ooeujTa2-k8` | dry baseline, F1 halo cam |
| `pov_wet_full.mp4` | `watch?v=aK1gkwQplSg` | wet driver POV, SR3 Radical, **full lap** |
| `damp_slicks.mp4` | `watch?v=0TESNDFssno` | 10 min real damp, landscape |
| `short_wet_1/2/3.mp4` | three YouTube Shorts | **vertical, not laps** — calibration frames only |
| `short_drying.mp4` | `shorts/mT376mm23Xg` | vertical, 57s, not sliced/scored yet |
| `hl_brit2026.mp4`, `hl_bahrain25.mp4` | race highlights | downloaded and sliced, **not yet scored** |
| `synthetic_drying.mp4` | generated | the control described above |

**Demo clip recommendation:** `damp_slicks.mp4` — real footage, mid-range condition, and
it triggers the new crossover call plus the earlier SC window. `synthetic_drying.mp4`
gives the best-looking trend chart but must be labelled as synthetic.

**Never demo the vertical shorts.** Also note the three shorts and the highlights are not
single laps, so `trend.py`'s timestamp→corner mapping produces meaningless corner
assignments on them.

---

## 5. Still open

**Pre-existing, unfixed:**
- **`scripts/smoke_test.py` is dead.** It feeds synthetic solid-colour frames, which the
  later-added non-racing CLIP filter correctly rejects with a 422. The "sanity check with
  no real footage needed" hasn't worked since that filter landed. Either give it real
  frames or have it bypass the filter. Predates this session.
- **`silverstone.json` corner percentages are still rough estimates**, not surveyed
  sector-time data. This is now the **top remaining data task**. The backend reads the
  file generically — no code changes needed when better numbers land.

**Known gaps from the original plan (unchanged):**
- Human-in-the-loop accept/override controls — recommendation panel is display-only.
  Biggest gap vs. the original pitch. Frontend work.
- Pre-race setup/wing recommendation (F7) — cut for time.
- Multi-track support — Silverstone only, by choice.

**Raised but not decided:**
- A **demo override** for the forecast — a flag/param injecting a chosen forecast so the
  rain-arriving scenario can be shown on stage regardless of real weather, clearly
  labelled as simulated in the response. Not built; awaiting a decision.
- The projection curve is still dominated by the −0.01 dry constant because it isn't
  actually raining. Honest behaviour, but the rain path stays invisible in a live demo.
- LLM voice quality (see §3).

**Not validated:**
- CLIP against genuinely drying *real* footage (only the synthetic control).
- A wet clip from an F1 halo cam — the current wet/dry pair differs in camera angle as
  well as conditions, which is a fair criticism a judge could make.

---

## 6. Git state

Base commit `ba50a6b`, branch `main`, remote `github.com/Strizzyy/TrackPulse`.
**Nothing committed this session.** Working tree:

```
 M CONTEXT.md
 M backend/app/agents/crew.py
 M backend/app/main.py
 M backend/app/pipeline/history.py
 M backend/app/pipeline/strategy.py
 M backend/app/pipeline/vision.py
 M backend/app/pipeline/weather.py
 M backend/scripts/calibrate_vision.py
 M backend/scripts/fetch_footage.py
 M backend/uv.lock
 M frontend/package-lock.json
 M frontend/src/App.tsx
 M frontend/src/components/RecommendationPanel.tsx
 M frontend/src/types.ts
?? backend/scripts/sweep_crop.py
?? backend/scripts/test_weather_branches.py
```

~493 insertions, ~115 deletions across 14 tracked files, plus 2 new scripts.
`uv.lock` and `package-lock.json` changed only from running `uv sync` / `npm install`.

**Ownership note:** the data lane was the assigned task, but the fixes reach into the
rule engine (Rohan's backend) and the frontend contract (Ananya/Ruhan's lane). Consider
splitting into separate commits so the rule-engine change can be reviewed on its own.

---

## 7. How to reproduce anything here

```bash
# backend
cd backend && uv sync
cp .env.example .env            # add HF_TOKEN to enable the CrewAI agent
uv run uvicorn app.main:app --port 8000

# frontend
cd frontend && npm install && npm run dev     # http://localhost:5173

# validate a clip's wetness scoring
uv tool install yt-dlp
uv run python scripts/fetch_footage.py "<youtube_url>" my_clip
uv run python scripts/calibrate_vision.py --dir reference_footage/my_clip_frames --expect wet --limit 20

# find the right crop band for a new camera angle
uv run python scripts/sweep_crop.py --dry reference_footage/dry_ref_frames --wet reference_footage/my_clip_frames --limit 12

# weather branch coverage
uv run python scripts/test_weather_branches.py
```

**Method note for whoever continues:** every change in this session was driven by
measuring on real footage rather than reasoning about what the model probably does. Two
of the three bugs were found only because a code path was forced to execute for the first
time. If you are about to change `vision.py`'s prompts or crop, measure first — the one
hypothesis that felt most obviously correct this session (that the top-35% crop must be
wrong for driver-POV footage) was rejected by the data.

---
---

# Part 2 — Race Weekend Strategist (11 Aug 2026)

## What changed conceptually

TrackPulse went from "how wet is this lap?" to planning a race across **five circuits**
(Silverstone, Monaco, Spa, Monza, Suzuka — picked for strategic variety, not
convenience). Two structural problems had to be fixed to get there.

### 1. The single-lap "trend" was not a trend over time

`trend.compute_trend()` fits wetness against timestamp inside one ~90s lap. Within a lap,
time and track position are the same axis, so the slope measured *"are the last corners
wetter than the first"*. Every real clip returned `slope: -0.0`.

`pipeline/session.py` buckets frames into laps and compares lap averages. On the same
`damp_slicks.mp4` the single-lap path reads as flat, session mode measures a real decline:
`L1 0.580 → L7 0.544`, −0.014/lap, "drying".

**Two unit bugs, both from mixing per-second and per-lap rates:**
- `project_condition()` applies its slope once per lap but received a per-second slope —
  under-weighting the vision data ~90×. That is why the forecast looked like it ignored
  the camera.
- The obvious fix (scale `recent_slope` by lap length) is *also* wrong: `recent_slope` is
  fitted over a 15-second window of ~5 frames, so scaling amplifies its noise equally.
  It produced a fictitious **+0.26/lap** trend on a flat clip. The whole-lap fit is used
  instead (now −0.0244/lap on that clip).

### 2. Nothing was per-circuit

`scripts/build_circuit_data.py` pulls 2019–2025 race sessions for five circuits and
writes `app/data/circuits/{id}.json`. Run once, committed, **never called at request
time**.

## Measured vs modelled — this distinction is the whole credibility story

| input | status | evidence |
|---|---|---|
| Corner geometry | **real** | `get_circuit_info()`, Distance in metres. Monaco 19, Monza 11, Suzuka 18, Silverstone 18 — all match reality |
| Pit loss | **real** | Monaco 20.5s → Monza 25.8s |
| SC/VSC rate + first-deployment lap | **real** | per circuit, 7 seasons |
| Rain frequency | **real** | Monza 0%, Silverstone 42.9% |
| Tyre degradation | **measured but NOT USED** | see below |
| Fuel effect | **modelled** | declared constants, `pipeline/fuel.py` |
| Race time / strategy | **modelled** | transparent arithmetic, `race_sim.py` |

### Degradation: the honest failure

Three methods were tried — per-stint regression; a panel regression with driver fixed
effects controlling for track evolution; the same restricted to a matched tyre-age
window. **All three produce non-monotonic results at all five circuits** (harder tyres
appearing to wear faster than softer ones). Real stint data conflates wear with track
evolution, traffic, and the fact that teams pick compounds *because* of the stint they
intend to run.

Rather than bend real measurements toward an assumption, `build_circuit_data.py` sets
`degradation_confidence: "low"` and `race_sim.py` falls back to reference degradation.
Measured values remain in the JSON and the API response.

**Do not tell anyone measured per-circuit degradation drives the simulation. It does
not.** Fixing this properly is the highest-value remaining work — see "Still open".

## Validation against real races — run this before demoing

`scripts/validate_replay.py` scores the optimiser against what winning teams actually
did, excluding races the simulator does not model (wet, red-flagged):

| circuit | predicted | actual (2023 winner) | stops | compounds | time error |
|---|---|---|---|---|---|
| Monza | M23 / H28 | M20 / H31 | match | match | +2.3% |
| Silverstone | M23 / H29 | M33 / S19 | match | differ | −2.7% |
| Spa | M29 / H37 | M26 / H26 / S14 | 1 vs 2 | differ | +7.0% |
| Suzuka | H29 / M24 | M16 / M21 / H16 | 1 vs 3 | match | −6.3% |

**Stop count 2/4, compound set 2/4, mean race-time error 4.6%.** Monaco excluded (wet).

Quote these numbers as they are. They are unflattering in places and far more credible
than a claim of perfection — and the exclusion logic matters: scoring against the
red-flagged 2024 Monaco and Suzuka races produced 26% "errors" that say nothing about
the model.

## Where vision plugs into strategy

Measured wetness decides which compounds are *considered*, not just how slow everyone is.
At Spa, identical circuit data returns:
- assuming dry: `M29 / H37`
- with real wet footage: `H32 / H34`, `wet_race: true`, intermediates on the table

`race_sim.py` also penalises tyre/condition mismatch (slicks on a wet track, wets on a
dry one), without which the uniform wet penalty would never favour wet rubber.

## New files

```
backend/app/pipeline/circuits.py    # loads circuits/*.json, cached, no FastF1 at runtime
backend/app/pipeline/session.py     # lap segmentation + trend over TIME
backend/app/pipeline/fuel.py        # the one modelled strategy input
backend/app/pipeline/race_sim.py    # per-lap time model + race simulation
backend/app/pipeline/optimizer.py   # enumerate + rank 0-3 stop plans
backend/app/data/circuits/*.json    # 5 circuits, real FastF1 data
backend/scripts/build_circuit_data.py
backend/scripts/validate_replay.py
backend/scripts/test_strategy.py
frontend/src/components/StrategyBoard.tsx
frontend/src/components/LapTrend.tsx
```

Modified: `main.py` (new endpoints; `/api/analyze` untouched), `history.py` (optional
per-circuit stats), `frames.py` (`max_frames` parameter), `types.ts`, `api.ts`, `App.tsx`
(three-mode UI + circuit picker).

## Judgement calls encoded in the code

- **Track position is not modelled.** A pure lap-time sim trades stops for tenths. Where
  a lower-stop plan is within 15s, `optimizer.py` says so explicitly — at Monaco it
  reports the 1-stop is 7.6s slower on pace but likely the better real call.
- **Tyre life caps** come from real observed stint lengths (90th percentile × 1.25).
  Without them the optimiser recommended a 35-lap soft stint at Monaco.
- **Wet races waive the two-compound rule**, as in the real regulations.

## Still open

1. **Degradation** (above) — the one input that is measured but untrusted.
2. **Stage 2 of the plan: the actual weekend.** FP1/2/3/Quali/Race sessions, per-session
   weather from Open-Meteo (upcoming) or `session.weather_data` (replay), quali fuel/tyre
   plans. `pipeline/weekend.py` does not exist yet.
3. **Upcoming-GP mode** — needs a GP inside Open-Meteo's ~16-day window; replay works now.
4. **The CrewAI agent has not been extended to brief the weekend** — it still narrates
   the single-lap read only.
5. Everything still open from Part 1 (human-in-the-loop controls, `smoke_test.py` broken,
   setup/wing notes).

## Commands

```bash
uv run python scripts/build_circuit_data.py      # slow, one-time, commit the JSON
uv run python scripts/test_strategy.py           # ALL PASS expected
uv run python scripts/validate_replay.py --year 2023
uv run python scripts/test_weather_branches.py   # 8/8 expected
cd frontend && npx tsc --noEmit                  # clean expected
```
