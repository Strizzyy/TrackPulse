import type { Recommendation, SafetyCarRisk } from "../types";
import Panel from "./Panel";

interface Props {
  recommendation: Recommendation;
  safetyCarRisk: SafetyCarRisk;
  strategistNote: string;
  agentSynthesisUsed: boolean;
}

const URGENCY_TEXT: Record<string, string> = {
  low: "text-emerald-300",
  medium: "text-amber-300",
  high: "text-red-300",
};

const URGENCY_CHIP: Record<string, string> = {
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  high: "border-f1-red/60 bg-f1-red/10 text-red-300",
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
        right={
          <span
            className={`rounded-xs border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${urgencyChip}`}
          >
            {recommendation.urgency} urgency
          </span>
        }
      >
        <div className={`text-xl font-black italic uppercase leading-tight ${urgencyText}`}>
          {recommendation.tire_call}
        </div>
        <dl className="mt-3 text-sm">
          <div className="flex justify-between border-b border-carbon-800 py-2">
            <dt className="uppercase tracking-wider text-neutral-500">Compound</dt>
            <dd className="font-semibold uppercase text-neutral-200">{recommendation.compound}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="uppercase tracking-wider text-neutral-500">Pit window</dt>
            <dd className="font-mono tabular-nums text-neutral-200">
              L{recommendation.pit_window_laps.join(" – L")}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Safety car risk">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-4xl font-bold tabular-nums text-white">
            {safetyCarRisk.risk_pct}
          </span>
          <span className="text-base text-neutral-500">%</span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-carbon-700">
          <div className="h-2 rounded-full bg-f1-red" style={{ width: `${riskPct}%` }} />
        </div>
        <p className="mt-3 text-sm text-neutral-500">{safetyCarRisk.rationale}</p>
      </Panel>

      <Panel
        title="Radio call"
        right={
          <span
            className={`rounded-xs border px-2 py-0.5 text-xs font-bold uppercase tracking-wider ${
              agentSynthesisUsed
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-carbon-600 bg-carbon-800 text-neutral-400"
            }`}
          >
            {agentSynthesisUsed ? "CrewAI agent" : "Rule-based"}
          </span>
        }
      >
        <p className="text-base italic leading-relaxed text-neutral-200">"{strategistNote}"</p>
      </Panel>
    </div>
  );
}
