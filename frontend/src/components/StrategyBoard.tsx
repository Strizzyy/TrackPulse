import { useMemo, useState } from "react";
import type { StrategyReport, StrategyOption } from "../types";
import Panel from "./Panel";
import RaceWetnessChart from "./RaceWetnessChart";

interface Props {
  report: StrategyReport;
}

// Pirelli sidewall colours -- the compound is recognisable at a glance without
// reading the label, which is the point of a stint bar.
const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#ff525c",
  MEDIUM: "#fed83a",
  HARD: "#e5e1e4",
  INTERMEDIATE: "#00dbe7",
  WET: "#00696f",
};

const COMPOUND_TEXT: Record<string, string> = {
  MEDIUM: "#221b00",
  HARD: "#131315",
};

function StintBar({ option, totalLaps }: { option: StrategyOption; totalLaps: number }) {
  return (
    <div className="flex h-7 w-full overflow-hidden rounded-xs border border-outline-variant/40">
      {option.stints.map((stint) => (
        <div
          key={stint.stint}
          className="flex items-center justify-center font-mono-data text-xs font-bold tabular-nums"
          style={{
            width: `${(stint.laps / totalLaps) * 100}%`,
            backgroundColor: COMPOUND_COLORS[stint.compound] ?? "#849495",
            color: COMPOUND_TEXT[stint.compound] ?? "#050506",
          }}
          title={`${stint.compound} for ${stint.laps} laps`}
        >
          {stint.laps}
        </div>
      ))}
    </div>
  );
}

