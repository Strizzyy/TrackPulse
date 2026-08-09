import type { StrategistReport, Track } from "./types";

// Points at the backend from `uv run uvicorn app.main:app --port 8000`.
// Frontend teammate: override with a .env (VITE_API_BASE=...) if needed,
// nothing else in this file has to change.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export async function getTrack(): Promise<Track> {
  const res = await fetch(`${API_BASE}/api/track/silverstone`);
  if (!res.ok) throw new Error(`Failed to load track: ${res.status}`);
  return res.json();
}

export async function analyzeLap(video: File): Promise<StrategistReport> {
  const form = new FormData();
  form.append("video", video);
  const res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Analyze failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function mediaUrl(path: string): string {
  return `${API_BASE}${path}`;
}
