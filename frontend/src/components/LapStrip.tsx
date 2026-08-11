import type { LapSummary } from "../types";
import { chipStyleForLabel } from "../labelColors";
import { mediaUrl } from "../api";

interface Props {
  laps: LapSummary[];
  activeLap: number;
  onSelectLap: (lap: number) => void;
}

/** Horizontal strip of real per-lap frames -- every thumbnail is an actual
 * representative frame from that lap's footage, not a stock/placeholder image. */
export default function LapStrip({ laps, activeLap, onSelectLap }: Props) {
  return (
    <div className="flex snap-x gap-2 overflow-x-auto pb-2">
      {laps.map((lap) => {
        const isActive = lap.lap === activeLap;
        return (
          <button
            key={lap.lap}
            type="button"
            onClick={() => onSelectLap(lap.lap)}
            className={`glass-panel min-w-[150px] shrink-0 snap-start rounded-lg p-1.5 text-left transition-colors ${
              isActive
                ? "tactical-border border-primary-fixed-dim/50 bg-primary-fixed-dim/5 shadow-[inset_0_0_15px_rgba(0,219,231,0.1)]"
                : "hover:border-primary-fixed-dim/30"
            } ${!lap.complete ? "opacity-60" : ""}`}
          >
            <div className="relative mb-1.5 h-24 overflow-hidden rounded border border-surface-container-highest bg-surface-container-highest">
              <img
                src={mediaUrl(lap.image_url)}
                alt={`Lap ${lap.lap}`}
                className={`h-full w-full object-cover transition-opacity ${isActive ? "opacity-100" : "opacity-70"}`}
              />
              <span
                className={`absolute left-1 top-1 rounded px-1 font-mono-data text-[10px] font-bold ${
                  isActive ? "bg-primary-fixed-dim text-on-primary" : "bg-surface-dim/80 text-on-surface"
                }`}
              >
                L{lap.lap}
              </span>
              {!lap.complete && (
                <span className="absolute bottom-1 right-1 rounded-xs bg-secondary-container/80 px-1 font-mono-data text-[9px] uppercase text-on-secondary-container">
                  partial
                </span>
              )}
            </div>
            <div className="flex items-center justify-between px-0.5">
              <span className="font-mono-data text-[10px] uppercase tracking-wider text-outline">Wetness</span>
              <span
                className="rounded-xs px-1 font-mono-data text-xs font-bold tabular-nums"
                style={chipStyleForLabel(lap.label)}
              >
                {(lap.avg_wetness * 100).toFixed(0)}%
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
