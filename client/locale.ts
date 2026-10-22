import { useSettings } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, TurboModuleRegistry } from "react-native";
import { type Locale, type MessageKey, resolveLocale, translate } from "../shared/i18n";
import { voicePromptSettings } from "../shared/settings";
import { findExpoModule } from "./expo-modules";

// Paseo does not expose its UI language to plugins. It persists the choice in
// its own app settings, under this AsyncStorage key, as `language`: either
// "system" or a locale tag. Reading it is a best-effort private contract; on
// any failure the plugin falls back to the device language, like "system".
const kAppSettingsKey = "@paseo:app-settings";

type MultiGet = (keys: string[], callback: (error?: unknown, result?: [string, string][]) => void) => void;

function readAppSettingsRaw(): Promise<string | null> {
  if (Platform.OS === "web") {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } })
      .localStorage;
    return Promise.resolve(storage?.getItem(kAppSettingsKey) ?? null);
  }
  const native = TurboModuleRegistry.get("RNCAsyncStorage") as { multiGet?: MultiGet } | null;
  if (!native?.multiGet) return Promise.resolve(null);
  const multiGet = native.multiGet;
  return new Promise((resolve) =>
    multiGet([kAppSettingsKey], (error, result) => resolve(error ? null : (result?.[0]?.[1] ?? null))),
  );
}

async function readPaseoLanguage(): Promise<string | null> {
  try {
    const raw = await readAppSettingsRaw();
    if (!raw) return null;
    const language = (JSON.parse(raw) as { language?: unknown }).language;
    return typeof language === "string" && language !== "system" ? language : null;
  } catch {
    return null;
  }
}

// Mirrors Paseo's own "system" resolution through ExpoLocalization.
function deviceLanguageTag(): string | null {
  if (Platform.OS === "web") {
    return typeof navigator !== "undefined" ? (navigator.languages?.[0] ?? null) : null;
  }
  const module = findExpoModule<{ getLocales(): { languageTag: string }[] }>("ExpoLocalization");
  try {
    return module?.getLocales()[0]?.languageTag ?? null;
  } catch {
    return null;
  }
}

let deviceLocale: Locale | null = null;

function systemLocale(): Locale {
  deviceLocale ??= resolveLocale(
    deviceLanguageTag() ?? Intl.DateTimeFormat().resolvedOptions().locale,
  );
  return deviceLocale;
}

// Paseo's language as last read. Starts at the device language and is
// refreshed whenever a plugin surface mounts, so a change in Paseo settings
// applies the next time the plugin renders without a restart.
let paseoLocale: Locale = systemLocale();
const listeners = new Set<() => void>();

export function refreshPaseoLocale(): Promise<Locale> {
  return readPaseoLanguage().then((tag) => {
    const next = tag ? resolveLocale(tag) : systemLocale();
    if (next !== paseoLocale) {
      paseoLocale = next;
      for (const listener of listeners) listener();
    }
    return next;
  });
}

/** Paseo's language, for code outside React such as pill labels. */
export function currentPaseoLocale(): Locale {
  return paseoLocale;
}

/** Calls `listener` when the resolved Paseo language changes. */
export function onPaseoLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Returns a translator: the plugin's own setting wins, otherwise Paseo's language. */
export function useTranslate(): Translate {
  const settings = useSettings(voicePromptSettings);
  const choice = settings.status === "ready" ? settings.values.uiLanguage : "system";
  const [followed, setFollowed] = useState(paseoLocale);
  useEffect(() => {
    const unsubscribe = onPaseoLocaleChange(() => setFollowed(paseoLocale));
    void refreshPaseoLocale();
    return unsubscribe;
  }, []);
  const locale = useMemo(() => (choice === "system" ? followed : choice), [choice, followed]);
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}
