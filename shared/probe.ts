import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Uploads one recording so the daemon can prove the bytes survived transit. */
export const submitRecordingRpc = defineRpc({
  name: "recording.submit",
  input: z.object({
    base64: z.string(),
    mimeType: z.string(),
    durationMillis: z.number(),
    platform: z.string(),
  }),
  output: z.object({
    bytes: z.number(),
    savedPath: z.string(),
    header: z.string(),
  }),
});

/** Records one client-side probe step so results are visible in plugin logs. */
export const reportProbeRpc = defineRpc({
  name: "probe.report",
  input: z.object({
    step: z.string(),
    ok: z.boolean(),
    detail: z.string(),
    platform: z.string(),
  }),
  output: z.object({ received: z.boolean() }),
});
