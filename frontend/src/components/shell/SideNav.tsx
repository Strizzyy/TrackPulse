import type { StrategistProfile } from "../../auth/AuthContext";

export type Mode = "lap" | "session" | "strategy";
export type View = "workspace" | "history";

interface NavItem {
  key: Mode;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "lap", label: "Single lap", icon: "video_camera_back" },
  { key: "session", label: "Multi-lap session", icon: "query_stats" },
  { key: "strategy", label: "Race strategy", icon: "route" },
];

interface Props {
  mode: Mode;
  view: View;
  onSelectMode: (mode: Mode) => void;
  onShowHistory: () => void;
  historyCount: number;
  user: StrategistProfile | null;
  isGuest: boolean;
  onReset: () => void;
}

export default function SideNav({
  mode,
  view,
  onSelectMode,
  onShowHistory,
  historyCount,
  user,
  isGuest,
  onReset,
}: Props) {
  return (
    <aside className="fixed left-0 top-16 z-40 hidden h-[calc(100vh-64px)] w-64 flex-col border-r border-outline-variant/25 bg-obsidian/90 px-3 py-5 backdrop-blur-xl md:flex">
      <div className="mb-6 px-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-secondary-container" />
          <span className="font-mono-data text-[10px] uppercase tracking-[0.25em] text-secondary">
            {user ? "Session active" : isGuest ? "Guest session" : "Session"}
          </span>
        </div>
        <h2 className="font-headline text-lg font-bold uppercase tracking-tight text-on-surface">
          {user ? user.name : "Guest strategist"}
        </h2>
        <p className="font-mono-data text-[11px] text-on-surface-variant">Lead Strategist</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = view === "workspace" && mode === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onSelectMode(item.key)}
              className={`flex items-center gap-3 rounded px-3 py-2.5 text-left font-mono-data text-xs font-semibold uppercase tracking-wider transition-all ${
                active
                  ? "border-r-2 border-secondary-container bg-secondary-container/15 text-secondary"
                  : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onShowHistory}
          className={`mt-1 flex items-center justify-between gap-3 rounded px-3 py-2.5 text-left font-mono-data text-xs font-semibold uppercase tracking-wider transition-all ${
            view === "history"
              ? "border-r-2 border-primary-fixed-dim bg-primary-fixed-dim/15 text-primary-fixed-dim"
              : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
          }`}
        >
          <span className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[20px]">history_edu</span>
            History
          </span>
          {historyCount > 0 && (
            <span className="rounded-full bg-surface-container-high px-1.5 py-0.5 text-[10px] tabular-nums text-outline">
              {historyCount}
            </span>
          )}
        </button>
      </nav>

      <button
        type="button"
        onClick={onReset}
        className="tactical-border w-full rounded border border-error/50 bg-error-container/10 py-2.5 font-mono-data text-xs font-bold uppercase tracking-widest text-error transition-colors hover:bg-error-container/20"
      >
        Reset session
      </button>
    </aside>
  );
}
