import { useEffect, useRef, useState } from "react";
import { analyzeLap, analyzeSession, getCircuitDetail, getCircuits, getProgress, newJobId, planStrategy } from "./api";
import type { JobProgress } from "./api";
import type { CircuitDetail, CircuitSummary, SessionReport, StrategistReport, StrategyReport } from "./types";
import { AuthProvider, useAuth, historyKeyFor } from "./auth/AuthContext";
import AuthScreen from "./pages/AuthScreen";
import TopNav from "./components/shell/TopNav";
import SideNav from "./components/shell/SideNav";
import type { Mode, View } from "./components/shell/SideNav";
import Footer from "./components/shell/Footer";
import CircuitIntel from "./components/CircuitIntel";
import CircuitSelect from "./components/CircuitSelect";
import CornerDegradation from "./components/CornerDegradation";
import SingleLapView from "./components/SingleLapView";
import MultiLapView from "./components/MultiLapView";
import StrategyBoard from "./components/StrategyBoard";
import HistoryView from "./components/HistoryView";
import Panel from "./components/Panel";
import AnalysisProgress from "./components/AnalysisProgress";
import { appendHistory, clearHistory, loadHistory } from "./history";
import type { HistoryEntry, HistoryMode } from "./history";

const UPLOAD_LABELS: Record<Mode, string> = {
  lap: "Load lap video",
  session: "Load session video",
  strategy: "Load footage for conditions",
};

