import type { StrategistReport } from "../types";
import { mediaUrl } from "../api";
import { chipStyleForLabel } from "../labelColors";
import Panel from "./Panel";
import TrendChart from "./TrendChart";
import CornerStrip from "./CornerStrip";
import RecommendationPanel from "./RecommendationPanel";

interface Props {
  report: StrategistReport;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/20 py-2 last:border-b-0">
      <span className="font-mono-data text-[11px] uppercase tracking-wider text-outline">{label}</span>
      <span className="font-mono-data text-sm tabular-nums text-on-surface">{value}</span>
    </div>
  );
}

export default function SingleLapView({ report }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-surface-container-high pb-3">
        <div>
          <h1 className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface sm:text-4xl">
            Single<span className="text-outline">_</span>Lap <span className="text-surface-variant">/</span>{" "}
            <span className="text-primary-fixed-dim">{report.circuit_name}</span>
          </h1>
          <p className="mt-1 font-mono-data text-[11px] uppercase tracking-widest text-on-surface-variant">
            {report.frames.length} frames analyzed · {report.dropped_non_racing_frames} non-racing dropped
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel title="Session data" className="xl:col-span-3" bodyClassName="px-4 py-2">
          <DataRow
            label="Condition"
            value={
              <span
                className="rounded-xs px-2 py-0.5 font-mono-data text-xs font-bold uppercase"
                style={chipStyleForLabel(report.current_condition.label)}
              >
                {report.current_condition.label}
              </span>
            }
          />
          <DataRow label="Wetness score" value={report.current_condition.wetness_score.toFixed(2)} />
          <DataRow label="Trend" value={report.trend.direction} />
          <DataRow
            label="Measured slope"
            value={`${report.trend.slope >= 0 ? "+" : ""}${report.trend.slope.toFixed(4)}/lap`}
          />
          <DataRow
            label="Net (incl. weather)"
            value={`${report.trend.net_slope >= 0 ? "+" : ""}${report.trend.net_slope.toFixed(4)}/lap`}
          />
          <DataRow label="Rain probability" value={`${report.forecast.rain_probability_pct}%`} />
          <DataRow label="Avg lap time" value={`${report.forecast.avg_lap_time_sec}s`} />
        </Panel>

        <Panel
          title="Corner analysis"
          className="xl:col-span-5"
          bodyClassName="max-h-96 overflow-y-auto p-0"
        >
          <CornerStrip corners={report.corners} />
        </Panel>

        <Panel title="Latest frame" className="xl:col-span-4" bodyClassName="p-0" tactical>
          <div className="relative">
            <img
              src={mediaUrl(report.current_condition.image_url)}
              alt="Most recent racing frame"
              className="aspect-video w-full object-cover"
            />
            <span
              className="absolute left-2 top-2 rounded-xs px-2 py-0.5 font-mono-data text-xs font-bold uppercase backdrop-blur-sm"
              style={chipStyleForLabel(report.current_condition.label)}
            >
              {report.current_condition.label}
            </span>
            <span className="absolute bottom-2 right-2 rounded-xs bg-obsidian/70 px-2 py-0.5 font-mono-data text-xs tabular-nums text-on-surface">
              T+{report.current_condition.timestamp_sec.toFixed(1)}s
            </span>
          </div>
          <p className="border-t border-outline-variant/20 px-4 py-2.5 text-sm text-on-surface-variant">
            {report.trend.summary}
          </p>
        </Panel>
      </div>

      <Panel title="Wetness trend + next-lap forecast" bodyClassName="p-4">
        <div className="flex gap-3">
          <div className="hidden w-24 shrink-0 pt-8 sm:block">
            <div className="font-headline text-sm font-bold text-on-surface">Wetness</div>
            <div className="font-mono-data text-[10px] uppercase tracking-wider text-outline">score 0–1</div>
          </div>
          <div className="min-w-0 flex-1">
            <TrendChart frames={report.frames} forecast={report.forecast} />
          </div>
        </div>
        <p className="mt-2 border-t border-outline-variant/20 pt-2 text-xs text-on-surface-variant">
          {report.forecast.forecast_rationale}
        </p>
      </Panel>

      <Panel
        title="Forecast references"
        right={
          <span
            title="Closest real frames from this lap matched to each projected wetness level -- not photos of future laps."
            className="cursor-help font-mono-data text-xs uppercase tracking-wider text-on-surface-variant"
          >
            real frames from this lap
          </span>
        }
        bodyClassName="p-4"
      >
        <div className="flex gap-3 overflow-x-auto">
          {report.forecast.reference_frames.map((r) => (
            <div
              key={r.lap}
              className="w-48 shrink-0 overflow-hidden rounded-sm border border-outline-variant/30 bg-surface-container"
            >
              <img
                src={mediaUrl(r.reference_image_url)}
                alt={`Reference for lap ${r.lap}`}
                className="h-28 w-full object-cover"
              />
              <div className="flex items-center justify-between px-2.5 py-2 text-xs">
                <span className="font-mono-data font-bold tabular-nums text-on-surface">LAP +{r.lap}</span>
                <span
                  className="rounded-xs px-2 py-0.5 font-mono-data font-semibold uppercase"
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
    </div>
  );
}
