import { useSettings } from "@getpaseo/plugin/client";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { type Locale, type MessageKey, resolveLocale, translate } from "../shared/i18n";
import { dictationSettings } from "../shared/settings";

// Paseo does not expose its UI language to plugins. Ask the device instead,
// through the same ExpoLocalization module the app uses for "system".
function deviceLanguageTag(): string | null {
  if (Platform.OS === "web") {
    return typeof navigator !== "undefined" ? (navigator.languages?.[0] ?? null) : null;
  }
  const module = requireOptionalNativeModule<{ getLocales(): { languageTag: string }[] }>(
    "ExpoLocalization",
  );
  try {
    return module?.getLocales()[0]?.languageTag ?? null;
  } catch {
    return null;
  }
}

let deviceLocale: Locale | null = null;

function systemLocale(): Locale {
  deviceLocale ??= resolveLocale(deviceLanguageTag() ?? Intl.DateTimeFormat().resolvedOptions().locale);
  return deviceLocale;
}

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

/** Returns a translator honoring the plugin's language setting. */
export function useTranslate(): Translate {
  const settings = useSettings(dictationSettings);
  const choice = settings.status === "ready" ? settings.values.uiLanguage : "system";
  const locale = useMemo(() => (choice === "system" ? systemLocale() : choice), [choice]);
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}

/** Locale for code outside React, such as pill labels; ignores the setting. */
export function currentSystemLocale(): Locale {
  return systemLocale();
}
