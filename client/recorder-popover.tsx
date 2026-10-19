import type { PluginButtonContentProps, PluginCommandCapabilities } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { reportProbeRpc, submitRecordingRpc } from "../shared/probe";
import {
  type NativeRecorder,
  probeNativeModules,
  readRecording,
  recordingOptions,
} from "./native-audio";

type Rpc = PluginCommandCapabilities["rpc"];

type Phase =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "uploading" }
  | { kind: "done"; summary: string }
  | { kind: "failed"; message: string };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Popover body that records one clip through the host's native recorder. */
export function createRecorderPopover(rpc: Rpc) {
  return function RecorderPopover({ theme }: PluginButtonContentProps) {
    const [phase, setPhase] = useState<Phase>({ kind: "idle" });
    const [log, setLog] = useState<string[]>([]);
    const recorderRef = useRef<NativeRecorder | null>(null);
    const probe = useMemo(() => probeNativeModules(), []);

    const note = useCallback((step: string, ok: boolean, detail: string) => {
      setLog((lines) => [...lines, `${ok ? "✓" : "✗"} ${step}: ${detail}`]);
      void rpc(reportProbeRpc, { step, ok, detail, platform: Platform.OS }).catch(() => {});
    }, []);

    useEffect(() => {
      note(
        "modules",
        probe.kind === "ok",
        probe.kind === "ok" ? "ExpoAudio and FileSystem found" : probe.detail,
      );
      return () => {
        // Closing the popover mid-recording must not leave the microphone open.
        const recorder = recorderRef.current;
        recorderRef.current = null;
        if (recorder?.isRecording) void recorder.stop().catch(() => {});
        recorder?.release();
      };
    }, [note, probe]);

    const start = useCallback(async () => {
      if (probe.kind !== "ok") return;
      try {
        const permission = await probe.audio.requestRecordingPermissionsAsync();
        note("permission", permission.granted, permission.status);
        if (!permission.granted) throw new Error("Microphone permission denied");
        await probe.audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        const recorder = new probe.audio.AudioRecorder(recordingOptions());
        recorderRef.current = recorder;
        await recorder.prepareToRecordAsync();
        recorder.record();
        note("record", true, "started");
        setPhase({ kind: "recording", startedAt: Date.now() });
      } catch (error) {
        note("start", false, describe(error));
        setPhase({ kind: "failed", message: describe(error) });
      }
    }, [note, probe]);

    const stop = useCallback(async () => {
      const recorder = recorderRef.current;
      if (probe.kind !== "ok" || !recorder) return;
      try {
        const durationMillis = recorder.getStatus().durationMillis;
        await recorder.stop();
        const uri = recorder.uri;
        recorderRef.current = null;
        recorder.release();
        await probe.audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
        if (!uri) throw new Error("Recorder returned no file URI");
        note("stop", true, `uri=${uri}`);
        setPhase({ kind: "uploading" });
        const { base64, size } = await readRecording(probe.fileSystem, uri);
        note("read", true, `size=${size} base64Length=${base64.length}`);
        const result = await rpc(submitRecordingRpc, {
          base64,
          mimeType: "audio/mp4",
          durationMillis,
          platform: Platform.OS,
        });
        const summary =
          `${result.bytes} bytes, ${Math.round(durationMillis)} ms, ` +
          `header=${JSON.stringify(result.header)}\n${result.savedPath}`;
        note("upload", true, summary);
        setPhase({ kind: "done", summary });
      } catch (error) {
        note("stop", false, describe(error));
        setPhase({ kind: "failed", message: describe(error) });
      }
    }, [note, probe]);

    const styles = useMemo(
      () => ({
        body: { gap: 12, padding: 16, minWidth: 280 },
        text: { color: theme.colors.foreground },
        muted: { color: theme.colors.foregroundMuted, fontSize: 12 },
        error: { color: theme.colors.statusDanger },
        button: { padding: 14, borderRadius: 10, backgroundColor: theme.colors.accent },
        buttonText: { color: theme.colors.accentForeground, textAlign: "center" as const },
      }),
      [theme],
    );

    const busy = phase.kind === "uploading";
    const recording = phase.kind === "recording";
    return (
      <View style={styles.body}>
        <Text style={styles.text}>
          {probe.kind === "ok" ? "Native recorder reachable." : `Unavailable: ${probe.detail}`}
        </Text>
        {probe.kind === "ok" ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={recording ? stop : start}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              {busy ? "Uploading…" : recording ? "Stop and upload" : "Start recording"}
            </Text>
          </Pressable>
        ) : null}
        {phase.kind === "done" ? <Text style={styles.text}>{phase.summary}</Text> : null}
        {phase.kind === "failed" ? <Text style={styles.error}>{phase.message}</Text> : null}
        {log.map((line, index) => (
          <Text key={index} style={styles.muted}>
            {line}
          </Text>
        ))}
      </View>
    );
  };
}
