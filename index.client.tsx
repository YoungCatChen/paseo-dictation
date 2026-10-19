import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { createRecorderPopover } from "./client/recorder-popover";

export default function contribute(client: PluginClientContext) {
  const RecorderPopover = createRecorderPopover(client.rpc);
  const pills = new Map<string, PluginButtonRegistration>();
  const lifetime = new AbortController();
  let stopped = false;

  const register = (agent: { id: string; workspaceId?: string | null }) => {
    if (stopped || !agent.workspaceId) return;
    pills.get(agent.id)?.remove();
    pills.set(
      agent.id,
      client.addComposerPill({
        id: "record-probe",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: {
          title: "Dictation probe",
          icon: "Mic",
          label: "Rec",
          behavior: { kind: "popover", Content: RecorderPopover },
        },
      }),
    );
  };
  const remove = (agentId: string) => {
    pills.get(agentId)?.remove();
    pills.delete(agentId);
  };

  void client.paseo.agents
    .list({ subscribe: {}, signal: lifetime.signal })
    .then(({ subscription }) => {
      subscription.subscribe({
        snapshot: ({ entries }) => {
          for (const pill of pills.values()) pill.remove();
          pills.clear();
          for (const { agent } of entries) register(agent);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "remove") remove(update.agentId);
          else register(update.agent);
        },
      });
      return undefined;
    })
    .catch((error) => {
      if (!stopped) console.error("Agent observation failed", error);
    });

  return () => {
    stopped = true;
    lifetime.abort();
    for (const pill of pills.values()) pill.remove();
    pills.clear();
  };
}
