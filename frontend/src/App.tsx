import { useEffect, useRef, useState } from "react";
import { analyzeLap, getTrack, mediaUrl } from "./api";
import type { StrategistReport, Track } from "./types";
import TrendChart from "./components/TrendChart";
import CornerStrip from "./components/CornerStrip";
import RecommendationPanel from "./components/RecommendationPanel";
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

function App() {
  const [track, setTrack] = useState<Track | null>(null);
  const [report, setReport] = useState<StrategistReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getTrack()
      .then(setTrack)
      .catch((e) => setError(`Could not reach backend: ${e.message}`));
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeLap(file);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

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
              {track ? track.name : "Loading track..."}
            </span>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
              Session
            </div>
            <div className="text-sm font-bold uppercase tracking-wider text-white">
              Post-Lap Strategist Read
            </div>
          </div>
        </div>
      </header>

      {/* toolbar */}
      <div className="border-b border-carbon-700 bg-carbon-850">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="rounded-sm bg-f1-red px-4 py-2 text-sm font-bold uppercase tracking-[0.15em] text-white transition-colors hover:bg-f1-red-dark disabled:opacity-60"
          >
            {loading ? "Analyzing lap..." : "Load lap video"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFile}
            disabled={loading}
          />
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
        {!report && !loading && (
          <Panel title="Awaiting telemetry" bodyClassName="p-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 p-12 transition-colors hover:bg-carbon-800"
            >
              <span className="text-base font-bold uppercase tracking-[0.2em] text-neutral-200">
                Load a lap video to begin
              </span>
              <span className="text-sm uppercase tracking-widest text-neutral-500">
                MP4 onboard footage · condition trend · forecast · pit call
              </span>
            </button>
          </Panel>
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
                <DataRow label="Wetness score" value={report.current_condition.wetness_score.toFixed(2)} />
                <DataRow label="Trend" value={report.trend.direction} />
                <DataRow label="Trend slope" value={report.trend.slope.toFixed(4)} />
                <DataRow label="Rain probability" value={`${report.forecast.rain_probability_pct}%`} />
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
