import type { DictationSettings } from "../shared/settings";
import { buildHeaders, invalidateApiKey } from "./auth";
import { buildChatRequest, parseReply } from "./prompt";

const kRequestTimeoutMs = 120_000;

interface ChatCompletion {
  choices?: { message?: { content?: unknown } }[];
  error?: { message?: string };
}

function endpoint(settings: DictationSettings): string {
  const base = settings.baseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("No base URL is configured");
  return `${base}/chat/completions`;
}

/** Extracts text from string or content-part replies. */
function replyText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : ""))
      .join("");
  }
  return "";
}

async function postChat(settings: DictationSettings, body: object): Promise<ChatCompletion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), kRequestTimeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetch(endpoint(settings), {
      method: "POST",
      headers: await buildHeaders(settings),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    text = await response.text();
  } finally {
    clearTimeout(timer);
  }
  let parsed: ChatCompletion = {};
  try {
    parsed = JSON.parse(text) as ChatCompletion;
  } catch {
    // Fall through with the raw body in the error below.
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) invalidateApiKey();
    const detail = parsed.error?.message ?? text.slice(0, 300);
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return parsed;
}

export async function transcribe(
  settings: DictationSettings,
  audio: { base64: string; format: string },
  context: string,
): Promise<{ raw: string; message: string }> {
  const completion = await postChat(settings, buildChatRequest(settings, audio, context));
  return parseReply(replyText(completion.choices?.[0]?.message?.content));
}

/** Sends a tiny text-only request to validate the URL, key, and model. */
export async function testConnection(settings: DictationSettings): Promise<string> {
  const completion = await postChat(settings, {
    model: settings.model,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
    max_tokens: 8,
  });
  return replyText(completion.choices?.[0]?.message?.content).trim() || "(empty reply)";
}
