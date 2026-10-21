import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const kGeminiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
export const kDefaultModel = "gemini-3.5-flash";

export const authModes = ["none", "key", "command"] as const;
export const uiLanguages = ["system", "en", "zh-CN"] as const;

const headerName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/, "Invalid header name");

export const voicePromptSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: z.object({
    /** OpenAI-compatible endpoint root; `/chat/completions` is appended. */
    baseUrl: z.string().trim().default(kGeminiBaseUrl),
    model: z.string().trim().default(kDefaultModel),
    authMode: z.enum(authModes).default("key"),
    /** Stored in plain JSON on the daemon host; prefer `apiKeyCommand`. */
    apiKey: z.string().default(""),
    /** Shell command whose stdout is the API key, e.g. a credential helper. */
    apiKeyCommand: z.string().default(""),
    /** Reruns the command after this many seconds; 0 runs it per request. */
    apiKeyCommandTtlSeconds: z.number().int().min(0).max(86400).default(1800),
    extraHeaders: z.record(headerName, z.string()).default({}),
    contextTurns: z.number().int().min(0).max(20).default(3),
    contextMaxChars: z.number().int().min(0).max(100_000).default(8000),
    /** Shows the tidied text for confirmation instead of sending it at once. */
    reviewBeforeSend: z.boolean().default(false),
    /** Extra instructions appended to the built-in prompt. */
    promptAddendum: z.string().default(""),
    uiLanguage: z.enum(uiLanguages).default("system"),
  }),
});

export type VoicePromptSettings = z.output<typeof voicePromptSettings.schema>;
