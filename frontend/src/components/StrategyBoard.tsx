import type { StrategyReport, StrategyOption } from "../types";

interface Props {
  report: StrategyReport;
}

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#dc2626",
  MEDIUM: "#eab308",
  HARD: "#e5e7eb",
  INTERMEDIATE: "#16a34a",
  WET: "#2563eb",
};

const COMPOUND_TEXT: Record<string, string> = {
  HARD: "#111827",
};

/** Stint lengths drawn to scale, so a plan reads as a shape rather than a string. */
function StintBar({ option, totalLaps }: { option: StrategyOption; totalLaps: number }) {
  return (
    <div className="flex h-7 w-full overflow-hidden rounded border border-gray-300">
      {option.stints.map((stint) => (
        <div
          key={stint.stint}
          className="flex items-center justify-center text-xs font-medium"
          style={{
            width: `${(stint.laps / totalLaps) * 100}%`,
            backgroundColor: COMPOUND_COLORS[stint.compound] ?? "#9ca3af",
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
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-gray-300 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Recommended strategy</div>
            <div className="mt-1 text-2xl font-bold">{strategy.recommended.plan}</div>
            <div className="text-sm text-gray-600">
              {strategy.recommended.stops}-stop - {strategy.recommended.total_time_display} over{" "}
              {strategy.total_laps} laps
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>{strategy.candidates_evaluated.toLocaleString()} strategies simulated</div>
            <div>{strategy.compounds_considered.join(" / ")}</div>
            {strategy.wet_race && (
              <div className="mt-1 inline-block rounded bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
                wet race
              </div>
            )}
          </div>
        </div>

        <div className="mt-4">
          <StintBar option={strategy.recommended} totalLaps={strategy.total_laps} />
        </div>

        {strategy.track_position_caveat && (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">Track position: </span>
            {strategy.track_position_caveat}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-300 bg-white p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500">Best plan per stop count</div>
        <p className="mb-3 mt-1 text-xs text-gray-500">
          The gap matters more than the winner -- a few seconds over a race distance is inside the
          noise of a safety car or one bad out-lap.
        </p>
        <div className="flex flex-col gap-3">
          {strategy.best_per_stop_count.map((option) => (
            <div key={option.stops} className="flex items-center gap-3">
              <div className="w-16 shrink-0 text-sm font-medium">{option.stops}-stop</div>
              <div className="flex-1">
                <StintBar option={option} totalLaps={strategy.total_laps} />
              </div>
              <div className="w-28 shrink-0 text-right text-sm tabular-nums">
                {option.delta_to_best_sec === 0 ? (
                  <span className="font-semibold text-emerald-700">best</span>
                ) : (
                  <span className="text-gray-600">+{option.delta_to_best_sec}s</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-300 bg-white p-6">
        <div className="text-xs uppercase tracking-wide text-gray-500">Inputs</div>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <span className="text-gray-500">Base lap </span>
            {circuit_inputs.avg_lap_time_sec}s
          </div>
          <div>
            <span className="text-gray-500">Pit loss </span>
            {circuit_inputs.pit_loss_sec}s
          </div>
          <div>
            <span className="text-gray-500">SC/VSC rate </span>
            {circuit_inputs.sc_or_vsc_rate_pct}%
          </div>
        </div>
        <div className="mt-3 text-sm">
          <span className="text-gray-500">Track conditions: </span>
          {conditions.source}
          {conditions.direction && (
            <>
              {" "}
              - wetness {conditions.current_wetness} and {conditions.direction} (
              {conditions.slope_per_lap}/lap across {conditions.laps_analyzed} laps of footage)
            </>
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {circuit_inputs.source}. {strategy.note}
        </p>
      </div>
    </div>
  );
}
