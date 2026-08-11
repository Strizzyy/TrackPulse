import type { CircuitDetail } from "../types";
import Panel from "./Panel";
import TrackMap from "./TrackMap";

interface Props {
  circuit: CircuitDetail;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono-data text-[10px] uppercase tracking-[0.2em] text-outline">{label}</span>
      <span className="font-mono-data text-lg font-bold tabular-nums text-on-surface">{value}</span>
    </div>
  );
}

/**
 * Everything here comes straight from GET /api/circuits/{id} -- static data
 * built offline from real FastF1 race sessions (build_circuit_data.py), not
 * a live prediction. Shown as soon as a circuit is picked, before the user
 * chooses single-lap/multi-lap/strategy mode or loads any footage, so the
 * "measured vs modelled" story is visible up front rather than buried inside
 * a strategy run.
 */
export default function CircuitIntel({ circuit }: Props) {
  const usingReferenceDeg = circuit.degradation_confidence === "low";
  const compounds = Object.entries(circuit.degradation ?? {});

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4 border-b border-surface-container-high pb-3">
        <div>
          <h1 className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface sm:text-4xl">
            Circuit<span className="text-outline">_</span>Intel{" "}
            <span className="text-surface-variant">/</span>{" "}
            <span className="text-primary-fixed-dim">{circuit.name}</span>
          </h1>
          <p className="mt-1 flex items-center gap-2 font-mono-data text-[11px] uppercase tracking-widest text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-fixed-dim" />
            Historical analysis active -- {circuit.source}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel title="Tactical map" tactical className="xl:col-span-8" bodyClassName="p-4">
          <div className="h-[340px] w-full rounded border border-outline-variant/20 bg-surface-container-lowest/60 p-4">
            <TrackMap circuitId={circuit.circuit_id} corners={circuit.corners} outline={circuit.track_outline} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-outline-variant/20 pt-4 sm:grid-cols-6">
            <Stat label="Race laps" value={circuit.race_laps ?? "—"} />
            <Stat
              label="Lap distance"
              value={circuit.lap_distance_m ? `${(circuit.lap_distance_m / 1000).toFixed(2)}km` : "—"}
            />
            <Stat label="Avg lap" value={circuit.avg_lap_time_sec ? `${circuit.avg_lap_time_sec}s` : "—"} />
            <Stat label="Pit loss" value={circuit.pit_loss_sec ? `${circuit.pit_loss_sec}s` : "—"} />
            <Stat
              label="Rain freq."
              value={circuit.rain_frequency_pct != null ? `${circuit.rain_frequency_pct}%` : "—"}
            />
            <Stat label="Corners" value={circuit.corner_count} />
          </div>
        </Panel>

        <div className="flex flex-col gap-3 xl:col-span-4">
          <Panel
            title="Historical SC windows"
            right={<span className="material-symbols-outlined text-[16px] text-outline">warning</span>}
          >
            <div className="mb-4 flex flex-col items-center py-2 text-center">
              <span className="font-headline text-5xl font-black leading-none text-secondary-container">
                {circuit.sc_or_vsc_rate_pct ?? "—"}
                <span className="text-2xl">%</span>
              </span>
              <span className="mt-1 font-mono-data text-[11px] uppercase tracking-widest text-on-surface-variant">
                of races see a SC/VSC
              </span>
            </div>
            {circuit.avg_first_deployment_lap != null && (
              <div className="flex h-9 items-center justify-between border-l-2 border-secondary-container bg-surface-container px-3">
                <span className="font-mono-data text-xs text-on-surface">Avg first deployment</span>
                <span className="font-mono-data text-xs font-bold text-secondary-container">
                  lap {circuit.avg_first_deployment_lap}
                </span>
              </div>
            )}
            <p className="mt-3 text-xs text-on-surface-variant">
              Base rate from {circuit.sessions_analyzed ?? "—"} real seasons of race history.
            </p>
          </Panel>
        </div>
      </div>

      <Panel
        title="Honest degradation"
        right={
          <span
            title={
              usingReferenceDeg
                ? `${circuit.degradation_note ?? ""} The figures shown are always the real measured values; this badge says whether the simulator trusts them or falls back to a reference curve.`
                : "Measured degradation is monotonic across compounds -- the strategy simulator runs on these real numbers directly."
            }
            className={`cursor-help rounded-xs border px-2 py-0.5 font-mono-data text-[11px] font-bold uppercase tracking-wider ${
              usingReferenceDeg
                ? "border-tertiary-fixed-dim/40 bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim"
                : "border-primary-fixed-dim/40 bg-primary-fixed-dim/10 text-primary-fixed-dim"
            }`}
          >
            strategy sim uses {usingReferenceDeg ? "reference" : "measured"} values
          </span>
        }
        bodyClassName="p-4"
      >
        {compounds.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {compounds.map(([compound, values]) => (
              <div key={compound} className="text-sm">
                <span className="font-mono-data text-[11px] uppercase tracking-wider text-outline">
                  {compound}{" "}
                </span>
                <span className="font-mono-data tabular-nums text-on-surface">{values.s_per_lap}s/lap</span>
                <span className="ml-1 font-mono-data text-xs tabular-nums text-outline">
                  (n={values.samples})
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">No degradation data measured for this circuit.</p>
        )}
      </Panel>
    </div>
  );
}
