import type { StrategyReport, StrategyOption } from "../types";
import Panel from "./Panel";
import RaceWetnessChart from "./RaceWetnessChart";

interface Props {
  report: StrategyReport;
}

// Pirelli sidewall colours -- the compound is recognisable at a glance without
// reading the label, which is the point of a stint bar.
const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#da291c",
  MEDIUM: "#ffd12e",
  HARD: "#f0f0ec",
  INTERMEDIATE: "#43b02a",
  WET: "#0067ad",
};

const COMPOUND_TEXT: Record<string, string> = {
  MEDIUM: "#15151e",
  HARD: "#15151e",
};

/** Stint lengths drawn to scale, so a plan reads as a shape rather than a string. */
function StintBar({ option, totalLaps }: { option: StrategyOption; totalLaps: number }) {
  return (
    <div className="flex h-7 w-full overflow-hidden rounded-xs border border-carbon-700">
      {option.stints.map((stint) => (
        <div
          key={stint.stint}
          className="flex items-center justify-center font-mono text-xs font-bold tabular-nums"
          style={{
            width: `${(stint.laps / totalLaps) * 100}%`,
            backgroundColor: COMPOUND_COLORS[stint.compound] ?? "#6b7280",
            color: COMPOUND_TEXT[stint.compound] ?? "#ffffff",
          }}
          title={`${stint.compound} for ${stint.laps} laps`}
        >
          {stint.laps}
        </div>
      ))}
    </div>
  );
}

