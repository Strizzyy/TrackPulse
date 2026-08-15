import type { JobProgress } from "../api";

interface Props {
  progress: JobProgress | null;
  /** Which flow is running -- picks the stage wording. */
  mode: "lap" | "session" | "strategy";
}

const STAGE_LABEL: Record<string, string> = {
  queued: "Queued",
  uploading: "Uploading footage",
  extracting: "Extracting frames",
  scoring: "CLIP scoring frames",
  analysing: "Building the read",
  simulating: "Simulating pit strategies",
  done: "Done",
};

const STAGE_ORDER = ["uploading", "extracting", "scoring", "analysing"];

/**
 * Real progress for a running analysis -- driven by GET /api/progress/{job_id},
 * which the backend updates per stage and per CLIP-scored frame. Shows the
 * percentage, the current stage, and frame counts during scoring (the slow
 * part), so a 60-120s wait reads as motion rather than a hang.
 */
export default function AnalysisProgress({ progress, mode }: Props) {
  const stage = progress?.stage ?? "queued";
  const pct = Math.max(2, Math.min(100, progress?.pct ?? 0));
  const scoring = stage === "scoring" && (progress?.total ?? 0) > 0;
  const finalStage = mode === "strategy" ? "simulating" : "analysing";
  const stages = [...STAGE_ORDER.slice(0, 3), finalStage];
  const activeIdx = Math.max(0, stages.indexOf(stage === "done" ? finalStage : stage));

  return (
    <div className="glass-panel tactical-border w-full rounded-lg p-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary-fixed-dim" />
          <span className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-on-surface">
            {STAGE_LABEL[stage] ?? "Processing"}
          </span>
          {scoring && (
            <span className="font-mono-data text-xs tabular-nums text-on-surface-variant">
              frame {progress!.done} / {progress!.total}
            </span>
          )}
        </div>
        <span className="font-mono-data text-2xl font-bold tabular-nums text-primary-fixed-dim">
          {Math.round(pct)}
          <span className="text-sm text-outline">%</span>
        </span>
      </div>

      {/* bar */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary-fixed-dim transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
        {/* moving sheen so it reads as alive even between updates */}
        <div
          className="pointer-events-none absolute inset-y-0 w-24 opacity-40"
          style={{
            left: `calc(${pct}% - 6rem)`,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
            transition: "left 500ms ease-out",
          }}
        />
      </div>

      {/* stage ticks */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {stages.map((s, i) => {
          const state = i < activeIdx || stage === "done" ? "done" : i === activeIdx ? "active" : "todo";
          return (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  state === "done"
                    ? "bg-primary-fixed-dim"
                    : state === "active"
                      ? "animate-pulse bg-primary-fixed"
                      : "bg-outline-variant/50"
                }`}
              />
              <span
                className={`truncate font-mono-data text-[10px] uppercase tracking-widest ${
                  state === "todo" ? "text-outline" : "text-on-surface-variant"
                }`}
              >
                {STAGE_LABEL[s]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-mono-data text-[10px] uppercase tracking-widest text-outline">
        {mode === "session"
          ? "Multi-lap: up to 120 frames · ~1s per frame on CPU"
          : mode === "strategy"
            ? "Reading conditions from footage, then simulating every pit plan"
            : "Single lap: up to 60 frames · ~1s per frame on CPU"}
      </p>
    </div>
  );
}
