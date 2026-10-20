import type {
  PluginButton,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { type Locale, type MessageKey, translate } from "../shared/i18n";
import { dictateRpc } from "../shared/rpc";
import { type ActiveRecording, RecorderError, startRecording } from "./recorder";

// Clips shorter than this are almost always accidental taps.
const kMinDurationMillis = 600;

type PillState = "idle" | "starting" | "recording" | "uploading";

interface AgentPill {
  registration: PluginButtonRegistration;
  state: PillState;
  recording: ActiveRecording | null;
}

/**
 * Maintains one dictation pill per agent. Only one agent records at a time.
 * Actions reject with a localized message; Paseo shows it as a toast.
 */
export class DictationPills {
  private readonly pills = new Map<string, AgentPill>();
  private activeAgentId: string | null = null;

  constructor(
    private readonly client: PluginClientContext,
    private readonly locale: () => Locale,
  ) {}

  private t(key: MessageKey, params?: Record<string, string | number>): string {
    return translate(this.locale(), key, params);
  }

  private button(agentId: string, state: PillState): PluginButton {
    const label =
      state === "recording"
        ? this.t("pill.recording")
        : state === "uploading" || state === "starting"
          ? this.t("pill.uploading")
          : this.t("pill.label");
    return {
      title: this.t("pill.title"),
      icon: state === "recording" ? "Square" : "Mic",
      label,
      disabled: state === "uploading" || state === "starting",
      behavior: { kind: "action", onPress: () => this.toggle(agentId) },
    };
  }

  private setState(agentId: string, state: PillState): void {
    const pill = this.pills.get(agentId);
    if (!pill) return;
    pill.state = state;
    pill.registration.update(this.button(agentId, state));
  }

  register(agent: { id: string; workspaceId?: string | null }): void {
    if (!agent.workspaceId || this.pills.has(agent.id)) return;
    const registration = this.client.addComposerPill({
      id: "dictate",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: this.button(agent.id, "idle"),
    });
    this.pills.set(agent.id, { registration, state: "idle", recording: null });
  }

  remove(agentId: string): void {
    const pill = this.pills.get(agentId);
    if (!pill) return;
    pill.recording?.cancel();
    pill.registration.remove();
    this.pills.delete(agentId);
    if (this.activeAgentId === agentId) this.activeAgentId = null;
  }

  clear(): void {
    for (const agentId of [...this.pills.keys()]) this.remove(agentId);
  }

  private async toggle(agentId: string): Promise<void> {
    const pill = this.pills.get(agentId);
    if (!pill) return;
    if (pill.state === "idle") await this.start(agentId, pill);
    else if (pill.state === "recording") await this.finish(agentId, pill);
  }

  private async start(agentId: string, pill: AgentPill): Promise<void> {
    if (this.activeAgentId) return;
    this.activeAgentId = agentId;
    this.setState(agentId, "starting");
    try {
      pill.recording = await startRecording();
      this.setState(agentId, "recording");
    } catch (error) {
      this.activeAgentId = null;
      this.setState(agentId, "idle");
      throw new Error(this.describe(error));
    }
  }

  private async finish(agentId: string, pill: AgentPill): Promise<void> {
    const recording = pill.recording;
    pill.recording = null;
    if (!recording) return;
    this.setState(agentId, "uploading");
    try {
      const clip = await recording.stop();
      if (clip.durationMillis < kMinDurationMillis) throw new Error(this.t("recorder.tooShort"));
      // The daemon reports progress in the agent's timeline from here on.
      await this.client.rpc(dictateRpc, {
        agentId,
        audioBase64: clip.base64,
        audioFormat: clip.format,
        durationMillis: clip.durationMillis,
      });
    } catch (error) {
      throw new Error(this.describe(error));
    } finally {
      this.activeAgentId = null;
      this.setState(agentId, "idle");
    }
  }

  private describe(error: unknown): string {
    if (error instanceof RecorderError) {
      if (error.reason === "permission") return this.t("recorder.permissionDenied");
      if (error.reason === "no-file") return this.t("recorder.noFile");
      return this.t("recorder.unavailable", { detail: error.message });
    }
    return error instanceof Error ? error.message : String(error);
  }
}
