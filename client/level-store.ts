import { useSyncExternalStore } from "react";

export interface LevelSnapshot {
  /** Agent whose pill is recording, or null when idle. */
  agentId: string | null;
  /** Recent input levels in [0, 1], oldest first. */
  levels: readonly number[];
  elapsedMillis: number;
  /** True once the input has stayed near silence long enough to warn. */
  silent: boolean;
}

const kHistory = 4;
const kSilenceLevel = 0.04;
const kSilenceWarnMillis = 3000;

const kIdle: LevelSnapshot = { agentId: null, levels: [0, 0, 0, 0], elapsedMillis: 0, silent: false };

let snapshot = kIdle;
let loudSince = 0;
const listeners = new Set<() => void>();

function emit(next: LevelSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Shared by the recorder (writer) and the pill icon (reader). */
export const levelStore = {
  begin(agentId: string): void {
    loudSince = 0;
    emit({ ...kIdle, agentId });
  },
  push(level: number, elapsedMillis: number): void {
    if (!snapshot.agentId) return;
    const clamped = Math.max(0, Math.min(1, level));
    if (clamped > kSilenceLevel) loudSince = elapsedMillis;
    emit({
      agentId: snapshot.agentId,
      levels: [...snapshot.levels.slice(1 - kHistory), clamped],
      elapsedMillis,
      silent: elapsedMillis - loudSince >= kSilenceWarnMillis,
    });
  },
  end(): void {
    emit(kIdle);
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLevels(): LevelSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Maps a decibel reading (about -160 to 0 dBFS) to [0, 1], as Paseo's dictation does. */
export function levelFromDecibels(decibels: number): number {
  return Math.max(0, Math.min(1, (decibels + 40) / 40));
}