function MiniStintBar({ option, totalLaps }: { option: StrategyOption; totalLaps: number }) {
  return (
    <div className="flex h-full items-center gap-0.5">
      {option.stints.map((stint) => (
        <div
          key={stint.stint}
          className="flex h-4 items-center justify-center rounded-xs border border-outline-variant/30 bg-surface-container"
          style={{ flexBasis: `${(stint.laps / totalLaps) * 100}%`, flexGrow: 1 }}
        >
          <div
            className="h-full w-full rounded-xs border-t-2"
            style={{ borderColor: COMPOUND_COLORS[stint.compound] ?? "#849495" }}
          >
            <span className="flex h-full items-center justify-center font-mono-data text-[10px] text-on-surface">
              {stint.compound[0]}
              {stint.laps}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StrategyBoard({ report }: Props) {
  const { strategy, conditions, circuit_inputs, safety_car_risk } = report;
  const projected = report.projected_wetness_by_lap;
  const usingReferenceDeg = circuit_inputs.degradation_in_use === "reference";

  const candidates = strategy.ranked.slice(0, 6);
  const [selectedPlan, setSelectedPlan] = useState(candidates[0]?.plan ?? strategy.recommended.plan);
  const [accepted, setAccepted] = useState(false);
  const selected = candidates.find((c) => c.plan === selectedPlan) ?? strategy.recommended;

  // Not a probabilistic confidence score -- there isn't one to report. This is
  // a real, derived "how close to the fastest simulated plan" measure so the
  // bar means something concrete instead of implying an ML confidence that
  // was never computed.
  const maxDelta = useMemo(
    () => Math.max(1, ...candidates.map((c) => c.delta_to_best_sec)),
    [candidates],
  );
  const vsOptimalPct = (option: StrategyOption) =>
    option.delta_to_best_sec === 0 ? 100 : Math.max(8, Math.round(100 * (1 - option.delta_to_best_sec / maxDelta)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4 border-b border-surface-container-high pb-3">
        <div>
          <h1 className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface sm:text-4xl">
            Race<span className="text-outline">_</span>Strategy <span className="text-surface-variant">/</span>{" "}
            <span className="text-primary-fixed-dim">{report.circuit_name}</span>
          </h1>
          <p className="mt-1 font-mono-data text-[11px] uppercase tracking-widest text-on-surface-variant">
            {strategy.total_laps} laps · {conditions.source}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Panel
          title="Strategy board"
          tactical
          className="xl:col-span-8"
          bodyClassName="flex flex-col gap-1 p-3"
          right={
            <span className="flex items-center gap-2 font-mono-data text-xs tabular-nums text-on-surface-variant">
              {strategy.candidates_evaluated.toLocaleString()} plans simulated
              {strategy.wet_race && (
                <span className="rounded-xs border border-primary-fixed-dim/40 bg-primary-fixed-dim/10 px-2 py-0.5 font-bold uppercase text-primary-fixed-dim">
                  wet race
                </span>
              )}
            </span>
          }
        >
          <div className="grid grid-cols-12 gap-2 border-b border-outline-variant/40 px-2 py-1.5">
            <div className="col-span-2 font-mono-data text-[10px] uppercase tracking-widest text-primary-fixed-dim">
              Plan
            </div>
            <div className="col-span-4 font-mono-data text-[10px] uppercase tracking-widest text-primary-fixed-dim">
              Stint projection
            </div>
            <div className="col-span-2 text-right font-mono-data text-[10px] uppercase tracking-widest text-primary-fixed-dim">
              Race time
            </div>
            <div className="col-span-3 text-right font-mono-data text-[10px] uppercase tracking-widest text-primary-fixed-dim">
              vs optimal
            </div>
            <div className="col-span-1 text-center font-mono-data text-[10px] uppercase tracking-widest text-primary-fixed-dim">
              Act
            </div>
          </div>

          {candidates.map((option, i) => {
            const isSelected = option.plan === selectedPlan;
            return (
              <button
                key={`${option.plan}-${i}`}
                type="button"
                onClick={() => {
                  setSelectedPlan(option.plan);
                  setAccepted(false);
                }}
                className={`grid grid-cols-12 items-center gap-2 rounded px-2 py-2 text-left transition-colors ${
                  isSelected
                    ? "border border-primary-fixed-dim/40 bg-primary-fixed-dim/10"
                    : "border border-transparent hover:border-outline-variant/30 hover:bg-white/5"
                }`}
              >
                <div className="col-span-2 flex flex-col">
                  <span
                    className={`font-mono-data text-sm font-bold uppercase tabular-nums ${isSelected ? "text-primary-fixed-dim" : "text-on-surface"}`}
                  >
                    {option.delta_to_best_sec === 0 ? "OPTIMAL" : `PLAN ${i}`}
                  </span>
                  <span className="font-mono-data text-[11px] text-outline">{option.stops}-stop</span>
                </div>
                <div className="col-span-4 h-6">
                  <MiniStintBar option={option} totalLaps={strategy.total_laps} />
                </div>
                <div className="col-span-2 text-right font-mono-data text-sm font-bold tabular-nums text-on-surface">
                  {option.total_time_display}
                </div>
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-container">
                    <div
                      className={`h-full ${option.delta_to_best_sec === 0 ? "bg-primary-fixed-dim" : "bg-tertiary-fixed-dim"}`}
                      style={{ width: `${vsOptimalPct(option)}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono-data text-xs tabular-nums text-on-surface-variant">
                    {option.delta_to_best_sec === 0 ? "BEST" : `+${option.delta_to_best_sec}s`}
                  </span>
                </div>
                <div className="col-span-1 flex justify-center">
                  <span
                    className={`material-symbols-outlined text-[18px] ${isSelected ? "text-primary-fixed-dim" : "text-outline"}`}
                  >
                    {isSelected ? "radio_button_checked" : "radio_button_unchecked"}
                  </span>
                </div>
              </button>
            );
          })}
        </Panel>

        <Panel title="Pit wall notes" className="xl:col-span-4" bodyClassName="flex flex-col gap-4 p-4">
          <div>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="font-headline text-2xl font-black uppercase text-on-surface">
                {selected.plan}
              </span>
              <span className="font-mono-data text-sm tabular-nums text-on-surface-variant">
                {selected.total_time_display}
              </span>
            </div>
            <StintBar option={selected} totalLaps={strategy.total_laps} />
          </div>

          {strategy.track_position_caveat && (
            <div className="rounded-xs border-l-2 border-tertiary-fixed-dim bg-surface-container p-3">
              <span className="font-mono-data text-[10px] font-bold uppercase tracking-wider text-tertiary-fixed-dim">
                Track position
              </span>
              <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
                {strategy.track_position_caveat}
              </p>
            </div>
          )}

          <p className="text-xs leading-relaxed text-on-surface-variant">{strategy.note}</p>

          <div className="mt-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setAccepted(true)}
              className={`flex w-full items-center justify-center gap-2 rounded border py-2.5 font-headline text-sm font-bold uppercase tracking-widest transition-all ${
                accepted
                  ? "border-primary-fixed-dim bg-primary-fixed-dim/20 text-primary-fixed-dim"
                  : "border-primary-fixed-dim/60 bg-primary-fixed-dim/10 text-primary-fixed-dim hover:bg-primary-fixed-dim/20"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              {accepted ? `Plan ${selected.plan} accepted` : `Accept ${selected.plan}`}
            </button>
            <button
              type="button"
              onClick={() => setAccepted(false)}
              className="w-full rounded border border-outline-variant py-2 font-mono-data text-xs uppercase tracking-widest text-on-surface-variant transition-colors hover:border-outline hover:text-on-surface"
            >
              Manual override
            </button>
            <p className="text-center text-[10px] text-outline">
              Kept in this browser tab only -- not sent anywhere. The human strategist stays the
              decision-maker.
            </p>
          </div>
        </Panel>
      </div>

      {projected && projected.length > 0 && (
        <Panel
          title="Projected track state across the race"
          right={
            <span className="font-mono-data text-xs uppercase tracking-wider text-on-surface-variant">
              From the uploaded footage -- red lines are the selected plan's stops
            </span>
          }
        >
          <RaceWetnessChart projected={projected} recommended={selected} />
          <p className="mt-2 border-t border-outline-variant/20 pt-2 text-xs text-on-surface-variant">
            CLIP measured {conditions.current_wetness} wetness and a {conditions.slope_per_lap}/lap{" "}
            {conditions.direction} trend across {conditions.laps_analyzed} laps of real footage; this
            curve continues that trend over the race distance. It decides which compounds are on the
            table -- intermediates appear above 0.35 -- and therefore which plan wins.
          </p>
        </Panel>
      )}

      <Panel
        title="Safety car window"
        right={
          <span className="font-mono-data text-xs tabular-nums text-on-surface-variant">
            base rate {safety_car_risk.base_rate_pct}% over {safety_car_risk.sessions_analyzed} sessions
          </span>
        }
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="font-mono-data text-3xl font-bold tabular-nums text-secondary-container">
              {safety_car_risk.risk_pct}
            </span>
            <span className="ml-1 text-sm text-on-surface-variant">% risk</span>
          </div>
          {safety_car_risk.expected_first_sc_lap !== null && (
            <div>
              <span className="font-mono-data text-[11px] uppercase tracking-wider text-outline">
                First deployment{" "}
              </span>
              <span className="font-mono-data text-xl font-bold tabular-nums text-on-surface">
                ~L{Math.round(safety_car_risk.expected_first_sc_lap)}
              </span>
              {safety_car_risk.sc_window_laps && (
                <span className="ml-2 font-mono-data text-sm tabular-nums text-on-surface-variant">
                  window L{safety_car_risk.sc_window_laps[0]}–L{safety_car_risk.sc_window_laps[1]}
                </span>
              )}
            </div>
          )}
        </div>
        {safety_car_risk.sc_timing_note && (
          <p className="mt-3 text-sm text-on-surface-variant">{safety_car_risk.sc_timing_note}</p>
        )}
      </Panel>

      <Panel
        title="Best plan per stop count"
        right={
          <span className="font-mono-data text-xs uppercase tracking-wider text-on-surface-variant">
            The gap matters more than the winner
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          {strategy.best_per_stop_count.map((option) => (
            <div key={option.stops} className="flex items-center gap-3">
              <div className="w-16 shrink-0 font-mono-data text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                {option.stops}-stop
              </div>
              <div className="min-w-0 flex-1">
                <StintBar option={option} totalLaps={strategy.total_laps} />
              </div>
              <div className="w-24 shrink-0 text-right font-mono-data text-sm tabular-nums">
                {option.delta_to_best_sec === 0 ? (
                  <span className="font-bold text-primary-fixed-dim">BEST</span>
                ) : (
                  <span className="text-on-surface-variant">+{option.delta_to_best_sec}s</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-outline-variant/20 pt-2 text-xs text-on-surface-variant">
          A few seconds over a race distance is inside the noise of one safety car or a bad out-lap.
        </p>
      </Panel>

      <Panel
        title="Honest degradation"
        right={
          <span
            className={`rounded-xs border px-2 py-0.5 font-mono-data text-xs font-bold uppercase tracking-wider ${
              usingReferenceDeg
                ? "border-tertiary-fixed-dim/40 bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim"
                : "border-primary-fixed-dim/40 bg-primary-fixed-dim/10 text-primary-fixed-dim"
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
        {usingReferenceDeg && (
          <p className="mt-3 rounded-xs border border-tertiary-fixed-dim/40 bg-tertiary-fixed-dim/10 p-3 text-sm text-tertiary-fixed">
            <span className="font-bold uppercase tracking-wider">Measured, not used: </span>
            {circuit_inputs.degradation_note} The figures above are what real stint data produced;
            the simulation runs on reference degradation instead, so it does not claim to be
            driven by measured per-circuit wear.
          </p>
        )}
      </Panel>

      <Panel title="Inputs" bodyClassName="px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono-data text-sm tabular-nums sm:grid-cols-3">
          <div>
            <span className="font-body text-xs uppercase tracking-wider text-outline">Base lap </span>
            {circuit_inputs.avg_lap_time_sec}s
          </div>
          <div>
            <span className="font-body text-xs uppercase tracking-wider text-outline">Pit loss </span>
            {circuit_inputs.pit_loss_sec}s
          </div>
          <div>
            <span className="font-body text-xs uppercase tracking-wider text-outline">SC/VSC rate </span>
            {circuit_inputs.sc_or_vsc_rate_pct}%
          </div>
        </div>

        <div className="mt-3 border-t border-outline-variant/20 pt-2 text-sm text-on-surface-variant">
          <span className="font-mono-data text-[11px] uppercase tracking-wider text-outline">
            Conditions:{" "}
          </span>
          {conditions.source}
          {conditions.direction && (
            <>
              {" "}
              — wetness{" "}
              <span className="font-mono-data tabular-nums text-on-surface">{conditions.current_wetness}</span>{" "}
              and {conditions.direction} ({conditions.slope_per_lap}/lap across {conditions.laps_analyzed}{" "}
              laps of footage)
            </>
          )}
        </div>

        <p className="mt-2 text-xs leading-relaxed text-outline">
          {circuit_inputs.source}. {strategy.note}
        </p>
      </Panel>
    </div>
  );
}
