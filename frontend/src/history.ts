import type { SessionReport, StrategistReport, StrategyReport } from "./types";

export type HistoryMode = "lap" | "session" | "strategy";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  mode: HistoryMode;
  circuitId: string;
  circuitName: string;
  summary: string;
  result: StrategistReport | SessionReport | StrategyReport;
}

const MAX_ENTRIES = 20;

function storageKey(identityKey: string): string {
  return `trackpulse.history.${identityKey}`;
}

/**
 * Local-only run history, namespaced per browser identity (see auth/AuthContext
 * -- there is no backend database, so "see their data" means this browser's
 * own past results, kept separate per account/guest bucket). Capped at
 * MAX_ENTRIES so localStorage doesn't grow unbounded across a long session.
 */
export function loadHistory(identityKey: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(identityKey));
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(identityKey: string, entry: HistoryEntry): HistoryEntry[] {
  const existing = loadHistory(identityKey);
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(storageKey(identityKey), JSON.stringify(next));
  } catch {
    /* storage full or unavailable -- history is supplementary, don't break the app over it */
  }
  return next;
}

export function clearHistory(identityKey: string): void {
  localStorage.removeItem(storageKey(identityKey));
}
