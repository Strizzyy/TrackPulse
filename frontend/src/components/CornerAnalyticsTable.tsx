import { useMemo } from "react";
import type { LapSummary, SessionTrend } from "../types";
import { colorForLabel } from "../labelColors";

interface Props {
  laps: LapSummary[];
  trend: SessionTrend;
}

const DRY_CUTOFF = 0.35;

interface CornerRow {
  corner: string;
  label: string;
  perLap: Record<number, number | undefined>;
  estDryLap: string;
}

/** Pivots the real per-lap, per-corner wetness readings (session.laps[].corners)
 * into a corner x lap grid -- "is the drying line arriving here yet?" is exactly
 * what the multi-lap trend is measuring, corner by corner rather than as one
 * lap-wide average. */
export default function CornerAnalyticsTable({ laps, trend }: Props) {
  const { rows, lapNumbers } = useMemo(() => {
    const lapNumbers = laps.map((l) => l.lap);
    const order: string[] = [];
    const byCorner: Record<string, { perLap: Record<number, number>; label: string }> = {};

    for (const lap of laps) {
      for (const corner of lap.corners) {
        if (!byCorner[corner.corner]) {
          byCorner[corner.corner] = { perLap: {}, label: corner.label };
          order.push(corner.corner);
        }
        byCorner[corner.corner].perLap[lap.lap] = corner.avg_wetness;
        byCorner[corner.corner].label = corner.label;
      }
    }

    const lastLap = lapNumbers[lapNumbers.length - 1];
    const rows: CornerRow[] = order.map((corner) => {
      const entry = byCorner[corner];
      const lastKnownLap = [...lapNumbers].reverse().find((l) => entry.perLap[l] !== undefined);
      const lastKnownWetness = lastKnownLap !== undefined ? entry.perLap[lastKnownLap] : undefined;

      let estDryLap = "—";
      if (lastKnownWetness !== undefined) {
        if (lastKnownWetness < DRY_CUTOFF) {
          estDryLap = "Dry";
        } else if (trend.direction === "drying" && trend.slope_per_lap < 0) {
          const lapsAhead = Math.ceil((lastKnownWetness - DRY_CUTOFF) / -trend.slope_per_lap);
          estDryLap = `L${(lastKnownLap ?? lastLap) + lapsAhead}`;
        }
      }

      return { corner, label: entry.label, perLap: entry.perLap, estDryLap };
    });

    return { rows, lapNumbers };
  }, [laps, trend]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="h-9 border-b border-outline-variant/40 font-mono-data text-[10px] uppercase tracking-widest text-primary-fixed-dim">
            <th className="px-3 font-medium">Corner</th>
            {lapNumbers.map((lap) => (
              <th key={lap} className="px-3 font-medium">
                L{lap}
              </th>
            ))}
            <th className="px-3 font-medium">Est. dry</th>
          </tr>
        </thead>
        <tbody className="font-mono-data text-sm text-on-surface">
          {rows.map((row, i) => (
            <tr
              key={row.corner}
              className={`h-9 border-b border-outline-variant/20 transition-colors hover:bg-white/5 ${
                i % 2 === 1 ? "bg-white/[0.02]" : ""
              }`}
            >
              <td className="flex items-center gap-2 px-3">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForLabel(row.label) }}
                />
                {row.corner}
              </td>
              {lapNumbers.map((lap) => {
                const value = row.perLap[lap];
                return (
                  <td key={lap} className="px-3 tabular-nums text-on-surface-variant">
                    {value !== undefined ? (
                      <span style={{ color: colorForLabel(value >= 0.65 ? "wet" : value >= DRY_CUTOFF ? "damp" : "dry") }}>
                        {(value * 100).toFixed(0)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                );
              })}
              <td className="px-3 tabular-nums text-on-surface-variant">{row.estDryLap}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
