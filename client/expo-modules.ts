// Looks up one of the host app's Expo native modules by name, or returns null.
//
// Paseo does not expose expo-audio or expo-localization to plugins, but the
// app registers every Expo native module on `globalThis.expo.modules`. This
// is the same lookup `requireOptionalNativeModule` in expo-modules-core 3.x
// performs first; the plugin inlines it rather than bundling that package.
// Web and Electron have no such registry, so it returns null there.
export function findExpoModule<Module>(name: string): Module | null {
  const expo = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo;
  try {
    return (expo?.modules?.[name] as Module | undefined) ?? null;
  } catch {
    return null;
  }
}
