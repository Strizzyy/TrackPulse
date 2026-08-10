import type { Recommendation, SafetyCarRisk } from "../types";

interface Props {
  recommendation: Recommendation;
  safetyCarRisk: SafetyCarRisk;
  strategistNote: string;
  agentSynthesisUsed: boolean;
}

const URGENCY_STYLES: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  high: "bg-red-100 text-red-800 border-red-300",
};

export default function RecommendationPanel({
  recommendation,
  safetyCarRisk,
  strategistNote,
  agentSynthesisUsed,
}: Props) {
  const urgencyStyle = URGENCY_STYLES[recommendation.urgency] ?? URGENCY_STYLES.low;

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-lg border p-4 ${urgencyStyle}`}>
        <div className="text-xs uppercase tracking-wide opacity-70">Pit wall call</div>
        <div className="text-lg font-semibold">{recommendation.tire_call}</div>
        <div className="mt-1 text-sm opacity-80">
          Compound: {recommendation.compound} - Window: laps {recommendation.pit_window_laps.join("-")} - Urgency: {recommendation.urgency}
        </div>
      </div>

      <div className="rounded-lg border border-gray-300 p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">Safety car risk</div>
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">{safetyCarRisk.risk_pct}%</span>
          {safetyCarRisk.expected_first_sc_lap !== null && (
            <span className="text-sm text-gray-700">
              first deployment expected ~lap{" "}
              <span className="font-semibold">{Math.round(safetyCarRisk.expected_first_sc_lap)}</span>
              {safetyCarRisk.sc_window_laps &&
                ` (laps ${safetyCarRisk.sc_window_laps[0]}-${safetyCarRisk.sc_window_laps[1]})`}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-gray-600">{safetyCarRisk.rationale}</div>
        {safetyCarRisk.sc_timing_note && (
          <div className="mt-1 text-sm text-gray-600">{safetyCarRisk.sc_timing_note}</div>
        )}
      </div>

      <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
          <span>Radio call</span>
          <span className={agentSynthesisUsed ? "text-emerald-600" : "text-gray-400"}>
            {agentSynthesisUsed ? "CrewAI agent" : "rule-based fallback"}
          </span>
        </div>
        <p className="mt-1 italic text-gray-700">"{strategistNote}"</p>
      </div>
    </div>
  );
}
