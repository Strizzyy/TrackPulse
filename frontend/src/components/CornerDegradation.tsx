import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CircuitDetail, CircuitDetailCorner } from "../types";
import { officialCornerName } from "../cornerNames";
import Panel from "./Panel";

interface Props {
  circuit: CircuitDetail;
}

// F1's universal compound identity colors (also .compound-* in index.css).
// Each is a SINGLE series in its own small-multiple panel -- identity is
// carried by the panel header text+chip, never color alone -- and all three
// pass CVD separation and >=3:1 contrast on the obsidian surface
// (validated with the dataviz palette script; the categorical-set lightness
// band doesn't apply to one-hue-per-panel small multiples).
const COMPOUND_COLOR: Record<string, string> = {
  SOFT: "#ff525c",
  MEDIUM: "#fed83a",
  HARD: "#e5e1e4",
};
const COMPOUND_ORDER = ["SOFT", "MEDIUM", "HARD"];

// Mirror of race_sim.py DEFAULT_DEG_S_PER_LAP: when a circuit's measured
// degradation is non-monotonic (confidence "low"), the strategy simulator
// runs on this reference curve instead -- so this chart must too, or the
// bars would show hard biting more than medium, which the sim itself
// rejects as a regression artefact.
const REFERENCE_DEG_S_PER_LAP: Record<string, number> = {
  SOFT: 0.11,
  MEDIUM: 0.07,
  HARD: 0.045,
};

interface Row {
  turn: number;
  label: string;
  official: string | null;
  ms: number;
  corner: CircuitDetailCorner;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const c = row.corner;
  return (
    <div className="rounded border border-outline-variant/40 bg-surface-container-lowest/95 p-2 shadow-lg">
      <div className="mb-1 border-b border-outline-variant/30 pb-1 font-mono-data text-[10px] font-bold uppercase tracking-wider text-on-surface">
        Turn {row.turn}
        {row.official && <span className="text-primary-fixed-dim"> — {row.official}</span>}
      </div>
      <div className="flex flex-col gap-0.5 font-mono-data text-[10px] text-on-surface-variant">
        <span>
          <span className="font-bold text-on-surface">{row.ms.toFixed(1)} ms</span> lost per lap ·{" "}
          {(c.wear_share! * 100).toFixed(1)}% of wear
        </span>
        <span>
          Load: {c.load_brake_pct}% braking · {c.load_traction_pct}% traction · {c.load_lateral_pct}% lateral
        </span>
        {c.apex_speed_kmh != null && <span>Apex {c.apex_speed_kmh} km/h ({c.speed_class})</span>}
      </div>
    </div>
  );
}

/**
 * Turn-by-turn expected tyre degradation, one small-multiple panel per dry
 * compound. The per-corner DISTRIBUTION is the telemetry wear model (braking
 * + traction + lateral friction work, see corner_wear_note); the per-lap
 * TOTAL each panel spreads over corners is that compound's measured s/lap
 * from real stints. Shared y-scale across panels so soft vs hard magnitude
 * is comparable at a glance.
 */
