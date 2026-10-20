import type { PluginClientContext } from "@getpaseo/plugin/client";
import { translate } from "./shared/i18n";
import { jobRowSchema, kTimelineKind, kTimelineVersion } from "./shared/timeline";
import { currentSystemLocale } from "./client/locale";
import { DictationPills } from "./client/pills";
import { DictationSettingsScreen } from "./client/settings-screen";
import { DictationRow } from "./client/timeline-row";

export default function contribute(client: PluginClientContext) {
  // Pill labels are set outside React, so they follow the device language.
  const pills = new DictationPills(client, currentSystemLocale);
  const lifetime = new AbortController();
  let stopped = false;

  const removeSettings = client.addSettingsScreen({
    id: "dictation",
    title: translate(currentSystemLocale(), "settings.title"),
    icon: "Mic",
    Component: DictationSettingsScreen,
  });
  const removeRenderer = client.addTimelineRenderer({
    kind: kTimelineKind,
    version: kTimelineVersion,
    schema: jobRowSchema,
    Component: DictationRow,
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
      if (!stopped) console.error("[dictation] agent observation failed", error);
    });

  return () => {
    stopped = true;
    lifetime.abort();
    pills.clear();
    removeRenderer();
    removeSettings();
  };
}
