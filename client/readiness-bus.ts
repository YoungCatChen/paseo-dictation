// Lets the settings screen tell the pills to recheck readiness after a save.
// Both run in the same client bundle instance, so a module-level set suffices.
const listeners = new Set<() => void>();

export function onSettingsSaved(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySettingsSaved(): void {
  for (const listener of listeners) listener();
}
