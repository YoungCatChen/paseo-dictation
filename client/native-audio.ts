// Reaches the host app's native ExpoAudio and FileSystem modules from a plugin
// bundle. Paseo does not expose expo-audio to plugins, so this bundles
// expo-modules-core, which looks native modules up on the app-wide
// `globalThis.expo.modules` registry. Only the native surface the probe needs
// is typed here; it mirrors expo-audio 1.0.x and expo-file-system 19.x.
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export interface RecorderStatus {
  canRecord: boolean;
  isRecording: boolean;
  durationMillis: number;
}

export interface NativeRecorder {
  readonly uri: string | null;
  readonly isRecording: boolean;
  prepareToRecordAsync(options?: object): Promise<void>;
  record(options?: object): unknown;
  stop(): Promise<void>;
  getStatus(): RecorderStatus;
  release(): void;
}

interface NativeAudioModule {
  AudioRecorder: new (options: object) => NativeRecorder;
  requestRecordingPermissionsAsync(): Promise<{ granted: boolean; status: string }>;
  setAudioModeAsync(mode: object): Promise<void>;
}

interface NativeFile {
  readonly exists: boolean;
  readonly size: number | null;
  base64(): Promise<string>;
  delete(): void;
}

interface NativeFileSystemModule {
  FileSystemFile: new (uri: string) => NativeFile & { validatePath(): void };
}

export type ModuleProbe =
  | { kind: "ok"; audio: NativeAudioModule; fileSystem: NativeFileSystemModule }
  | { kind: "missing"; detail: string };

/** Looks the native modules up without throwing so the UI can report why. */
export function probeNativeModules(): ModuleProbe {
  if (Platform.OS === "web") {
    return { kind: "missing", detail: "web client has no Expo native modules" };
  }
  const registry = (globalThis as { expo?: { modules?: Record<string, unknown> } }).expo;
  const audio = requireOptionalNativeModule<NativeAudioModule>("ExpoAudio");
  const fileSystem = requireOptionalNativeModule<NativeFileSystemModule>("FileSystem");
  const known = Object.keys(registry?.modules ?? {})
    .sort()
    .join(",");
  if (!audio || !fileSystem) {
    return {
      kind: "missing",
      detail: `ExpoAudio=${!!audio} FileSystem=${!!fileSystem} registry=[${known}]`,
    };
  }
  return { kind: "ok", audio, fileSystem };
}

// Mirrors the app's own dictation recorder: mono 16 kHz AAC in an M4A file.
// The native layer reads only the platform-specific keys merged on top.
export function recordingOptions(): object {
  const common = {
    extension: ".m4a",
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 32000,
    isMeteringEnabled: false,
  };
  if (Platform.OS === "ios") {
    // "aac " is kAudioFormatMPEG4AAC; 127 is AVAudioQuality.max.
    return { ...common, outputFormat: "aac ", audioQuality: 127 };
  }
  return { ...common, outputFormat: "mpeg4", audioEncoder: "aac" };
}

export async function readRecording(
  fileSystem: NativeFileSystemModule,
  uri: string,
): Promise<{ base64: string; size: number | null }> {
  const file = new fileSystem.FileSystemFile(uri);
  file.validatePath();
  if (!file.exists) throw new Error(`Recording file does not exist: ${uri}`);
  const base64 = await file.base64();
  const size = file.size;
  file.delete();
  return { base64, size };
}
