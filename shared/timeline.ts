import { z } from "zod";

export const kTimelineKind = "voice-prompt";
export const kTimelineVersion = 1;

export const jobStates = [
  "transcribing",
  "review",
  "sent",
  "discarded",
  "empty",
  "failed",
] as const;

/** Payload of the plugin-owned timeline row that tracks one recording. */
export const jobRowSchema = z.object({
  // Renderers do not receive the row's own id, so it is repeated here.
  jobId: z.string(),
  state: z.enum(jobStates),
  durationMillis: z.number(),
  /** Verbatim transcript, kept so the user can audit the tidied message. */
  raw: z.string().default(""),
  /** Tidied message that was, or will be, sent to the agent. */
  text: z.string().default(""),
  error: z.string().default(""),
});

export type JobRow = z.output<typeof jobRowSchema>;
