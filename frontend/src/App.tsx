import { useEffect, useState } from "react";
import { analyzeLap, getTrack, mediaUrl } from "./api";
import type { StrategistReport, Track } from "./types";
import TrendChart from "./components/TrendChart";
import CornerStrip from "./components/CornerStrip";
import RecommendationPanel from "./components/RecommendationPanel";
import { colorForLabel } from "./labelColors";

function App() {
  const [track, setTrack] = useState<Track | null>(null);
  const [report, setReport] = useState<StrategistReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900">
      <header className="bg-gray-900 text-white px-6 py-4">
        <h1 className="text-xl font-bold">TrackPulse</h1>
        <p className="text-sm text-gray-400">
          {track ? track.name : "Loading track..."} - upload a 1-lap video for a full strategist read
        </p>
      </header>

      <main className="max-w-4xl mx-auto p-6 flex flex-col gap-6">
        <section className="rounded-lg border border-gray-300 bg-white p-6">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-gray-400 transition-colors">
            <span className="text-gray-600">
              {loading ? "Analyzing lap..." : "Click to upload a lap video (mp4)"}
            </span>
            <input type="file" accept="video/*" className="hidden" onChange={handleFile} disabled={loading} />
          </label>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>

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
                    wetness score: {report.current_condition.wetness_score.toFixed(2)} - rain forecast:{" "}
                    {report.forecast.rain_probability_pct}%
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-gray-300 bg-white p-6">
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                Wetness trend + next-lap forecast
              </div>
              <TrendChart frames={report.frames} forecast={report.forecast} />
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
