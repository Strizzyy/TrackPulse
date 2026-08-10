import { useEffect, useRef, useState } from "react";
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
import Panel from "./components/Panel";
import { chipStyleForLabel } from "./labelColors";

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-carbon-800 py-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-neutral-500">{label}</span>
      <span className="font-mono text-sm tabular-nums text-neutral-200">{value}</span>
    </div>
  );
}

type Mode = "lap" | "session" | "strategy";

const MODE_LABELS: Record<Mode, string> = {
  lap: "Single lap",
  session: "Multi-lap session",
  strategy: "Race strategy",
};

const MODE_BLURBS: Record<Mode, string> = {
  lap: "Condition, corner map and tyre call from one lap of footage.",
  session: "Wetness compared lap over lap — a trend over time, not over track position.",
  strategy:
    "Simulate every pit plan over a real race distance. Load footage to factor live conditions in.",
};

const UPLOAD_LABELS: Record<Mode, string> = {
  lap: "Load lap video",
  session: "Load session video",
  strategy: "Load footage for conditions",
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Reset the input so re-picking the same file fires onChange again.
    e.target.value = "";
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
  const nothingLoaded = !report && !session && !strategy && !loading;

  return (
    <div className="min-h-screen bg-carbon-900 text-neutral-200">
      <header className="border-b border-carbon-700 bg-carbon-950">
        <div className="h-1 bg-f1-red" />
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">
              Track<span className="text-f1-red">Pulse</span>
            </h1>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 sm:inline">
              {selected ? selected.name : track ? track.name : "Loading track..."}
            </span>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
              Mode
            </div>
            <div className="text-sm font-bold uppercase tracking-wider text-white">
              {MODE_LABELS[mode]}
            </div>
          </div>
        </div>
      </header>

      {/* toolbar */}
      <div className="border-b border-carbon-700 bg-carbon-850">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2">
          {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                clearResults();
              }}
              className={`rounded-sm px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] transition-colors ${
                mode === m
                  ? "bg-f1-red text-white"
                  : "border border-carbon-600 bg-carbon-800 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}

          <span className="ml-auto" />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="rounded-sm bg-f1-red px-4 py-2 text-sm font-bold uppercase tracking-[0.15em] text-white transition-colors hover:bg-f1-red-dark disabled:opacity-60"
          >
            {loading ? "Analyzing..." : UPLOAD_LABELS[mode]}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFile}
            disabled={loading}
          />
          {mode === "strategy" && (
            <button
              type="button"
              onClick={handleDryStrategy}
              disabled={loading}
              className="rounded-sm border border-carbon-600 bg-carbon-800 px-4 py-2 text-sm font-bold uppercase tracking-[0.15em] text-neutral-300 transition-colors hover:text-white disabled:opacity-60"
            >
              Plan dry race
            </button>
          )}
        </div>

        {/* circuit picker -- strategy and session are per-circuit, single lap is not */}
        {mode !== "lap" && circuits.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-carbon-800 px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
              Circuit
            </span>
            {circuits.map((c) => (
              <button
                key={c.circuit_id}
                type="button"
                onClick={() => {
                  setCircuitId(c.circuit_id);
                  clearResults();
                }}
                className={`rounded-sm border px-2.5 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${
                  circuitId === c.circuit_id
                    ? "border-f1-red bg-f1-red/10 text-red-300"
                    : "border-carbon-600 bg-carbon-800 text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {c.name.replace(/^(Circuit de |Autodromo Nazionale |Suzuka )/, "")}
              </button>
            ))}
            {selected && (
              <span className="font-mono text-xs tabular-nums text-neutral-500">
                {selected.race_laps} laps · {selected.corner_count} corners · pit loss{" "}
                {selected.pit_loss_sec}s · SC/VSC {selected.sc_or_vsc_rate_pct}% · rain{" "}
                {selected.rain_frequency_pct}% — all from real FastF1 sessions
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 px-4 pb-2">
          <span className="text-xs uppercase tracking-wider text-neutral-500">
            {MODE_BLURBS[mode]}
          </span>
          {loading && (
            <span className="animate-pulse text-sm font-semibold uppercase tracking-[0.15em] text-f1-red">
              Processing frames — CLIP scoring in progress
            </span>
          )}
          {report && !loading && (
            <span className="font-mono text-sm tabular-nums text-neutral-500">
              {report.frames.length} frames analyzed · {report.dropped_non_racing_frames} non-racing
              dropped · session {report.session_id.slice(0, 8)}
            </span>
          )}
          {error && <span className="text-sm font-semibold text-f1-red">{error}</span>}
        </div>
      </div>

      <main className="flex flex-col gap-3 p-4">
        {nothingLoaded && (
          <Panel title="Awaiting telemetry" bodyClassName="p-0">
            <button
              type="button"
              onClick={() =>
                mode === "strategy" ? handleDryStrategy() : fileInputRef.current?.click()
              }
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 p-12 transition-colors hover:bg-carbon-800"
            >
              <span className="text-base font-bold uppercase tracking-[0.2em] text-neutral-200">
                {mode === "strategy"
                  ? "Plan a race, or load footage for live conditions"
                  : "Load a lap video to begin"}
              </span>
              <span className="text-sm uppercase tracking-widest text-neutral-500">
                {mode === "strategy"
                  ? "Real degradation · pit loss · safety car history · every stop plan simulated"
                  : "MP4 onboard footage · condition trend · forecast · pit call"}
              </span>
            </button>
          </Panel>
        )}

        {strategy && <StrategyBoard report={strategy} />}

        {session && (
          <>
            {session.simulated && (
              <div className="rounded-sm border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm font-bold uppercase tracking-wider text-amber-300">
                Simulated session — this footage was constructed for rehearsal, not recorded at a
                real session
              </div>
            )}
            <Panel
              title={`Wetness per lap — ${session.circuit_name}`}
              right={
                <span className="font-mono text-xs tabular-nums text-neutral-500">
                  {session.lap_count} laps · {session.frames.length} frames ·{" "}
                  {session.dropped_non_racing_frames} dropped · {session.lap_duration_sec}s/lap
                </span>
              }
            >
              <p className="mb-3 text-sm text-neutral-400">{session.trend.summary}</p>
              <LapTrend report={session} />
            </Panel>

            {/* Session mode computes a forecast too -- it was being dropped on
                the floor while lap mode showed it. */}
            <Panel
              title="Weather forecast + projection"
              right={
                <span className="font-mono text-xs tabular-nums text-neutral-500">
                  {session.forecast.rain_probability_pct}% rain ·{" "}
                  {session.forecast.precipitation_mm}mm
                </span>
              }
            >
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-xs uppercase tracking-wider text-neutral-500">
                    Next {session.forecast.horizon_laps.length} laps{" "}
                  </span>
                  <span className="font-mono tabular-nums text-neutral-200">
                    {session.forecast.projected_wetness.slice(0, 6).join(" → ")}
                    {session.forecast.projected_wetness.length > 6 && " …"}
                  </span>
                </div>
              </div>
              <p className="mt-2 border-t border-carbon-800 pt-2 text-xs text-neutral-500">
                {session.forecast.forecast_rationale} Projection = measured slope{" "}
                {session.forecast.measured_slope >= 0 ? "+" : ""}
                {session.forecast.measured_slope} + weather{" "}
                {session.forecast.weather_adjustment >= 0 ? "+" : ""}
                {session.forecast.weather_adjustment} per lap.
              </p>
            </Panel>

            <RecommendationPanel
              recommendation={session.recommendation}
              safetyCarRisk={session.safety_car_risk}
              strategistNote={session.recommendation.tire_call}
              agentSynthesisUsed={false}
            />
          </>
        )}

        {report && (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
              <Panel title="Session data" className="lg:col-span-3" bodyClassName="px-4 py-2">
                <DataRow
                  label="Condition"
                  value={
                    <span
                      className="rounded-xs px-2 py-0.5 text-xs font-bold uppercase"
                      style={chipStyleForLabel(report.current_condition.label)}
                    >
                      {report.current_condition.label}
                    </span>
                  }
                />
                <DataRow
                  label="Wetness score"
                  value={report.current_condition.wetness_score.toFixed(2)}
                />
                <DataRow label="Trend" value={report.trend.direction} />
                <DataRow label="Trend slope" value={report.trend.slope.toFixed(4)} />
                <DataRow
                  label="Rain probability"
                  value={`${report.forecast.rain_probability_pct}%`}
                />
                <DataRow label="Avg lap time" value={`${report.forecast.avg_lap_time_sec}s`} />
                <DataRow label="Frames analyzed" value={report.frames.length} />
                <DataRow label="Frames dropped" value={report.dropped_non_racing_frames} />
              </Panel>

              <Panel
                title="Corner analysis"
                className="lg:col-span-5"
                bodyClassName="max-h-96 overflow-y-auto p-0"
              >
                <CornerStrip corners={report.corners} />
              </Panel>

              <Panel title="Latest frame" className="lg:col-span-4" bodyClassName="p-0">
                <div className="relative">
                  <img
                    src={mediaUrl(report.current_condition.image_url)}
                    alt="Most recent racing frame"
                    className="aspect-video w-full object-cover"
                  />
                  <span
                    className="absolute left-2 top-2 rounded-xs px-2 py-0.5 text-xs font-bold uppercase backdrop-blur-sm"
                    style={chipStyleForLabel(report.current_condition.label)}
                  >
                    {report.current_condition.label}
                  </span>
                  <span className="absolute bottom-2 right-2 rounded-xs bg-black/70 px-2 py-0.5 font-mono text-xs tabular-nums text-white">
                    T+{report.current_condition.timestamp_sec.toFixed(1)}s
                  </span>
                </div>
                <p className="border-t border-carbon-700 px-4 py-2.5 text-sm text-neutral-400">
                  {report.trend.summary}
                </p>
              </Panel>
            </div>

            <Panel title="Wetness trend + next-lap forecast" bodyClassName="p-4">
              <div className="flex gap-3">
                <div className="hidden w-24 shrink-0 pt-8 sm:block">
                  <div className="text-sm font-bold text-neutral-200">Wetness</div>
                  <div className="text-xs uppercase tracking-wider text-neutral-500">score 0–1</div>
                </div>
                <div className="min-w-0 flex-1">
                  <TrendChart frames={report.frames} forecast={report.forecast} />
                </div>
              </div>
              {/* The projection is arithmetic, not a model -- show both terms. */}
              <p className="mt-2 border-t border-carbon-800 pt-2 text-xs text-neutral-500">
                {report.forecast.forecast_rationale} Projection = measured slope{" "}
                {report.forecast.measured_slope >= 0 ? "+" : ""}
                {report.forecast.measured_slope} + weather{" "}
                {report.forecast.weather_adjustment >= 0 ? "+" : ""}
                {report.forecast.weather_adjustment} per lap.
              </p>
            </Panel>

            <Panel
              title="Forecast references"
              right={
                <span className="text-xs uppercase tracking-wider text-neutral-500">
                  Closest real frames from this lap — not photos of future laps
                </span>
              }
              bodyClassName="p-4"
            >
              <div className="flex gap-3 overflow-x-auto">
                {report.forecast.reference_frames.map((r) => (
                  <div
                    key={r.lap}
                    className="w-48 shrink-0 overflow-hidden rounded-sm border border-carbon-700 bg-carbon-900"
                  >
                    <img
                      src={mediaUrl(r.reference_image_url)}
                      alt={`Reference for lap ${r.lap}`}
                      className="h-28 w-full object-cover"
                    />
                    <div className="flex items-center justify-between px-2.5 py-2 text-xs">
                      <span className="font-mono font-bold tabular-nums text-neutral-200">
                        LAP +{r.lap}
                      </span>
                      <span
                        className="rounded-xs px-2 py-0.5 font-semibold uppercase"
                        style={chipStyleForLabel(r.reference_label)}
                      >
                        {r.reference_label} {r.projected_wetness.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <RecommendationPanel
              recommendation={report.recommendation}
              safetyCarRisk={report.safety_car_risk}
              strategistNote={report.strategist_note}
              agentSynthesisUsed={report.agent_synthesis_used}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
