import type { StrategistProfile } from "../../auth/AuthContext";

interface Props {
  /** Name of the selected circuit, or null while on the selection screen. */
  circuitName: string | null;
  onChangeCircuit: () => void;
  user: StrategistProfile | null;
  isGuest: boolean;
  onLogout: () => void;
}

export default function TopNav({ circuitName, onChangeCircuit, user, isGuest, onLogout }: Props) {
  return (
    <nav className="fixed top-0 left-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant/25 bg-obsidian/85 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <span className="shrink-0 font-headline text-xl font-black uppercase tracking-tighter text-on-surface">
          TRACK<span className="text-secondary-container">PULSE</span>
        </span>

        {circuitName && (
          <div className="flex min-w-0 items-center gap-2 border-l border-outline-variant/30 pl-4">
            <span className="hidden font-mono-data text-[10px] uppercase tracking-[0.25em] text-outline sm:inline">
              Circuit
            </span>
            <span className="truncate rounded border border-primary-fixed-dim bg-primary-fixed-dim/10 px-2.5 py-1 font-mono-data text-[11px] font-semibold uppercase tracking-wider text-primary-fixed-dim">
              {circuitName}
            </span>
            <button
              type="button"
              onClick={onChangeCircuit}
              className="flex shrink-0 items-center gap-1 rounded border border-outline-variant/40 px-2.5 py-1 font-mono-data text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-outline hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
              Change
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="font-mono-data text-[11px] font-bold uppercase tracking-wider text-on-surface">
            {user ? user.name : isGuest ? "Guest" : ""}
          </div>
          <div className="flex items-center justify-end gap-1.5 font-mono-data text-[10px] uppercase tracking-widest text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary-container" />
            {user ? "Account active" : "Guest session"}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          title="Log out"
          className="flex h-9 w-9 items-center justify-center rounded border border-outline-variant/40 text-on-surface-variant transition-colors hover:border-primary-fixed-dim hover:text-primary-fixed-dim"
        >
          <span className="material-symbols-outlined text-[20px]">account_circle</span>
        </button>
      </div>
    </nav>
  );
}
