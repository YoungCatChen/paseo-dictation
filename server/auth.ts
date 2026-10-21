import { spawn } from "node:child_process";
import type { VoicePromptSettings } from "../shared/settings";

const kCommandTimeoutMs = 30_000;

interface CachedKey {
  command: string;
  value: string;
  expiresAt: number;
}

let cached: CachedKey | null = null;

/** Runs `command` in the user's shell and returns its trimmed stdout. */
function runKeyCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const shell = process.env.SHELL || "/bin/sh";
    const child = spawn(shell, ["-c", command], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`API key command timed out after ${kCommandTimeoutMs / 1000}s`));
    }, kCommandTimeoutMs);
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // Some helpers print diagnostics before the key; the key is the last line.
      const key = stdout.trim().split("\n").pop()?.trim() ?? "";
      if (code !== 0) {
        reject(new Error(`API key command exited with ${code}: ${stderr.trim().slice(0, 300)}`));
      } else if (!key) {
        reject(new Error("API key command printed nothing"));
      } else {
        resolve(key);
      }
    });
  });
}

async function resolveApiKey(settings: VoicePromptSettings): Promise<string | null> {
  switch (settings.authMode) {
    case "none":
      return null;
    case "key":
      if (!settings.apiKey) throw new Error("No API key is configured");
      return settings.apiKey;
    case "command": {
      const command = settings.apiKeyCommand.trim();
      if (!command) throw new Error("No API key command is configured");
      const now = Date.now();
      if (cached && cached.command === command && cached.expiresAt > now) return cached.value;
      const value = await runKeyCommand(command);
      cached = { command, value, expiresAt: now + settings.apiKeyCommandTtlSeconds * 1000 };
      return value;
    }
  }
}

/** Forgets a cached command key, e.g. after the endpoint rejects it. */
export function invalidateApiKey(): void {
  cached = null;
}

export async function buildHeaders(settings: VoicePromptSettings): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    ...settings.extraHeaders,
    "Content-Type": "application/json",
  };
  const key = await resolveApiKey(settings);
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}
