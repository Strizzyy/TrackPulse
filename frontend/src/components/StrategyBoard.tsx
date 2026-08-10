import type { StrategyReport, StrategyOption } from "../types";
import Panel from "./Panel";

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
  const { strategy, conditions, circuit_inputs } = report;

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
