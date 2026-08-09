import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Forecast, FrameResult } from "../types";

interface Props {
  frames: FrameResult[];
  forecast: Forecast;
}

// Recharts needs one array with both series as optional keys, not two
// separate arrays -- lap history uses "measured", forecast continues on
// "projected" starting where measured left off.
export default function TrendChart({ frames, forecast }: Props) {
  const measured = frames.map((f) => ({
    x: f.timestamp_sec,
    measured: f.wetness_score,
  }));

  const lastTimestamp = frames.length ? frames[frames.length - 1].timestamp_sec : 0;
  const lapTime = forecast.avg_lap_time_sec || 90;
  const projected = forecast.projected_wetness.map((score, i) => ({
    x: lastTimestamp + (i + 1) * lapTime,
    projected: score,
  }));

  // bridge point so the projected line visually connects to the last measured point
  const bridge =
    measured.length > 0
      ? [{ x: measured[measured.length - 1].x, projected: measured[measured.length - 1].measured }]
      : [];

  const data = [...measured, ...bridge, ...projected];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="x"
            tickFormatter={(v: number) => `${Math.round(v)}s`}
            stroke="#6b7280"
            fontSize={12}
          />
          <YAxis domain={[0, 1]} stroke="#6b7280" fontSize={12} />
          <Tooltip
            formatter={(value) => Number(value).toFixed(2)}
            labelFormatter={(v) => `${Math.round(Number(v))}s`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="measured"
            name="Measured (this lap)"
            stroke="#2563eb"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="projected"
            name="Forecast (next laps)"
            stroke="#f59e0b"
            strokeDasharray="5 4"
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