function newHistoryId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Workspace() {
  const { user, isGuest, logout } = useAuth();
  const identityKey = historyKeyFor(user);

  const [circuits, setCircuits] = useState<CircuitSummary[]>([]);
  // null = no circuit picked yet -- the selection screen is the landing view.
  const [circuitId, setCircuitId] = useState<string | null>(null);
  const [circuitDetail, setCircuitDetail] = useState<CircuitDetail | null>(null);
  const [mode, setMode] = useState<Mode>("lap");
  const [view, setView] = useState<View>("workspace");

  const [report, setReport] = useState<StrategistReport | null>(null);
  const [session, setSession] = useState<SessionReport | null>(null);
  const [strategy, setStrategy] = useState<StrategyReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendReachable, setBackendReachable] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    getCircuits()
      .then((c) => {
        setCircuits(c);
        setBackendReachable(true);
      })
      .catch((e) => {
        setError(`Could not reach backend: ${e.message}`);
        setBackendReachable(false);
      });
  }, []);

  useEffect(() => {
    setHistoryEntries(loadHistory(identityKey));
  }, [identityKey]);

  useEffect(() => {
    let cancelled = false;
    setCircuitDetail(null);
    if (!circuitId) return;
    getCircuitDetail(circuitId)
      .then((detail) => {
        if (!cancelled) setCircuitDetail(detail);
      })
      .catch(() => {
        /* circuit intel is supplementary -- prediction flows don't depend on it */
      });
    return () => {
      cancelled = true;
    };
  }, [circuitId]);

  function clearResults() {
    setReport(null);
    setSession(null);
    setStrategy(null);
    setError(null);
  }

  // Runs an upload/analysis while polling its live progress (the backend
  // publishes per-stage + per-frame updates under the job_id we hand it).
  async function run(fn: (jobId: string) => Promise<void>) {
    const jobId = newJobId();
    setLoading(true);
    setError(null);
    setProgress({ stage: "uploading", done: 0, total: 0, pct: 0 });
    const poll = window.setInterval(() => {
      getProgress(jobId)
        .then((p) => setProgress(p))
        .catch(() => {
          /* a missed poll is not an error -- the bar just holds its last value */
        });
    }, 500);
    try {
      await fn(jobId);
      setProgress({ stage: "done", done: 0, total: 0, pct: 100 });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      window.clearInterval(poll);
      setLoading(false);
      // Let the bar sit at 100% for a beat before the results replace it.
      window.setTimeout(() => setProgress(null), 400);
    }
  }

  function recordHistory(historyMode: HistoryMode, result: HistoryEntry["result"], summary: string) {
    if (!circuitId) return;
    const entry: HistoryEntry = {
      id: newHistoryId(),
      timestamp: Date.now(),
      mode: historyMode,
      circuitId,
      circuitName: circuitDetail?.name ?? circuitId,
      summary,
      result,
    };
    setHistoryEntries(appendHistory(identityKey, entry));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file fires onChange again.
    e.target.value = "";
    if (!file || !circuitId) return;
    clearResults();
    await run(async (jobId) => {
      if (mode === "lap") {
        const r = await analyzeLap(file, circuitId, jobId);
        setReport(r);
        recordHistory(
          "lap",
          r,
          `${r.current_condition.label} · ${r.current_condition.wetness_score.toFixed(2)} wetness · ${r.recommendation.tire_call}`,
        );
      } else if (mode === "session") {
        const r = await analyzeSession(file, circuitId, undefined, false, jobId);
        setSession(r);
        recordHistory("session", r, `${r.trend.direction} · ${r.lap_count} laps · ${r.recommendation.tire_call}`);
      } else {
        const r = await planStrategy(circuitId, file, undefined, jobId);
        setStrategy(r);
        recordHistory(
          "strategy",
          r,
          `${r.strategy.recommended.plan} · ${r.strategy.recommended.total_time_display}`,
        );
      }
    });
  }

  async function handleDryStrategy() {
    if (!circuitId) return;
    clearResults();
    await run(async () => {
      const r = await planStrategy(circuitId, null);
      setStrategy(r);
      recordHistory(
        "strategy",
        r,
        `${r.strategy.recommended.plan} (dry) · ${r.strategy.recommended.total_time_display}`,
      );
    });
  }

  function openHistoryEntry(entry: HistoryEntry) {
    setCircuitId(entry.circuitId);
    setMode(entry.mode);
    setView("workspace");
    setError(null);
    setReport(entry.mode === "lap" ? (entry.result as StrategistReport) : null);
    setSession(entry.mode === "session" ? (entry.result as SessionReport) : null);
    setStrategy(entry.mode === "strategy" ? (entry.result as StrategyReport) : null);
  }

  function handleReset() {
    // Full reset: back to the circuit selection landing screen.
    clearResults();
    setView("workspace");
    setCircuitId(null);
  }

  const nothingLoaded = !report && !session && !strategy && !loading;
  const activeSessionId = report?.session_id ?? session?.session_id ?? strategy?.conditions.session_id;
  const selectedCircuitName =
    circuitDetail?.name ?? circuits.find((c) => c.circuit_id === circuitId)?.name ?? circuitId;

  // Landing view: pick a circuit before the mode navigation exists at all.
  if (!circuitId) {
    return (
      <div className="min-h-screen bg-obsidian text-on-surface">
        <TopNav circuitName={null} onChangeCircuit={() => {}} user={user} isGuest={isGuest} onLogout={logout} />
        <main className="flex flex-col gap-3 p-4 pb-20 pt-20 md:px-8">
          <CircuitSelect
            circuits={circuits}
            error={error}
            onSelect={(id) => {
              setCircuitId(id);
              clearResults();
              setView("workspace");
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-obsidian text-on-surface">
      <TopNav
        circuitName={selectedCircuitName}
        onChangeCircuit={() => {
          clearResults();
          setView("workspace");
          setCircuitId(null);
        }}
        user={user}
        isGuest={isGuest}
        onLogout={logout}
      />
      <SideNav
        mode={mode}
        view={view}
        onSelectMode={(m) => {
          setMode(m);
          setView("workspace");
          clearResults();
        }}
        onShowHistory={() => setView("history")}
        historyCount={historyEntries.length}
        user={user}
        isGuest={isGuest}
        onReset={handleReset}
      />

      <main className="flex flex-col gap-3 p-4 pb-20 pt-20 md:pb-16 md:pl-72 md:pr-6">
        {/* SideNav is desktop-only (hidden md:flex) -- without this, mode
            switching, history and reset would be unreachable on mobile. */}
        <div className="flex flex-wrap items-center gap-2 md:hidden">
          {(["lap", "session", "strategy"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setView("workspace");
                clearResults();
              }}
              className={`rounded border px-3 py-1.5 font-mono-data text-xs font-bold uppercase tracking-wider transition-colors ${
                view === "workspace" && mode === m
                  ? "border-secondary-container bg-secondary-container/15 text-secondary"
                  : "border-outline-variant/40 text-on-surface-variant"
              }`}
            >
              {m === "lap" ? "Single lap" : m === "session" ? "Multi-lap" : "Strategy"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setView("history")}
            className={`rounded border px-3 py-1.5 font-mono-data text-xs font-bold uppercase tracking-wider transition-colors ${
              view === "history"
                ? "border-primary-fixed-dim bg-primary-fixed-dim/15 text-primary-fixed-dim"
                : "border-outline-variant/40 text-on-surface-variant"
            }`}
          >
            History
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto rounded border border-error/50 bg-error-container/10 px-3 py-1.5 font-mono-data text-xs font-bold uppercase tracking-wider text-error"
          >
            Reset
          </button>
        </div>

        {view === "history" ? (
          <HistoryView
            entries={historyEntries}
            onOpen={openHistoryEntry}
            onClear={() => {
              clearHistory(identityKey);
              setHistoryEntries([]);
            }}
          />
        ) : (
          <>
            {circuitDetail && <CircuitIntel circuit={circuitDetail} />}

            <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-3">
                {loading && (
                  <span className="animate-pulse font-mono-data text-xs font-semibold uppercase tracking-widest text-primary-fixed-dim">
                    Analysis running…
                  </span>
                )}
                {error && (
                  <span className="font-mono-data text-xs font-semibold text-secondary-container">{error}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {mode === "strategy" && (
                  <button
                    type="button"
                    onClick={handleDryStrategy}
                    disabled={loading}
                    className="rounded border border-outline-variant bg-surface-container px-4 py-2 font-mono-data text-xs font-bold uppercase tracking-widest text-on-surface-variant transition-colors hover:border-outline hover:text-on-surface disabled:opacity-60"
                  >
                    Plan dry race
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="rounded border border-secondary-container bg-secondary-container/15 px-4 py-2 font-headline text-sm font-bold uppercase tracking-widest text-secondary-container transition-colors hover:bg-secondary-container/25 disabled:opacity-60"
                >
                  {loading ? "Analyzing..." : UPLOAD_LABELS[mode]}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFile}
                  disabled={loading}
                />
              </div>
            </div>

            {loading && <AnalysisProgress progress={progress} mode={mode} />}

            {nothingLoaded && (
              <Panel title="Awaiting telemetry" bodyClassName="p-0" tactical>
                <button
                  type="button"
                  onClick={() => (mode === "strategy" ? handleDryStrategy() : fileInputRef.current?.click())}
                  className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 p-12 transition-colors hover:bg-white/5"
                >
                  <span className="font-headline text-base font-bold uppercase tracking-[0.2em] text-on-surface">
                    {mode === "strategy"
                      ? "Plan a race, or load footage for live conditions"
                      : "Load a lap video to begin"}
                  </span>
                  <span className="font-mono-data text-xs uppercase tracking-widest text-outline">
                    {mode === "strategy"
                      ? "Real degradation · pit loss · safety car history · every stop plan simulated"
                      : "MP4 onboard footage · condition trend · forecast · pit call"}
                  </span>
                </button>
              </Panel>
            )}

            {strategy && <StrategyBoard report={strategy} />}
            {mode === "strategy" && circuitDetail && <CornerDegradation circuit={circuitDetail} />}
            {session && <MultiLapView session={session} />}
            {report && <SingleLapView report={report} />}
          </>
        )}
      </main>

      <Footer
        backendReachable={backendReachable}
        agentSynthesisUsed={report?.agent_synthesis_used}
        sessionId={activeSessionId}
      />
    </div>
  );
}

function Gate() {
  const { isAuthed, ready } = useAuth();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-obsidian">
        <span className="font-mono-data text-xs uppercase tracking-[0.3em] text-outline">Loading…</span>
      </div>
    );
  }
  return isAuthed ? <Workspace /> : <AuthScreen />;
}

function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}

export default App;
