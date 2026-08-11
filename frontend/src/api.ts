import type {
  CircuitDetail,
  CircuitSummary,
  SessionReport,
  StrategistReport,
  StrategyReport,
  Track,
} from "./types";

// Points at the backend from `uv run uvicorn app.main:app --port 8000`.
// Frontend teammate: override with a .env (VITE_API_BASE=...) if needed,
// nothing else in this file has to change.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function getTrack(): Promise<Track> {
  const res = await fetch(`${API_BASE}/api/track/silverstone`);
  if (!res.ok) throw new Error(`Failed to load track: ${res.status}`);
  return res.json();
}

export async function analyzeLap(video: File, circuitId = "silverstone"): Promise<StrategistReport> {
  const form = new FormData();
  form.append("video", video);
  form.append("circuit_id", circuitId);
  const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Analyze failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function getCircuits(): Promise<CircuitSummary[]> {
  const res = await fetch(`${API_BASE}/api/circuits`);
  if (!res.ok) throw new Error(`Failed to load circuits: ${res.status}`);
  return (await res.json()).circuits;
}

/** Full offline-built circuit record -- SC windows, pit loss, degradation.
 * Static, no video required, so it can be shown right after picking a circuit. */
export async function getCircuitDetail(circuitId: string): Promise<CircuitDetail> {
  const res = await fetch(`${API_BASE}/api/circuits/${circuitId}`);
  if (!res.ok) throw new Error(`Failed to load circuit detail: ${res.status}`);
  return res.json();
}

/** Multi-lap analysis: a trend over laps rather than over one lap's corners. */
export async function analyzeSession(
  video: File,
  circuitId: string,
  lapDurationSec?: number,
  simulated = false,
): Promise<SessionReport> {
  const form = new FormData();
  form.append("video", video);
  form.append("circuit_id", circuitId);
  if (lapDurationSec) form.append("lap_duration_sec", String(lapDurationSec));
  form.append("simulated", String(simulated));
  return post(`${API_BASE}/api/analyze-session`, form, "Session analysis");
}

/** Race strategy. The video is optional -- without it the race is assumed dry. */
export async function planStrategy(
  circuitId: string,
  video?: File | null,
  raceLaps?: number,
): Promise<StrategyReport> {
  const form = new FormData();
  form.append("circuit_id", circuitId);
  if (video) form.append("video", video);
  if (raceLaps) form.append("race_laps", String(raceLaps));
  return post(`${API_BASE}/api/strategy/plan`, form, "Strategy plan");
}

async function post<T>(url: string, form: FormData, label: string): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${label} failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function mediaUrl(path: string): string {
  return `${API_BASE}${path}`;
}
