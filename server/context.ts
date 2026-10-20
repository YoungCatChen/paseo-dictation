import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { ContextMessage } from "./prompt";

type PaseoApi = PluginHandlerContext["paseo"];

// One turn usually spans a user message, tool calls, and an assistant reply,
// so fetch generously and keep only the message rows.
const kRowsPerTurn = 40;

/** Returns the last `turns` user turns and their replies, oldest first. */
export async function fetchRecentMessages(
  paseo: PaseoApi,
  agentId: string,
  turns: number,
): Promise<ContextMessage[]> {
  if (turns <= 0) return [];
  const page = await paseo.agents.ref(agentId).timeline.refetch({
    direction: "tail",
    projection: "projected",
    limit: turns * kRowsPerTurn,
  });
  if (page.error) throw new Error(page.error);
  const messages: ContextMessage[] = [];
  for (const { item } of page.entries) {
    if (item.type === "user_message" && item.text.trim()) {
      messages.push({ role: "user", text: item.text });
    } else if (item.type === "assistant_message" && item.text.trim()) {
      messages.push({ role: "assistant", text: item.text });
    }
  }
  // Keep from the user message that starts the oldest wanted turn.
  let userTurns = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === "user" && ++userTurns === turns) return messages.slice(index);
  }
  return messages;
}
