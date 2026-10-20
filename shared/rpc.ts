import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// Base64 grows by 4/3, so this admits roughly 7.5 MB of audio: about 30
// minutes at the 32 kbit/s the recorder uses.
const kMaxAudioBase64Length = 10 * 1024 * 1024;

export const dictateRpc = defineRpc({
  name: "dictation.submit",
  input: z.object({
    agentId: z.string().min(1),
    audioBase64: z.string().min(1).max(kMaxAudioBase64Length),
    /** Value for the OpenAI `input_audio.format` field, e.g. "mp4" or "webm". */
    audioFormat: z.string().min(1),
    durationMillis: z.number().nonnegative(),
  }),
  output: z.object({
    /** Identifies the timeline row that reports progress for this clip. */
    jobId: z.string(),
  }),
});

export const sendDraftRpc = defineRpc({
  name: "dictation.send",
  input: z.object({
    agentId: z.string().min(1),
    jobId: z.string().min(1),
    text: z.string(),
  }),
  output: z.object({ sent: z.boolean() }),
});

export const discardDraftRpc = defineRpc({
  name: "dictation.discard",
  input: z.object({ agentId: z.string().min(1), jobId: z.string().min(1) }),
  output: z.object({ discarded: z.boolean() }),
});

export const testConnectionRpc = defineRpc({
  name: "dictation.test",
  input: z.object({}),
  output: z.object({ ok: z.boolean(), detail: z.string() }),
});