export default function CornerDegradation({ circuit }: Props) {
  const corners = (circuit.corners ?? []).filter((c) => c.wear_share != null);
  const usingReference = circuit.degradation_confidence === "low";
  // Same values the strategy simulator runs on (race_sim.compound_degradation):
  // measured s/lap when trustworthy, the reference curve when not.
  const sPerLapFor = (key: string): number | null => {
    if (usingReference) return REFERENCE_DEG_S_PER_LAP[key] ?? null;
    const measured = circuit.degradation?.[key]?.s_per_lap;
    return measured != null && measured > 0 ? measured : null;
  };
  const compounds = COMPOUND_ORDER.filter((k) => sPerLapFor(k) != null);
  if (corners.length === 0 || compounds.length === 0) return null;

  const rowsFor = (sPerLap: number): Row[] =>
    corners.map((c) => ({
      turn: c.number,
      label: String(c.number),
      official: officialCornerName(circuit.circuit_id, c.number),
      ms: c.wear_share! * sPerLap * 1000,
      corner: c,
    }));

  // Top wear corners (compound-independent -- the distribution is shared).
  const topShares = [...corners].sort((a, b) => b.wear_share! - a.wear_share!).slice(0, 3);
  const topTurns = new Set(topShares.map((c) => c.number));

  // One y-domain across panels, from the highest-degrading compound.
  const maxShare = Math.max(...corners.map((c) => c.wear_share!));
  const maxSPerLap = Math.max(...compounds.map((k) => sPerLapFor(k)!));
  const yMax = Math.ceil(maxShare * maxSPerLap * 1000 * 1.15);

  return (
    <Panel
      title="Turn-by-turn tyre stress"
      tactical
      bodyClassName="p-4"
      right={
        <span
          title={`${circuit.corner_wear_note ?? ""}${
            usingReference
              ? " Per-lap totals are the reference curve (soft > medium > hard) -- the same values the strategy simulator runs on, because this circuit's measured degradation came out non-monotonic across compounds."
              : " Per-lap totals are this circuit's measured degradation -- the same values the strategy simulator runs on."
          }`}
          className={`cursor-help rounded-xs border px-2 py-0.5 font-mono-data text-[10px] font-bold uppercase tracking-wider ${
            usingReference
              ? "border-tertiary-fixed-dim/40 bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim"
              : "border-primary-fixed-dim/40 bg-primary-fixed-dim/10 text-primary-fixed-dim"
          }`}
        >
          load model × {usingReference ? "reference" : "measured"} deg — as simulated
        </span>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono-data text-[10px] uppercase tracking-[0.2em] text-outline">
          Biggest biters
        </span>
        {topShares.map((c) => (
          <span
            key={c.number}
            className="rounded border border-secondary-container/40 bg-secondary-container/10 px-2 py-0.5 font-mono-data text-[11px] font-semibold text-secondary-container"
          >
            T{c.number}
            {officialCornerName(circuit.circuit_id, c.number) && (
              <span> {officialCornerName(circuit.circuit_id, c.number)}</span>
            )}{" "}
            · {(c.wear_share! * 100).toFixed(0)}%
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {compounds.map((key) => {
          const sPerLap = sPerLapFor(key)!;
          const rows = rowsFor(sPerLap);
          const color = COMPOUND_COLOR[key];
          return (
            <div key={key} className="rounded border border-outline-variant/15 bg-surface-container-lowest/60 p-2">
              <div className="mb-1 flex items-baseline justify-between px-1">
                <span className={`compound-${key.toLowerCase()} rounded-xs border px-1.5 py-0.5 font-mono-data text-[10px] font-bold uppercase tracking-wider`}>
                  {key}
                </span>
                <span className="font-mono-data text-[10px] tabular-nums text-on-surface-variant">
                  {sPerLap}s/lap {usingReference ? "reference" : "measured"} · ms lost/lap by corner
                </span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 14, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
                    <XAxis
                      dataKey="label"
                      interval={0}
                      tickLine={false}
                      axisLine={{ stroke: "#3a494b" }}
                      tick={{ fill: "#849495", fontSize: 9 }}
                    />
                    <YAxis
                      domain={[0, yMax]}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "#849495", fontSize: 9 }}
                    />
                    <Tooltip cursor={{ fill: "#ffffff", fillOpacity: 0.04 }} content={<ChartTooltip />} />
                    <Bar dataKey="ms" radius={[3, 3, 0, 0]} maxBarSize={14} isAnimationActive={false}>
                      {rows.map((row) => (
                        <Cell key={row.turn} fill={color} fillOpacity={topTurns.has(row.turn) ? 0.95 : 0.45} />
                      ))}
                      <LabelList
                        dataKey="ms"
                        content={(props) => {
                          const { x, y, width, value, index } = props as {
                            x?: number; y?: number; width?: number; value?: number; index?: number;
                          };
                          if (index == null || !topTurns.has(rows[index].turn)) return null;
                          return (
                            <text
                              x={(x ?? 0) + (width ?? 0) / 2}
                              y={(y ?? 0) - 4}
                              textAnchor="middle"
                              fill="#b9cacb"
                              fontSize={9}
                              fontFamily="inherit"
                            >
                              {Number(value).toFixed(0)}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>

    </Panel>
  );
}
