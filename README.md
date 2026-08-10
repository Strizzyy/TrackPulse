# TrackPulse

AI pit wall copilot for F1 race strategy, built for the **Weather Whiplash** hackathon
problem statement (live track-condition detector). Upload a lap video and get back a
condition classification, a wetness trend, a weather-driven forecast, a safety-car risk
read grounded in real historical F1 data, and a tire/pit-window recommendation — with an
LLM agent (CrewAI + Hugging Face) synthesizing it all into a race-engineer-style radio call.

Full project context (architecture, API contract, what's built vs. open, how to
contribute) is in [`CONTEXT.md`](./CONTEXT.md).

## Stack

- **Backend**: Python (FastAPI, uv-managed) -- `backend/`
- **Frontend**: React + TypeScript (Vite, Tailwind, Recharts) -- `frontend/`
- **Vision**: Hugging Face `transformers`, CLIP zero-shot classification
- **Agent**: CrewAI, LLM via Hugging Face Inference Providers
- **Data**: FastF1 (real historical Silverstone stats), Open-Meteo (live weather)

## Quickstart

### Backend
```
cd backend
uv sync
cp .env.example .env   # add your HF_TOKEN to enable the CrewAI agent (optional -- app still works without it)
uv run uvicorn app.main:app --port 8000 --reload
```

### Frontend
```
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend expects the backend at `http://localhost:8000`
(override with `VITE_API_BASE` if needed).

## Status

Core pipeline is real end-to-end and verified against real F1 footage -- no mock data
anywhere. Two features from the original plan are intentionally not built yet
(human-in-the-loop accept/override controls, pre-race setup/wing recommendation). See
[`CONTEXT.md`](./CONTEXT.md) for the full breakdown of what's done, what's open, and
what each area of the project needs next.
