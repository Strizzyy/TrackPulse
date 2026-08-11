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
import { colorForLabel } from "../labelColors";

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
    complete: lap.complete,
  }));
  const hasPartialLap = report.laps.some((lap) => !lap.complete);

  return (
    <div className="flex flex-col gap-2">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3a494b" vertical={false} />
            <XAxis
              dataKey="lap"
              stroke="#849495"
              fontSize={12}
              tickFormatter={(v: number) => `L${v}`}
            />
            <YAxis domain={[0, 1]} stroke="#849495" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0e0e10",
                border: "1px solid #3a494b",
                borderRadius: 4,
                color: "#e5e1e4",
              }}
              formatter={(value, _name, entry) => [
                `${Number(value).toFixed(3)} (${entry.payload.label}${
                  entry.payload.complete ? "" : " -- partial lap, excluded from trend"
                })`,
                "wetness",
              ]}
              labelFormatter={(v) => `Lap ${v}`}
            />
            <Bar dataKey="wetness" radius={[3, 3, 0, 0]}>
              {data.map((row) => (
                <Cell
                  key={row.lap}
                  fill={colorForLabel(row.label)}
                  fillOpacity={row.complete ? 1 : 0.35}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {hasPartialLap && (
        <p className="font-mono-data text-[11px] text-outline">
          Faded bar(s) are a partial lap -- too few frames to be a real lap average, most likely
          the tail end of the upload. Excluded from the trend fit and from the current-conditions
          read.
        </p>
      )}
    </div>
  );
}
