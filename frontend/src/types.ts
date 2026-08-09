// Mirrors the backend's StrategistReport response shape exactly
// (backend/app/main.py). Keep these two in sync by hand for now --
// there are only the two places.

export interface FrameResult {
  frame_index: number;
  timestamp_sec: number;
  corner: string;
  wetness_score: number;
  label: "dry" | "damp" | "drying" | "wet";
  image_url: string;
}

export interface CurrentCondition {
  label: string;
  wetness_score: number;
  image_url: string;
  timestamp_sec: number;
}

export interface CornerSummary {
  corner: string;
  avg_wetness: number;
  label: string;
  image_url: string;
}

export interface Trend {
  slope: number;
  direction: "drying" | "wetting" | "stable";
  summary: string;
}

export interface ReferenceFrame {
  lap: number;
  projected_wetness: number;
  reference_image_url: string;
  reference_label: string;
  note: string;
}

export interface Forecast {
  horizon_laps: number[];
  projected_wetness: number[];
  rain_probability_pct: number;
  avg_lap_time_sec: number;
  reference_frames: ReferenceFrame[];
}

export interface SafetyCarRisk {
  risk_pct: number;
  base_rate_pct: number;
  rationale: string;
}

export interface Recommendation {
  tire_call: string;
  compound: string;
  urgency: "low" | "medium" | "high";
  pit_window_laps: number[];
}

export interface StrategistReport {
  session_id: string;
  current_condition: CurrentCondition;
  frames: FrameResult[];
  dropped_non_racing_frames: number;
  corners: CornerSummary[];
  trend: Trend;
  forecast: Forecast;
  safety_car_risk: SafetyCarRisk;
  recommendation: Recommendation;
  strategist_note: string;
  agent_synthesis_used: boolean;
}

export interface TrackCorner {
  name: string;
  start_pct: number;
  end_pct: number;
}

export interface Track {
  track_id: string;
  name: string;
  avg_lap_time_sec: number;
  lat: number;
  lon: number;
  corners: TrackCorner[];
}
