import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SessionReport } from "../types";
import { chipStyleForLabel, colorForLabel } from "../labelColors";
import { mediaUrl } from "../api";

interface Props {
  report: SessionReport;
}

/**
 * Wetness per LAP. This is the chart the problem statement actually asks for
 * ("a trend over time -- better or worse?"). The single-lap chart plots wetness
 * against seconds within one lap, where time and track position are the same
 * axis, so its slope describes the circuit's layout rather than the weather.
 */
export default function LapTrend({ report }: Props) {
  const data = report.laps.map((lap) => ({
    lap: lap.lap,
    wetness: lap.avg_wetness,
    label: lap.label,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" vertical={false} />
            <XAxis
              dataKey="lap"
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(v: number) => `L${v}`}
            />
            <YAxis domain={[0, 1]} stroke="#6b7280" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#15151e",
                border: "1px solid #3a3a45",
                borderRadius: 2,
                color: "#e5e5e5",
              }}
              formatter={(value, _name, entry) => [
                `${Number(value).toFixed(3)} (${entry.payload.label})`,
                "wetness",
              ]}
              labelFormatter={(v) => `Lap ${v}`}
            />
            <Bar dataKey="wetness" radius={[3, 3, 0, 0]}>
              {data.map((row) => (
                <Cell key={row.lap} fill={colorForLabel(row.label)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-2">
        {report.laps.map((lap) => (
          <div
            key={lap.lap}
            className="w-24 overflow-hidden rounded-sm border border-carbon-700 bg-carbon-900"
          >
            <img
              src={mediaUrl(lap.image_url)}
              alt={`Lap ${lap.lap}`}
              className="h-14 w-full object-cover"
            />
            <div
              className="px-1 py-0.5 text-center font-mono text-[11px] font-bold tabular-nums"
              style={chipStyleForLabel(lap.label)}
            >
              L{lap.lap} · {lap.avg_wetness.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
