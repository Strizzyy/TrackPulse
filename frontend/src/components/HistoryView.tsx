import type { HistoryEntry } from "../history";
import Panel from "./Panel";

interface Props {
  entries: HistoryEntry[];
  onOpen: (entry: HistoryEntry) => void;
  onClear: () => void;
}

const MODE_LABEL: Record<HistoryEntry["mode"], string> = {
  lap: "Single lap",
  session: "Multi-lap",
  strategy: "Strategy",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryView({ entries, onOpen, onClear }: Props) {
  return (
    <Panel
      title="Run history"
      right={
        entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="font-mono-data text-[11px] uppercase tracking-widest text-outline transition-colors hover:text-secondary"
          >
            Clear
          </button>
        )
      }
    >
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-on-surface-variant">
          No runs yet — analyses will appear here.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-outline-variant/20">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpen(entry)}
              className="flex items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-white/5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-xs border border-primary-fixed-dim/30 bg-primary-fixed-dim/10 px-1.5 py-0.5 font-mono-data text-[10px] font-semibold uppercase tracking-widest text-primary-fixed-dim">
                    {MODE_LABEL[entry.mode]}
                  </span>
                  <span className="truncate font-headline text-sm font-bold uppercase tracking-tight text-on-surface">
                    {entry.circuitName}
                  </span>
                </div>
                <span className="truncate text-xs text-on-surface-variant">{entry.summary}</span>
              </div>
              <span className="shrink-0 font-mono-data text-[11px] tabular-nums text-outline">
                {formatTimestamp(entry.timestamp)}
              </span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
