import { randomUUID } from "node:crypto";
import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginSettings } from "@getpaseo/plugin/server";
import type { dictateRpc, discardDraftRpc, sendDraftRpc } from "../shared/rpc";
import { type VoicePromptSettings, voicePromptSettings } from "../shared/settings";
import { type JobRow, kTimelineKind, kTimelineVersion } from "../shared/timeline";
import { fetchRecentMessages } from "./context";
import { formatContext } from "./prompt";
import { checkReadiness, testConnection, transcribe } from "./transcribe";

// Derived from the SDK so the daemon's production install needs no client package.
type PaseoApi = PluginHandlerContext["paseo"];
type Settings = PluginSettings<typeof voicePromptSettings.schema>;

interface Job {
  agentId: string;
  row: JobRow;
}

interface Readiness {
  ready: boolean;
  detail: string;
  checkedAt: number;
}

// A passing check is trusted for a while; a failing one is retried sooner so
// fixing the endpoint does not require touching settings.
const kReadyTtlMillis = 10 * 60_000;
const kNotReadyTtlMillis = 30_000;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class VoicePromptJobs {
  // Jobs awaiting review stay here so Send and Discard can find them. Rows in
  // the timeline outlive a daemon restart, but the pending draft does not.
  private readonly jobs = new Map<string, Job>();

  private readiness: Readiness | null = null;
  private pendingReadiness: Promise<Readiness> | null = null;

  constructor(private readonly settings: Settings) {
    // Any settings change may fix or break the chain.
    settings.subscribe(() => {
      this.readiness = null;
    });
  }

  async checkReadiness(refresh: boolean): Promise<Readiness> {
    const cached = this.readiness;
    const ttl = cached?.ready ? kReadyTtlMillis : kNotReadyTtlMillis;
    if (!refresh && cached && Date.now() - cached.checkedAt < ttl) return cached;
    this.pendingReadiness ??= (async () => {
      try {
        await checkReadiness(await this.readSettings());
        return { ready: true, detail: "", checkedAt: Date.now() };
      } catch (error) {
        return { ready: false, detail: describe(error), checkedAt: Date.now() };
      }
    })().then((result) => {
      this.readiness = result;
      this.pendingReadiness = null;
      return result;
    });
    return this.pendingReadiness;
  }

  private async readSettings(): Promise<VoicePromptSettings> {
    const state = await this.settings.read();
    if (state.status !== "ready") throw new Error(`Invalid settings: ${state.error}`);
    return state.values;
  }

  private async publish(paseo: PaseoApi, jobId: string, job: Job): Promise<void> {
    await paseo.agents.ref(job.agentId).timeline.append({
      type: "plugin",
      id: jobId,
      kind: kTimelineKind,
      version: kTimelineVersion,
      data: job.row,
    });
  }

  async submit(input: RpcInput<typeof dictateRpc>, paseo: PaseoApi) {
    const jobId = randomUUID();
    const job: Job = {
      agentId: input.agentId,
      row: {
        jobId,
        state: "transcribing",
        durationMillis: input.durationMillis,
        raw: "",
        text: "",
        error: "",
      },
    };
    await this.publish(paseo, jobId, job);
    // Transcription can take a while; the client may disconnect meanwhile.
    void this.run(jobId, job, input, paseo);
    return { jobId };
  }

  private async run(
    jobId: string,
    job: Job,
    input: RpcInput<typeof dictateRpc>,
    paseo: PaseoApi,
  ): Promise<void> {
    try {
      const settings = await this.readSettings();
      const context = await fetchRecentMessages(paseo, input.agentId, settings.contextTurns)
        .then((messages) => formatContext(messages, settings.contextMaxChars))
        .catch((error) => {
          console.warn(`[tidy-voice-prompt] context unavailable: ${describe(error)}`);
          return "";
        });
      const started = Date.now();
      const { raw, message } = await transcribe(
        settings,
        { base64: input.audioBase64, format: input.audioFormat },
        context,
      );
      console.log(
        `[tidy-voice-prompt] job=${jobId} audioMs=${Math.round(input.durationMillis)} ` +
          `contextChars=${context.length} modelMs=${Date.now() - started} chars=${message.length}`,
      );
      job.row = { ...job.row, raw, text: message };
      if (!message) {
        job.row.state = "empty";
      } else if (settings.reviewBeforeSend) {
        job.row.state = "review";
        this.jobs.set(jobId, job);
      } else {
        await paseo.agents.ref(input.agentId).send(message, { activeTurnBehavior: "steer" });
        job.row.state = "sent";
      }
    } catch (error) {
      console.error(`[tidy-voice-prompt] job=${jobId} failed: ${describe(error)}`);
      job.row = { ...job.row, state: "failed", error: describe(error) };
      this.readiness = null;
    }
    await this.publish(paseo, jobId, job).catch((error) =>
      console.error(`[tidy-voice-prompt] job=${jobId} could not update its row: ${describe(error)}`),
    );
  }

  async send(input: RpcInput<typeof sendDraftRpc>, paseo: PaseoApi) {
    const job = this.jobs.get(input.jobId);
    const text = input.text.trim();
    if (!job || job.agentId !== input.agentId || !text) return { sent: false };
    this.jobs.delete(input.jobId);
    await paseo.agents.ref(job.agentId).send(text, { activeTurnBehavior: "steer" });
    job.row = { ...job.row, state: "sent", text };
    await this.publish(paseo, input.jobId, job);
    return { sent: true };
  }

  async discard(input: RpcInput<typeof discardDraftRpc>, paseo: PaseoApi) {
    const job = this.jobs.get(input.jobId);
    if (!job || job.agentId !== input.agentId) return { discarded: false };
    this.jobs.delete(input.jobId);
    job.row = { ...job.row, state: "discarded" };
    await this.publish(paseo, input.jobId, job);
    return { discarded: true };
  }

  async test() {
    const readiness = await this.checkReadiness(true);
    if (!readiness.ready) return { ok: false, detail: readiness.detail };
    try {
      return { ok: true, detail: await testConnection(await this.readSettings()) };
    } catch (error) {
      return { ok: false, detail: describe(error) };
    }
  }
}
