import type { Recommendation, SafetyCarRisk } from "../types";
import Panel from "./Panel";

interface Props {
  recommendation: Recommendation;
  safetyCarRisk: SafetyCarRisk;
  strategistNote: string;
  agentSynthesisUsed: boolean;
}

const URGENCY_TEXT: Record<string, string> = {
  low: "text-primary-fixed-dim",
  medium: "text-tertiary-fixed-dim",
  high: "text-secondary-container",
};

const URGENCY_CHIP: Record<string, string> = {
  low: "border-primary-fixed-dim/40 bg-primary-fixed-dim/10 text-primary-fixed-dim",
  medium: "border-tertiary-fixed-dim/40 bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim",
  high: "border-secondary-container/50 bg-secondary-container/10 text-secondary-container",
};

export default function RecommendationPanel({
  recommendation,
  safetyCarRisk,
  strategistNote,
  agentSynthesisUsed,
}: Props) {
  const urgencyText = URGENCY_TEXT[recommendation.urgency] ?? URGENCY_TEXT.low;
  const urgencyChip = URGENCY_CHIP[recommendation.urgency] ?? URGENCY_CHIP.low;
  const riskPct = Math.min(100, Math.max(0, safetyCarRisk.risk_pct));

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Panel
        title="Pit wall call"
        tactical
        right={
          <span
            className={`rounded-xs border px-2 py-0.5 font-mono-data text-[11px] font-bold uppercase tracking-wider ${urgencyChip}`}
          >
            {recommendation.urgency} urgency
          </span>
        }
      >
        <div className={`font-headline text-xl font-black uppercase leading-tight ${urgencyText}`}>
          {recommendation.tire_call}
        </div>
        <dl className="mt-3 text-sm">
          <div className="flex justify-between border-b border-outline-variant/20 py-2">
            <dt className="font-mono-data text-[11px] uppercase tracking-wider text-outline">Compound</dt>
            <dd className="font-mono-data font-semibold uppercase text-on-surface">
              {recommendation.compound}
            </dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="font-mono-data text-[11px] uppercase tracking-wider text-outline">Pit window</dt>
            <dd className="font-mono-data tabular-nums text-on-surface">
              L{recommendation.pit_window_laps.join(" – L")}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Safety car risk">
        <div className="flex items-baseline gap-2">
          <span className="font-mono-data text-4xl font-bold tabular-nums text-secondary-container">
            {safetyCarRisk.risk_pct}
          </span>
          <span className="text-base text-on-surface-variant">%</span>
          {safetyCarRisk.expected_first_sc_lap !== null && (
            <span className="ml-auto text-right font-mono-data text-[11px] uppercase tracking-wider text-outline">
              First deployment
              <span className="ml-1 font-mono-data text-sm font-bold tabular-nums text-on-surface">
                ~L{Math.round(safetyCarRisk.expected_first_sc_lap)}
              </span>
              {safetyCarRisk.sc_window_laps && (
                <span className="ml-1 font-mono-data tabular-nums text-on-surface-variant">
                  (L{safetyCarRisk.sc_window_laps[0]}–L{safetyCarRisk.sc_window_laps[1]})
                </span>
              )}
            </span>
          )}
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-surface-container-high">
          <div className="h-2 rounded-full bg-secondary-container" style={{ width: `${riskPct}%` }} />
        </div>
        <p className="mt-3 text-sm text-on-surface-variant">{safetyCarRisk.rationale}</p>
        {safetyCarRisk.sc_timing_note && (
          <p className="mt-1.5 text-sm text-on-surface-variant">{safetyCarRisk.sc_timing_note}</p>
        )}
      </Panel>

      <Panel
        title="Radio call"
        right={
          <span
            className={`rounded-xs border px-2 py-0.5 font-mono-data text-[11px] font-bold uppercase tracking-wider ${
              agentSynthesisUsed
                ? "border-tertiary-fixed-dim/40 bg-tertiary-fixed-dim/10 text-tertiary-fixed-dim"
                : "border-outline-variant/40 bg-surface-container text-on-surface-variant"
            }`}
          >
            {agentSynthesisUsed ? "CrewAI agent" : "Rule-based"}
          </span>
        }
      >
        <p className="font-body text-base italic leading-relaxed text-on-surface">"{strategistNote}"</p>
      </Panel>
    </div>
  );
}
