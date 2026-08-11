interface Props {
  backendReachable: boolean;
  agentSynthesisUsed?: boolean;
  sessionId?: string;
}

export default function Footer({ backendReachable, agentSynthesisUsed, sessionId }: Props) {
  return (
    <footer className="fixed bottom-0 right-0 z-40 hidden h-11 w-full items-center justify-between border-t border-outline-variant/25 bg-obsidian/90 px-4 backdrop-blur-xl md:flex md:w-[calc(100%-256px)] md:px-6">
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${backendReachable ? "bg-primary-fixed-dim animate-pulse" : "bg-secondary-container"}`}
        />
        <span className="font-mono-data text-[11px] uppercase tracking-widest text-on-surface-variant">
          {backendReachable ? "Backend connected" : "Backend unreachable"}
        </span>
      </div>
      <div className="flex items-center gap-5 font-mono-data text-[11px] uppercase tracking-widest text-outline">
        {agentSynthesisUsed !== undefined && (
          <span className={agentSynthesisUsed ? "text-tertiary-fixed-dim" : "text-outline"}>
            {agentSynthesisUsed ? "CrewAI agent active" : "Rule-based fallback"}
          </span>
        )}
        {sessionId && <span>session {sessionId.slice(0, 8)}</span>}
      </div>
    </footer>
  );
}