export default function StrategyBoard({ report }: Props) {
  const { strategy, conditions, circuit_inputs, safety_car_risk } = report;
  const projected = report.projected_wetness_by_lap;
  const usingReferenceDeg = circuit_inputs.degradation_in_use === "reference";

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title={`Recommended strategy — ${report.circuit_name}`}
        right={
          <span className="font-mono text-xs tabular-nums text-neutral-500">
            {strategy.candidates_evaluated.toLocaleString()} plans simulated ·{" "}
            {strategy.compounds_considered.join(" / ")}
            {strategy.wet_race && (
              <span className="ml-2 rounded-xs border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 font-bold uppercase text-sky-300">
                wet race
              </span>
            )}
          </span>
        }
      >
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black italic uppercase tracking-tight text-white">
            {strategy.recommended.plan}
          </span>
          <span className="font-mono text-lg tabular-nums text-neutral-400">
            {strategy.recommended.total_time_display}
          </span>
          <span className="text-xs uppercase tracking-wider text-neutral-500">
            {strategy.recommended.stops}-stop · {strategy.total_laps} laps
          </span>
        </div>

        <div className="mt-3">
          <StintBar option={strategy.recommended} totalLaps={strategy.total_laps} />
        </div>

        {strategy.track_position_caveat && (
          <div className="mt-3 rounded-xs border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <span className="font-bold uppercase tracking-wider">Track position: </span>
            {strategy.track_position_caveat}
          </div>
        )}
      </Panel>

      {projected && projected.length > 0 && (
        <Panel
          title="Projected track state across the race"
          right={
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              From the uploaded footage — red lines are the recommended stops
            </span>
          }
        >
          <RaceWetnessChart projected={projected} recommended={strategy.recommended} />
          <p className="mt-2 border-t border-carbon-800 pt-2 text-xs text-neutral-500">
            CLIP measured {conditions.current_wetness} wetness and a{" "}
            {conditions.slope_per_lap}/lap {conditions.direction} trend across{" "}
            {conditions.laps_analyzed} laps of real footage; this curve continues that trend over
            the race distance. It decides which compounds are on the table — intermediates appear
            above 0.35 — and therefore which plan wins.
          </p>
        </Panel>
      )}

      <Panel
        title="Safety car window"
        right={
          <span className="font-mono text-xs tabular-nums text-neutral-500">
            base rate {safety_car_risk.base_rate_pct}% over{" "}
            {safety_car_risk.sessions_analyzed} sessions
          </span>
        }
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="font-mono text-3xl font-bold tabular-nums text-white">
              {safety_car_risk.risk_pct}
            </span>
            <span className="ml-1 text-sm text-neutral-500">% risk</span>
          </div>
          {safety_car_risk.expected_first_sc_lap !== null && (
            <div>
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                First deployment{" "}
              </span>
              <span className="font-mono text-xl font-bold tabular-nums text-white">
                ~L{Math.round(safety_car_risk.expected_first_sc_lap)}
              </span>
              {safety_car_risk.sc_window_laps && (
                <span className="ml-2 font-mono text-sm tabular-nums text-neutral-400">
                  window L{safety_car_risk.sc_window_laps[0]}–L
                  {safety_car_risk.sc_window_laps[1]}
                </span>
              )}
            </div>
          )}
        </div>
        {safety_car_risk.sc_timing_note && (
          <p className="mt-3 text-sm text-neutral-500">{safety_car_risk.sc_timing_note}</p>
        )}
      </Panel>

      <Panel
        title="Best plan per stop count"
        right={
          <span className="text-xs uppercase tracking-wider text-neutral-500">
            The gap matters more than the winner
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          {strategy.best_per_stop_count.map((option) => (
            <div key={option.stops} className="flex items-center gap-3">
              <div className="w-16 shrink-0 text-xs font-bold uppercase tracking-wider text-neutral-400">
                {option.stops}-stop
              </div>
              <div className="min-w-0 flex-1">
                <StintBar option={option} totalLaps={strategy.total_laps} />
              </div>
              <div className="w-24 shrink-0 text-right font-mono text-sm tabular-nums">
                {option.delta_to_best_sec === 0 ? (
                  <span className="font-bold text-emerald-300">BEST</span>
                ) : (
                  <span className="text-neutral-400">+{option.delta_to_best_sec}s</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-carbon-800 pt-2 text-xs text-neutral-500">
          A few seconds over a race distance is inside the noise of one safety car or a bad
          out-lap.
        </p>
      </Panel>

      {strategy.ranked.length > 1 && (
        <Panel
          title="Closest alternatives"
          right={
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              {strategy.tyre_life_enforced
                ? "Stint lengths capped by real observed tyre life"
                : "Tyre-life cap lifted — stint lengths are optimistic"}
            </span>
          }
          bodyClassName="px-4 py-2"
        >
          {strategy.ranked.map((option, i) => (
            <div
              key={`${option.plan}-${i}`}
              className="flex items-center justify-between border-b border-carbon-800 py-1.5 text-sm last:border-b-0"
            >
              <span className="font-mono font-bold tabular-nums text-neutral-200">
                {option.plan}
              </span>
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                {option.stops}-stop
              </span>
              <span className="font-mono tabular-nums text-neutral-400">
                {option.total_time_display}
              </span>
              <span className="w-20 text-right font-mono tabular-nums">
                {option.delta_to_best_sec === 0 ? (
                  <span className="font-bold text-emerald-300">BEST</span>
                ) : (
                  <span className="text-neutral-500">+{option.delta_to_best_sec}s</span>
                )}
              </span>
            </div>
          ))}
        </Panel>
      )}

      <Panel
        title="Tyre degradation"
        right={
          <span
            className={`rounded-xs border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
              usingReferenceDeg
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            simulating on {circuit_inputs.degradation_in_use} values
          </span>
        }
        bodyClassName="px-4 py-3"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {Object.entries(circuit_inputs.degradation ?? {}).map(([compound, values]) => (
            <div key={compound} className="text-sm">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                {compound}{" "}
              </span>
              <span className="font-mono tabular-nums text-neutral-200">
                {values.s_per_lap}s/lap
              </span>
              <span className="ml-1 font-mono text-xs tabular-nums text-neutral-600">
                (n={values.samples})
              </span>
            </div>
          ))}
        </div>
        {usingReferenceDeg && (
          <p className="mt-3 rounded-xs border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <span className="font-bold uppercase tracking-wider">Measured, not used: </span>
            {circuit_inputs.degradation_note} The figures above are what real stint data produced;
            the simulation runs on reference degradation instead, so it does not claim to be
            driven by measured per-circuit wear.
          </p>
        )}
      </Panel>

      <Panel title="Inputs" bodyClassName="px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm tabular-nums sm:grid-cols-3">
          <div>
            <span className="font-sans text-xs uppercase tracking-wider text-neutral-500">
              Base lap{" "}
            </span>
            {circuit_inputs.avg_lap_time_sec}s
          </div>
          <div>
            <span className="font-sans text-xs uppercase tracking-wider text-neutral-500">
              Pit loss{" "}
            </span>
            {circuit_inputs.pit_loss_sec}s
          </div>
          <div>
            <span className="font-sans text-xs uppercase tracking-wider text-neutral-500">
              SC/VSC rate{" "}
            </span>
            {circuit_inputs.sc_or_vsc_rate_pct}%
          </div>
        </div>

        <div className="mt-3 border-t border-carbon-800 pt-2 text-sm text-neutral-400">
          <span className="text-xs uppercase tracking-wider text-neutral-500">Conditions: </span>
          {conditions.source}
          {conditions.direction && (
            <>
              {" "}
              — wetness{" "}
              <span className="font-mono tabular-nums text-neutral-200">
                {conditions.current_wetness}
              </span>{" "}
              and {conditions.direction} ({conditions.slope_per_lap}/lap across{" "}
              {conditions.laps_analyzed} laps of footage)
            </>
          )}
        </div>

        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          {circuit_inputs.source}. {strategy.note}
        </p>
      </Panel>
    </div>
  );
}
