import type { VoicePromptSettings } from "../shared/settings";
import { buildHeaders, invalidateApiKey } from "./auth";
import { buildChatRequest, parseReply } from "./prompt";

const kRequestTimeoutMs = 120_000;

interface ChatCompletion {
  choices?: { message?: { content?: unknown } }[];
  error?: { message?: string };
}

function baseUrl(settings: VoicePromptSettings): string {
  const base = settings.baseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("No base URL is configured");
  return base;
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

async function request<T extends { error?: { message?: string } }>(
  settings: VoicePromptSettings,
  path: string,
  init: { method: "GET" } | { method: "POST"; body: object },
  timeoutMs = kRequestTimeoutMs,
): Promise<T> {
  const url = `${baseUrl(settings)}${path}`;
  const headers = await buildHeaders(settings);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: init.method,
      headers,
      body: init.method === "POST" ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Timed out after ${timeoutMs / 1000}s: ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let parsed = {} as T;
  try {
    parsed = JSON.parse(text) as T;
  } catch {
    // Fall through with the raw body in the error below.
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) invalidateApiKey();
    // Some gateways nest the upstream error as a JSON string in `detail`.
    const detail = parsed.error?.message ?? text.slice(0, 300);
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return parsed;
}

function postChat(settings: VoicePromptSettings, body: object): Promise<ChatCompletion> {
  return request<ChatCompletion>(settings, "/chat/completions", { method: "POST", body });
}

export async function transcribe(
  settings: VoicePromptSettings,
  audio: { base64: string; format: string },
  context: string,
): Promise<{ raw: string; message: string }> {
  const completion = await postChat(settings, buildChatRequest(settings, audio, context));
  return parseReply(replyText(completion.choices?.[0]?.message?.content));
}

/** Sends a tiny text-only request to validate the URL, key, and model. */
export async function testConnection(settings: VoicePromptSettings): Promise<string> {
  const completion = await postChat(settings, {
    model: settings.model,
    messages: [{ role: "user", content: "Reply with the single word: ok" }],
    max_tokens: 8,
  });
  return replyText(completion.choices?.[0]?.message?.content).trim() || "(empty reply)";
}

const kReadinessTimeoutMs = 15_000;

interface ModelList {
  data?: { id?: unknown }[];
  error?: { message?: string };
}

/**
 * Checks the endpoint, credential, and model without spending tokens: lists
 * models and looks for the configured one. Resolving the credential first
 * also runs a key helper, so a broken helper fails here rather than later.
 * An endpoint without `/models` passes once a credential was sent, since
 * some (Gemini, for one) answer 404 there instead of rejecting a missing key.
 */
export async function checkReadiness(settings: VoicePromptSettings): Promise<void> {
  if (!settings.model.trim()) throw new Error("No model is configured");
  let list: ModelList;
  try {
    list = await request<ModelList>(settings, "/models", { method: "GET" }, kReadinessTimeoutMs);
  } catch (error) {
    const missingRoute = error instanceof Error && /^HTTP (404|405|501):/.test(error.message);
    if (missingRoute && settings.authMode !== "none") return;
    throw error;
  }
  const ids = (list.data ?? []).map((model) => String(model.id ?? ""));
  if (ids.length === 0) return;
  const model = settings.model.trim();
  if (!ids.some((id) => id === model || id === `models/${model}` || id.endsWith(`/${model}`))) {
    throw new Error(`Model "${model}" is not offered by this endpoint`);
  }
}
