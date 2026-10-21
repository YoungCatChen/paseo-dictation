import type { VoicePromptSettings } from "../shared/settings";

export interface ContextMessage {
  role: "user" | "assistant";
  text: string;
}

const kSystemPrompt = `You turn a voice recording into the chat message its speaker meant to type.

The speaker is talking to an AI coding agent. Your output is sent to that agent verbatim, as if the speaker had typed it. Write in the speaker's own first-person voice; never describe what they said ("The user wants...").

Respond with exactly two sections, in this order and with these markers:
<raw>
A faithful transcript of everything spoken, including filler words.
</raw>
<message>
The message to send.
</message>

Rules for <message>:
- Remove filler words, hesitations, false starts, self-corrections, and repetition. Keep only the final intended wording.
- Keep the speaker's meaning, intent, and tone exactly. Do not add, drop, answer, or soften any request.
- Keep code identifiers, commands, file paths, product names, and technical terms in their original form (usually English), even inside Chinese sentences.
- Write Chinese in Simplified characters. Otherwise use the language the speaker used.
- Use the conversation context only to spell names and terms correctly.
- Where a word is unclear and you inferred it from context, write the inferred word as [?word]. Do not otherwise annotate.
- If the recording contains no intelligible speech, leave both sections empty.`;

/**
 * Formats recent turns for the model, newest last, trimming the oldest turns
 * first so the most relevant context survives the character budget.
 */
export function formatContext(messages: ContextMessage[], maxChars: number): string {
  const lines: string[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index--) {
    const { role, text } = messages[index];
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    const clipped = text.length > remaining ? `…${text.slice(text.length - remaining)}` : text;
    lines.unshift(`[${role}]\n${clipped}`);
    used += clipped.length;
  }
  return lines.join("\n\n");
}

export function buildChatRequest(
  settings: VoicePromptSettings,
  audio: { base64: string; format: string },
  context: string,
): object {
  const system = settings.promptAddendum.trim()
    ? `${kSystemPrompt}\n\nAdditional instructions from the speaker:\n${settings.promptAddendum.trim()}`
    : kSystemPrompt;
  const content: object[] = [];
  if (context) {
    content.push({
      type: "text",
      text: `Recent conversation with the agent, for reference only:\n\n${context}`,
    });
  }
  content.push({ type: "input_audio", input_audio: { data: audio.base64, format: audio.format } });
  return {
    model: settings.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
  };
}

function section(reply: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)(?:</${tag}>|$)`).exec(reply);
  return match ? match[1].trim() : null;
}

/** Extracts both sections; a reply without markers is treated as the message. */
export function parseReply(reply: string): { raw: string; message: string } {
  const message = section(reply, "message");
  const raw = section(reply, "raw");
  if (message === null && raw === null) return { raw: "", message: reply.trim() };
  return { raw: raw ?? "", message: message ?? "" };
}
