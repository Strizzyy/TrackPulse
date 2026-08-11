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
  /** Measured visual trend, wetness per LAP -- same figure as
   * Forecast.measured_slope. It was per-second until the units were unified. */
  slope: number;
  /** Measured + weather, i.e. Forecast.adjusted_slope. `direction` comes from
   * THIS, not from `slope`, and so do the tyre call and the SC risk. */
  net_slope: number;
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
  // A real probability from Open-Meteo's precipitation_probability field --
  // NOT millimetres rescaled, which is what an earlier version reported here.
  rain_probability_pct: number;
  precipitation_mm: number;
  // The two halves of the projection, exposed so the UI can show why the
  // curve bends: measured visual slope + weather adjustment, per lap.
  measured_slope: number;
  weather_adjustment: number;
  // Their sum, and the direction every downstream decision is taken from.
  adjusted_slope: number;
  projected_direction: "drying" | "wetting" | "stable";
  forecast_rationale: string;
  avg_lap_time_sec: number;
  reference_frames: ReferenceFrame[];
}

export interface SafetyCarRisk {
  risk_pct: number;
  base_rate_pct: number;
  rationale: string;
  sessions_analyzed: number | null;
  // When, not just whether. Derived from the FastF1 average first-deployment
  // lap, pulled earlier when conditions are wet or worsening.
  expected_first_sc_lap: number | null;
  historical_first_sc_lap?: number | null;
  sc_window_laps?: [number, number];
  sc_timing_note: string | null;
}

export interface Recommendation {
  tire_call: string;
  compound: string;
  urgency: "low" | "medium" | "high";
  pit_window_laps: number[];
}

export interface StrategistReport {
  session_id: string;
  circuit_id: string;
  circuit_name: string;
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

// ---------------------------------------------------------------------------
// Race Weekend Strategist. Everything below is served from per-circuit data
// built offline from real FastF1 race sessions
// (backend/scripts/build_circuit_data.py) -- no live FastF1 at request time.
// ---------------------------------------------------------------------------

export interface CircuitSummary {
  circuit_id: string;
  name: string;
  race_laps: number | null;
  avg_lap_time_sec: number | null;
  pit_loss_sec: number | null;
  sc_or_vsc_rate_pct: number | null;
  rain_frequency_pct: number | null;
  corner_count: number;
}

export interface CompoundDegradation {
  s_per_lap: number;
  typical_stint_laps: number;
  max_observed_stint_laps: number;
  samples: number;
  method?: string;
}

export interface StintResult {
  stint: number;
  compound: string;
  laps: number;
  stint_time_sec: number;
}

export interface StrategyOption {
  stints: StintResult[];
  stops: number;
  pit_loss_sec: number;
  pit_time_lost_sec: number;
  total_time_sec: number;
  total_time_display: string;
  plan: string;
  delta_to_best_sec: number;
}

export interface StrategyPlan {
  total_laps: number;
  candidates_evaluated: number;
  tyre_life_enforced: boolean;
  wet_race: boolean;
  compounds_considered: string[];
  recommended: StrategyOption;
  ranked: StrategyOption[];
  best_per_stop_count: StrategyOption[];
  // Set when a lower-stop plan is close enough that traffic would decide it.
  track_position_caveat: string | null;
  fewest_stops_option: StrategyOption | null;
  note: string;
}

export interface StrategyConditions {
  source: string;
  current_wetness: number;
  direction?: string;
  slope_per_lap?: number;
  laps_analyzed?: number;
  session_id?: string;
}

export interface StrategyReport {
  circuit_id: string;
  circuit_name: string;
  conditions: StrategyConditions;
  projected_wetness_by_lap: number[] | null;
  strategy: StrategyPlan;
  safety_car_risk: SafetyCarRisk;
  circuit_inputs: {
    avg_lap_time_sec: number | null;
    pit_loss_sec: number | null;
    degradation: Record<string, CompoundDegradation>;
    // "measured" only when the per-circuit regression passed its plausibility
    // check. It usually doesn't, and the simulation runs on reference values --
    // the UI must say so rather than implying real degradation drives it.
    degradation_confidence: "high" | "low" | null;
    degradation_note: string | null;
    degradation_in_use: "measured" | "reference";
    sc_or_vsc_rate_pct: number | null;
    source: string;
  };
}

export interface LapSummary {
  lap: number;
  avg_wetness: number;
  label: string;
  frame_count: number;
  image_url: string;
  corners: CornerSummary[];
  // False for a sparse lap (almost always a partial lap caught at the tail
  // of an upload whose length isn't an exact multiple of the lap time) --
  // excluded from the trend fit and from seeding "current conditions", but
  // still shown here for transparency.
  complete: boolean;
}

export interface SessionTrend {
  /** Measured lap-over-lap trend. */
  slope_per_lap: number;
  /** Measured + weather. `direction` comes from this. */
  net_slope_per_lap?: number;
  direction: string;
  /** Direction of the measured trend alone, before the weather adjustment --
   * `summary` describes this one, with its own numbers alongside it. */
  measured_direction?: string;
  laps_analyzed: number;
  total_change?: number;
  summary: string;
}

export interface SessionReport {
  session_id: string;
  circuit_id: string;
  circuit_name: string;
  simulated: boolean;
  lap_duration_sec: number;
  lap_count: number;
  laps: LapSummary[];
  frames: FrameResult[];
  dropped_non_racing_frames: number;
  trend: SessionTrend;
  forecast: Forecast;
  safety_car_risk: SafetyCarRisk;
  recommendation: Recommendation;
}

export interface CircuitDetailCorner {
  name: string;
  number: number;
  distance_m: number;
  start_pct: number;
  end_pct: number;
}

// The full per-circuit record from GET /api/circuits/{id} -- everything
// build_circuit_data.py measured offline from real FastF1 race sessions.
// Static (no video needed), so it can be shown the moment a circuit is
// picked, before the user chooses a mode or loads any footage.
export interface CircuitDetail {
  circuit_id: string;
  name: string;
  lat: number;
  lon: number;
  source: string;
  race_laps: number | null;
  lap_distance_m: number | null;
  avg_lap_time_sec: number | null;
  pit_loss_sec: number | null;
  rain_frequency_pct: number | null;
  degradation: Record<string, CompoundDegradation>;
  track_evolution_sec_per_lap: number | null;
  corners: CircuitDetailCorner[];
  corner_count: number;
  corner_source: string;
  sessions_analyzed: number | null;
  sc_or_vsc_rate_pct: number | null;
  avg_first_deployment_lap: number | null;
  degradation_confidence: "high" | "low" | null;
  degradation_note: string | null;
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
