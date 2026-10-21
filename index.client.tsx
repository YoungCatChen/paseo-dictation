import type { PluginClientContext } from "@getpaseo/plugin/client";
import { type Locale, translate } from "./shared/i18n";
import { jobRowSchema, kTimelineKind, kTimelineVersion } from "./shared/timeline";
import { currentPaseoLocale, onPaseoLocaleChange, refreshPaseoLocale } from "./client/locale";
import { createVoicePromptPills } from "./client/pills";
import { onSettingsSaved } from "./client/readiness-bus";
import { PreferencesScreen } from "./client/settings-screen";
import { VoicePromptRow } from "./client/timeline-row";
import { voicePromptSettings } from "./shared/settings";
import { settingsRpc } from "@getpaseo/plugin";

export default function contribute(client: PluginClientContext) {
  // Pill labels live outside React: resolve the plugin's language override,
  // else Paseo's language, and relabel when either changes.
  let override: Locale | null = null;
  const locale = (): Locale => override ?? currentPaseoLocale();
  const pills = createVoicePromptPills(client, locale);
  const lifetime = new AbortController();
  let stopped = false;
  let removeSettings: (() => void) | null = null;

  const registerSettingsScreen = () => {
    removeSettings?.();
    removeSettings = client.addSettingsScreen({
      id: "preferences",
      title: translate(locale(), "settings.title"),
      icon: "Mic",
      Component: PreferencesScreen,
    });
  };
  const relabel = () => {
    if (stopped) return;
    pills.relabel();
    registerSettingsScreen();
  };

  registerSettingsScreen();
  const removeLocaleListener = onPaseoLocaleChange(relabel);
  const removeSavedListener = onSettingsSaved(() => pills.recheck());
  void refreshPaseoLocale();
  // The settings document is shared with the daemon; read the override once.
  // Changes made in the settings screen apply to pills on the next reload.
  void client
    .rpc(settingsRpc(voicePromptSettings.id).read, {})
    .then((state) => {
      if (state.status !== "ready") return;
      const choice = (state.values as { uiLanguage?: unknown }).uiLanguage;
      override = choice === "en" || choice === "zh-CN" ? choice : null;
      if (override) relabel();
    })
    .catch(() => {});

  const removeRenderer = client.addTimelineRenderer({
    kind: kTimelineKind,
    version: kTimelineVersion,
    schema: jobRowSchema,
    Component: VoicePromptRow,
  });

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          pills.clear();
          for (const { agent } of entries) pills.register(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") pills.remove(update.agentId);
          else pills.register(update.agent);
        },
      });
      return undefined;
    })
    .catch((error: unknown) => {
      if (!stopped) console.error("[tidy-voice-prompt] agent observation failed", error);
    });

  return () => {
    stopped = true;
    lifetime.abort();
    removeLocaleListener();
    removeSavedListener();
    pills.clear();
    removeRenderer();
    removeSettings?.();
  };
}
