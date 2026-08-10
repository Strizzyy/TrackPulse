import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StrategyOption } from "../types";

interface Props {
  projected: number[];
  recommended: StrategyOption;
}

// Matches the dry/wet cutoffs in backend trend.py, so the bands on this chart
// mean the same thing as the labels everywhere else in the app.
const DRY_CUTOFF = 0.35;
const WET_CUTOFF = 0.65;

/**
 * Projected track wetness across the race, with the recommended pit stops
 * marked on it.
 *
 * This is the chart that shows WHY a strategy changed: the wetness curve comes
 * from the CLIP read of the uploaded footage, extrapolated forward, and it is
 * what puts intermediates on the table and moves the stop laps. Without it the
 * strategy board asserts a recommendation with its evidence off-screen.
 */
export default function RaceWetnessChart({ projected, recommended }: Props) {
  const data = projected.map((wetness, i) => ({ lap: i + 1, wetness }));

  // Cumulative stint boundaries = the laps we're recommending a stop on.
  const stopLaps: number[] = [];
  let lap = 0;
  recommended.stints.forEach((stint, i) => {
    lap += stint.laps;
    if (i < recommended.stints.length - 1) stopLaps.push(lap);
  });

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="wetFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" vertical={false} />
          <XAxis
            dataKey="lap"
            stroke="#6b7280"
            fontSize={11}
            tickFormatter={(v: number) => `L${v}`}
            interval="preserveStartEnd"
          />
          <YAxis domain={[0, 1]} stroke="#6b7280" fontSize={11} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#15151e",
              border: "1px solid #3a3a45",
              borderRadius: 2,
              color: "#e5e5e5",
            }}
            formatter={(value) => [Number(value).toFixed(3), "projected wetness"]}
            labelFormatter={(v) => `Lap ${v}`}
          />

          <ReferenceLine
            y={WET_CUTOFF}
            stroke="#38bdf8"
            strokeDasharray="4 4"
            label={{ value: "wet", position: "insideTopLeft", fill: "#38bdf8", fontSize: 10 }}
          />
          <ReferenceLine
            y={DRY_CUTOFF}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: "dry", position: "insideBottomLeft", fill: "#f59e0b", fontSize: 10 }}
          />

          {stopLaps.map((stopLap) => (
            <ReferenceLine
              key={stopLap}
              x={stopLap}
              stroke="#e10600"
              strokeWidth={2}
              label={{ value: `BOX L${stopLap}`, position: "top", fill: "#e10600", fontSize: 10 }}
            />
          ))}

          <Area
            type="monotone"
            dataKey="wetness"
            stroke="#38bdf8"
            strokeWidth={2}
            fill="url(#wetFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
