---
title: TrackPulse API
emoji: 🏎️
colorFrom: blue
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# TrackPulse — backend API

FastAPI backend for TrackPulse, an AI pit-wall copilot: CLIP-based track-wetness
vision, live weather, historical safety-car risk, and a CrewAI strategist agent.
This Space serves the JSON API only — the UI lives at the separately deployed
frontend (see `VITE_API_BASE`).

Full project context, API contract, and what's real vs. modelled: see
[`CONTEXT.md`](https://github.com/Strizzyy/TrackPulse/blob/main/CONTEXT.md) in the
main repo.

## Endpoints

- `GET /api/circuits`, `GET /api/circuits/{id}` — circuit data (5 circuits)
- `POST /api/analyze` — single-lap video analysis
- `POST /api/analyze-session` — multi-lap trend analysis
- `POST /api/strategy/plan` — full-race pit strategy optimiser
- Interactive docs at `/docs`

## Configuration

Set `HF_TOKEN` as a **Space secret** (Settings → Repository secrets) to enable the
CrewAI Chief Strategist LLM step. Without it, `strategist_note` falls back to
deterministic rule-engine text and `agent_synthesis_used` comes back `false` — the
API still works fully either way.

Optional: `HF_LLM_MODEL` to override the default (`huggingface/Qwen/Qwen2.5-7B-Instruct`).

## Notes on this deployment

- Uploaded videos/frames (`/media/...`) are stored on the container's local disk
  and are **ephemeral** — they're wiped on every restart/rebuild. Expected for a
  demo; not meant as durable storage.
- No FastF1 calls happen at request time — all circuit/history data ships as
  pre-built JSON in the image (`app/data/`).
