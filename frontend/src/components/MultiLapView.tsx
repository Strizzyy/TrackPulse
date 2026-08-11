import { useState } from "react";
import type { SessionReport } from "../types";
import Panel from "./Panel";
import LapStrip from "./LapStrip";
import CornerAnalyticsTable from "./CornerAnalyticsTable";
import LapTrend from "./LapTrend";
import RecommendationPanel from "./RecommendationPanel";

interface Props {
  session: SessionReport;
}

const TREND_ICON: Record<string, string> = {
  drying: "trending_down",
  wetting: "trending_up",
  stable: "trending_flat",
};

export default function MultiLapView({ session }: Props) {
  const [activeLap, setActiveLap] = useState(session.laps[session.laps.length - 1]?.lap ?? 1);

  return (
    <div className="flex flex-col gap-3">
      {session.simulated && (
        <div className="rounded border border-tertiary-fixed-dim/50 bg-tertiary-fixed-dim/10 px-4 py-3 font-mono-data text-xs font-bold uppercase tracking-wider text-tertiary-fixed-dim">
          Simulated session — rehearsal footage, not a real session
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-surface-container-high pb-3">
        <div>
          <h1 className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface sm:text-4xl">
            Multi-lap<span className="text-outline">_</span>Session <span className="text-surface-variant">/</span>{" "}
            <span className="text-primary-fixed-dim">{session.circuit_name}</span>
          </h1>
          <p className="mt-1 font-mono-data text-[11px] uppercase tracking-widest text-on-surface-variant">
            {session.lap_count} laps · {session.frames.length} frames · {session.dropped_non_racing_frames} dropped
          </p>
        </div>
        <div className="glass-panel flex items-center gap-3 rounded px-4 py-2">
          <span className="material-symbols-outlined text-primary-fixed-dim">
            {TREND_ICON[session.trend.direction] ?? "trending_flat"}
          </span>
          <div>
            <div className="font-mono-data text-[10px] uppercase tracking-widest text-outline">
              Session trend
            </div>
            <div className="font-mono-data text-sm font-semibold text-primary-fixed-dim">
              {session.trend.slope_per_lap >= 0 ? "+" : ""}
              {session.trend.slope_per_lap}/lap measured · {session.trend.direction}
            </div>
            {session.trend.net_slope_per_lap !== undefined && (
              <div className="font-mono-data text-[10px] text-outline">
                net {session.trend.net_slope_per_lap >= 0 ? "+" : ""}
                {session.trend.net_slope_per_lap}/lap incl. weather — drives the call
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono-data text-[11px] uppercase tracking-widest text-primary-fixed-dim">
          <span className="h-1 w-1 rounded-full bg-primary-fixed-dim" /> Lap strip
        </h3>
        <LapStrip laps={session.laps} activeLap={activeLap} onSelectLap={setActiveLap} />
      </div>

      <p className="text-sm text-on-surface-variant">{session.trend.summary}</p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <Panel
          title="Corner analytics: drying line detection"
          className="lg:col-span-8"
          bodyClassName="p-0"
        >
          <CornerAnalyticsTable laps={session.laps} trend={session.trend} />
        </Panel>

        <div className="flex flex-col gap-3 lg:col-span-4">
          <Panel title="Wetness per lap (avg)">
            <LapTrend report={session} />
          </Panel>

          <Panel
            title="Forecast + projection"
            right={
              <span className="font-mono-data text-xs tabular-nums text-on-surface-variant">
                {session.forecast.rain_probability_pct}% rain · {session.forecast.precipitation_mm}mm
              </span>
            }
          >
            <div className="text-sm">
              <span className="font-mono-data text-[10px] uppercase tracking-wider text-outline">
                Next {session.forecast.horizon_laps.length} laps{" "}
              </span>
              <span className="font-mono-data tabular-nums text-on-surface">
                {session.forecast.projected_wetness.slice(0, 6).join(" → ")}
                {session.forecast.projected_wetness.length > 6 && " …"}
              </span>
            </div>
            <p className="mt-2 border-t border-outline-variant/20 pt-2 text-xs text-on-surface-variant">
              {session.forecast.forecast_rationale}
            </p>
          </Panel>
        </div>
      </div>

      <RecommendationPanel
        recommendation={session.recommendation}
        safetyCarRisk={session.safety_car_risk}
        strategistNote={session.recommendation.tire_call}
        agentSynthesisUsed={false}
      />
    </div>
  );
}
