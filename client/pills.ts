import type {
  PluginButton,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { type Locale, type MessageKey, translate } from "../shared/i18n";
import { dictateRpc, readinessRpc } from "../shared/rpc";
import { LevelMeterIcon } from "./level-meter";
import { levelStore } from "./level-store";
import { type ActiveRecording, isRecorderError, startRecording } from "./recorder";

// Clips shorter than this are almost always accidental taps.
const kMinDurationMillis = 600;

type PillState = "idle" | "starting" | "recording" | "uploading";

/** Last known daemon readiness; unknown until the first check returns. */
type Readiness = { kind: "unknown" } | { kind: "ready" } | { kind: "blocked"; detail: string };

interface AgentPill {
  registration: PluginButtonRegistration;
  state: PillState;
  recording: ActiveRecording | null;
  /** Whole seconds shown in the label while recording. */
  seconds: number;
}

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Maintains one voice prompt pill per agent. Only one agent records at a time.
 * Actions reject with a localized message; Paseo shows it as a toast.
 *
 * Written as a closure rather than a class: Hermes in the Paseo app cannot
 * parse `class`, and the plugin compiler does not lower it.
 */
export function createVoicePromptPills(client: PluginClientContext, locale: () => Locale) {
  const pills = new Map<string, AgentPill>();
  let activeAgentId: string | null = null;
  let readiness: Readiness = { kind: "unknown" };

  const t = (key: MessageKey, params?: Record<string, string | number>) =>
    translate(locale(), key, params);

  const describe = (error: unknown): string => {
    if (isRecorderError(error)) {
      if (error.recorderFailure === "permission") return t("recorder.permissionDenied");
      if (error.recorderFailure === "no-file") return t("recorder.noFile");
      return t("recorder.unavailable", { detail: error.message });
    }
    return error instanceof Error ? error.message : String(error);
  };

  const button = (agentId: string, state: PillState, seconds = 0): PluginButton => {
    const label =
      state === "recording"
        ? formatElapsed(seconds)
        : state === "uploading" || state === "starting"
          ? t("pill.uploading")
          : t("pill.label");
    const blocked = state === "idle" && readiness.kind === "blocked";
    return {
      title: state === "recording" ? t("pill.recording") : blocked ? t("pill.blocked") : t("pill.title"),
      // The icon shows live level bars on the recording agent's pill.
      icon: blocked ? "TriangleAlert" : LevelMeterIcon,
      label,
      disabled: state === "uploading" || state === "starting",
      behavior: { kind: "action", onPress: () => toggle(agentId) },
    };
  };

  const setState = (agentId: string, state: PillState): void => {
    const pill = pills.get(agentId);
    if (!pill) return;
    pill.state = state;
    pill.seconds = 0;
    pill.registration.update(button(agentId, state));
  };

  // Level updates redraw only the icon; the label changes once per second.
  const onLevel = (agentId: string) => (level: number, elapsedMillis: number) => {
    levelStore.push(level, elapsedMillis);
    const pill = pills.get(agentId);
    const seconds = Math.floor(elapsedMillis / 1000);
    if (!pill || pill.state !== "recording" || seconds === pill.seconds) return;
    pill.seconds = seconds;
    pill.registration.update({ label: formatElapsed(seconds) });
  };

  const relabel = () => {
    for (const [agentId, pill] of pills) {
      pill.registration.update(button(agentId, pill.state, pill.seconds));
    }
  };

  const setReadiness = (next: Readiness) => {
    const changed =
      next.kind !== readiness.kind ||
      (next.kind === "blocked" && readiness.kind === "blocked" && next.detail !== readiness.detail);
    readiness = next;
    if (changed) relabel();
  };

  const checkReadiness = async (refresh: boolean): Promise<Readiness> => {
    try {
      const result = await client.rpc(readinessRpc, { refresh });
      setReadiness(result.ready ? { kind: "ready" } : { kind: "blocked", detail: result.detail });
    } catch (error) {
      // An unreachable plugin backend blocks recording just the same.
      setReadiness({ kind: "blocked", detail: describe(error) });
    }
    return readiness;
  };

  const start = async (agentId: string, pill: AgentPill): Promise<void> => {
    if (activeAgentId) return;
    activeAgentId = agentId;
    setState(agentId, "starting");
    // Recheck when blocked so a fixed setup records at once; otherwise reuse
    // the daemon's cached verdict and refuse before opening the microphone.
    const verdict = await checkReadiness(readiness.kind === "blocked");
    if (verdict.kind === "blocked") {
      activeAgentId = null;
      setState(agentId, "idle");
      throw new Error(t("pill.blockedDetail", { detail: verdict.detail }));
    }
    levelStore.begin(agentId);
    try {
      pill.recording = await startRecording(onLevel(agentId));
      setState(agentId, "recording");
    } catch (error) {
      levelStore.end();
      activeAgentId = null;
      setState(agentId, "idle");
      throw new Error(describe(error));
    }
  };

  const finish = async (agentId: string, pill: AgentPill): Promise<void> => {
    const recording = pill.recording;
    pill.recording = null;
    if (!recording) return;
    levelStore.end();
    setState(agentId, "uploading");
    try {
      const clip = await recording.stop();
      if (clip.durationMillis < kMinDurationMillis) throw new Error(t("recorder.tooShort"));
      // The daemon reports progress in the agent's timeline from here on.
      await client.rpc(dictateRpc, {
        agentId,
        audioBase64: clip.base64,
        audioFormat: clip.format,
        durationMillis: clip.durationMillis,
      });
    } catch (error) {
      throw new Error(describe(error));
    } finally {
      activeAgentId = null;
      setState(agentId, "idle");
      // A failed transcription invalidates the daemon's verdict; pick it up.
      void checkReadiness(false);
    }
  };

  const toggle = async (agentId: string): Promise<void> => {
    const pill = pills.get(agentId);
    if (!pill) return;
    if (pill.state === "idle") await start(agentId, pill);
    else if (pill.state === "recording") await finish(agentId, pill);
  };

  const remove = (agentId: string): void => {
    const pill = pills.get(agentId);
    if (!pill) return;
    pill.recording?.cancel();
    pill.registration.remove();
    pills.delete(agentId);
    if (activeAgentId === agentId) {
      activeAgentId = null;
      levelStore.end();
    }
  };

  return {
    register(agent: { id: string; workspaceId?: string | null }): void {
      if (!agent.workspaceId || pills.has(agent.id)) return;
      const registration = client.addComposerPill({
        id: "dictate",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: button(agent.id, "idle"),
      });
      pills.set(agent.id, { registration, state: "idle", recording: null, seconds: 0 });
      if (readiness.kind === "unknown") void checkReadiness(false);
    },
    remove,
    clear(): void {
      for (const agentId of [...pills.keys()]) remove(agentId);
    },
    /** Re-renders every pill, e.g. after the UI language changes. */
    relabel,
    /** Asks the daemon again, e.g. after settings change. */
    recheck(): void {
      void checkReadiness(true);
    },
  };
}
