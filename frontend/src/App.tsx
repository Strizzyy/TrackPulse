import { useEffect, useState } from "react";
import {
  analyzeLap,
  analyzeSession,
  getCircuits,
  getTrack,
  mediaUrl,
  planStrategy,
} from "./api";
import type {
  CircuitSummary,
  SessionReport,
  StrategistReport,
  StrategyReport,
  Track,
} from "./types";
import TrendChart from "./components/TrendChart";
import CornerStrip from "./components/CornerStrip";
import RecommendationPanel from "./components/RecommendationPanel";
import StrategyBoard from "./components/StrategyBoard";
import LapTrend from "./components/LapTrend";
import { colorForLabel } from "./labelColors";

type Mode = "lap" | "session" | "strategy";

const MODE_LABELS: Record<Mode, string> = {
  lap: "Single lap",
  session: "Multi-lap session",
  strategy: "Race strategy",
};

const MODE_BLURBS: Record<Mode, string> = {
  lap: "Condition, corner map and tyre call from one lap of footage.",
  session:
    "Wetness compared lap over lap -- a trend over time, not over track position.",
  strategy:
    "Simulate every pit plan over a real race distance. Upload footage to factor live conditions in.",
};

function App() {
  const [track, setTrack] = useState<Track | null>(null);
  const [circuits, setCircuits] = useState<CircuitSummary[]>([]);
  const [circuitId, setCircuitId] = useState("silverstone");
  const [mode, setMode] = useState<Mode>("lap");

  const [report, setReport] = useState<StrategistReport | null>(null);
  const [session, setSession] = useState<SessionReport | null>(null);
  const [strategy, setStrategy] = useState<StrategyReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTrack()
      .then(setTrack)
      .catch((e) => setError(`Could not reach backend: ${e.message}`));
    getCircuits()
      .then(setCircuits)
      .catch(() => {
        /* circuit data is optional -- the single-lap flow works without it */
      });
  }, []);

  function clearResults() {
    setReport(null);
    setSession(null);
    setStrategy(null);
  }

  async function run(fn: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    clearResults();
    await run(async () => {
      if (mode === "lap") setReport(await analyzeLap(file));
      else if (mode === "session") setSession(await analyzeSession(file, circuitId));
      else setStrategy(await planStrategy(circuitId, file));
    });
  }

  async function handleDryStrategy() {
    clearResults();
    await run(async () => setStrategy(await planStrategy(circuitId, null)));
  }

  const selected = circuits.find((c) => c.circuit_id === circuitId);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="bg-gray-900 text-white px-6 py-4">
        <h1 className="text-xl font-bold">TrackPulse</h1>
        <p className="text-sm text-gray-400">
          Pit wall copilot - {track ? track.name : "loading..."}
        </p>
      </header>

      <main className="max-w-4xl mx-auto p-6 flex flex-col gap-6">
        <section className="rounded-lg border border-gray-300 bg-white p-6">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  clearResults();
                }}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{MODE_BLURBS[mode]}</p>

          {mode !== "lap" && circuits.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-xs uppercase tracking-wide text-gray-500">Circuit</div>
              <div className="flex flex-wrap gap-2">
                {circuits.map((c) => (
                  <button
                    key={c.circuit_id}
                    onClick={() => {
                      setCircuitId(c.circuit_id);
                      clearResults();
                    }}
                    className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                      circuitId === c.circuit_id
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                    }`}
                  >
                    {c.name.replace(/^(Circuit de |Autodromo Nazionale )/, "")}
                  </button>
                ))}
              </div>
              {selected && (
                <p className="mt-2 text-xs text-gray-500">
                  {selected.race_laps} laps - {selected.corner_count} corners - pit loss{" "}
                  {selected.pit_loss_sec}s - SC/VSC {selected.sc_or_vsc_rate_pct}% - rain{" "}
                  {selected.rain_frequency_pct}% of races. All measured from real FastF1 sessions.
                </p>
              )}
            </div>
          )}

          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-8 transition-colors hover:border-gray-400">
            <span className="text-gray-600">
              {loading
                ? "Analyzing..."
                : mode === "strategy"
                  ? "Upload lap footage to factor in live conditions (mp4)"
                  : "Click to upload a lap video (mp4)"}
            </span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFile}
              disabled={loading}
            />
          </label>

          {mode === "strategy" && (
            <button
              onClick={handleDryStrategy}
              disabled={loading}
              className="mt-3 w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              Plan a dry race without footage
            </button>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>

        {strategy && <StrategyBoard report={strategy} />}

        {session && (
          <>
            {session.simulated && (
              <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                SIMULATED SESSION - this footage was constructed for rehearsal, not recorded at a
                real session.
              </div>
            )}
            <section className="rounded-lg border border-gray-300 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Wetness per lap - {session.circuit_name}
              </div>
              <p className="mb-3 mt-1 text-sm text-gray-700">{session.trend.summary}</p>
              <LapTrend report={session} />
              <p className="mt-3 text-xs text-gray-500">
                {session.lap_count} laps from {session.frames.length} frames (
                {session.dropped_non_racing_frames} dropped as non-racing), split at{" "}
                {session.lap_duration_sec}s per lap.
              </p>
            </section>
            <section>
              <RecommendationPanel
                recommendation={session.recommendation}
                safetyCarRisk={session.safety_car_risk}
                strategistNote={session.recommendation.tire_call}
                agentSynthesisUsed={false}
              />
            </section>
          </>
        )}

        {report && (
          <>
            <section className="rounded-lg border border-gray-300 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-gray-500">Current condition</div>
              <div className="mt-2 flex items-center gap-4">
                <img
                  src={mediaUrl(report.current_condition.image_url)}
                  alt="Most recent frame"
                  className="w-40 h-28 object-cover rounded-md border border-gray-200"
                />
                <div>
                  <span
                    className="inline-block rounded px-2 py-1 text-white text-sm font-medium"
                    style={{ backgroundColor: colorForLabel(report.current_condition.label) }}
                  >
                    {report.current_condition.label}
                  </span>
                  <p className="mt-2 text-sm text-gray-600">{report.trend.summary}</p>
                  <p className="text-xs text-gray-400">
                    wetness score: {report.current_condition.wetness_score.toFixed(2)} - rain chance:{" "}
                    {report.forecast.rain_probability_pct}% ({report.forecast.precipitation_mm}mm)
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-300 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                Wetness trend + next-lap forecast
              </div>
              <TrendChart frames={report.frames} forecast={report.forecast} />
              <p className="mt-2 text-xs text-gray-500">
                {report.forecast.forecast_rationale} Projection = measured slope{" "}
                {report.forecast.measured_slope >= 0 ? "+" : ""}
                {report.forecast.measured_slope} + weather{" "}
                {report.forecast.weather_adjustment >= 0 ? "+" : ""}
                {report.forecast.weather_adjustment} per lap.
              </p>
            </section>

            <section className="rounded-lg border border-gray-300 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Corners</div>
              <CornerStrip corners={report.corners} />
            </section>

            <section className="rounded-lg border border-gray-300 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Predicted condition</div>
              <p className="text-xs text-gray-400 mb-3">
                No one can photograph a future lap -- these are the closest real frames from THIS
                lap to the projected wetness score, shown as a reference for what that condition
                would look like, not a real photo of that future lap.
              </p>
              <div className="flex flex-wrap gap-3">
                {report.forecast.reference_frames.map((r) => (
                  <div key={r.lap} className="w-32 overflow-hidden rounded-md border border-gray-200">
                    <img
                      src={mediaUrl(r.reference_image_url)}
                      alt={`Reference for lap ${r.lap}`}
                      className="h-20 w-full object-cover"
                    />
                    <div
                      className="flex flex-col items-center justify-center px-2 py-1 text-white text-xs"
                      style={{ backgroundColor: colorForLabel(r.reference_label) }}
                    >
                      <span className="font-medium">Lap +{r.lap}</span>
                      <span className="opacity-90">
                        {r.reference_label} ({r.projected_wetness.toFixed(2)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <RecommendationPanel
                recommendation={report.recommendation}
                safetyCarRisk={report.safety_car_risk}
                strategistNote={report.strategist_note}
                agentSynthesisUsed={report.agent_synthesis_used}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
