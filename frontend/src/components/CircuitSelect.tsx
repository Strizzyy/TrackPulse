import type { CircuitSummary } from "../types";
import { outlineToPath, trackShapeFor } from "../trackShapes";

interface Props {
  circuits: CircuitSummary[];
  error: string | null;
  onSelect: (circuitId: string) => void;
}

function CardStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono-data text-[9px] uppercase tracking-[0.2em] text-outline">{label}</span>
      <span className="font-mono-data text-sm font-bold tabular-nums text-on-surface">{value}</span>
    </div>
  );
}

/**
 * Landing screen: pick a circuit before anything else. Each card draws the
 * real racing-line outline (track_outline from FastF1 telemetry) when the
 * summary carries it, falling back to the stylized schematic otherwise.
 */
export default function CircuitSelect({ circuits, error, onSelect }: Props) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 border-b border-surface-container-high pb-4">
        <h1 className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface sm:text-4xl">
          Select<span className="text-outline">_</span>Circuit
        </h1>
        <p className="mt-1 flex items-center gap-2 font-mono-data text-[11px] uppercase tracking-widest text-on-surface-variant">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-fixed-dim" />
          Real FastF1 race history · 2019–2025
        </p>
      </div>

      {circuits.length === 0 && (
        <div className="glass-panel rounded-lg p-10 text-center">
          <span className="font-mono-data text-xs uppercase tracking-widest text-on-surface-variant">
            {error ?? "Loading circuits…"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {circuits.map((c) => {
          const d = outlineToPath(c.track_outline, 400, 260, 24) ?? trackShapeFor(c.circuit_id);
          return (
            <button
              key={c.circuit_id}
              type="button"
              onClick={() => onSelect(c.circuit_id)}
              className="group glass-panel flex flex-col rounded-lg border border-outline-variant/20 p-4 text-left transition-all hover:border-primary-fixed-dim/60 hover:bg-white/5"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-headline text-lg font-bold uppercase tracking-tight text-on-surface group-hover:text-primary-fixed-dim">
                  {c.name}
                </h2>
                <span className="material-symbols-outlined mt-0.5 text-[18px] text-outline transition-colors group-hover:text-primary-fixed-dim">
                  arrow_forward
                </span>
              </div>

              <div className="my-3 h-36 w-full rounded border border-outline-variant/15 bg-surface-container-lowest/60 p-2">
                <svg viewBox="0 0 400 260" className="h-full w-full" fill="none">
                  <path
                    d={d}
                    stroke="var(--color-primary-fixed-dim)"
                    strokeOpacity={0.85}
                    strokeWidth={3}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  <path d={d} stroke="var(--color-primary-fixed-dim)" strokeOpacity={0.12} strokeWidth={12} />
                </svg>
              </div>

              <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                <CardStat label="Race laps" value={c.race_laps ?? "—"} />
                <CardStat label="Avg lap" value={c.avg_lap_time_sec ? `${c.avg_lap_time_sec}s` : "—"} />
                <CardStat label="Pit loss" value={c.pit_loss_sec ? `${c.pit_loss_sec}s` : "—"} />
                <CardStat
                  label="SC/VSC"
                  value={c.sc_or_vsc_rate_pct != null ? `${c.sc_or_vsc_rate_pct}%` : "—"}
                />
                <CardStat
                  label="Rain freq."
                  value={c.rain_frequency_pct != null ? `${c.rain_frequency_pct}%` : "—"}
                />
                <CardStat label="Corners" value={c.corner_count} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
