// Reaches the host app's native ExpoAudio and FileSystem modules from a plugin
// bundle. Paseo does not expose expo-audio to plugins, so this bundles
// expo-modules-core, which looks native modules up on the app-wide
// `globalThis.expo.modules` registry. Only the native surface this plugin
// needs is typed here; it mirrors expo-audio 1.0.x and expo-file-system 19.x.
import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export interface NativeRecorder {
  readonly uri: string | null;
  readonly isRecording: boolean;
  prepareToRecordAsync(options?: object): Promise<void>;
  record(options?: object): unknown;
  stop(): Promise<void>;
  getStatus(): { durationMillis: number };
  release(): void;
}

export interface NativeAudioModule {
  AudioRecorder: new (options: object) => NativeRecorder;
  requestRecordingPermissionsAsync(): Promise<{ granted: boolean; status: string }>;
  setAudioModeAsync(mode: object): Promise<void>;
}

interface NativeFile {
  readonly exists: boolean;
  base64(): Promise<string>;
  delete(): void;
  validatePath(): void;
}

export interface NativeFileSystemModule {
  FileSystemFile: new (uri: string) => NativeFile;
}

export type NativeModules =
  | { kind: "ok"; audio: NativeAudioModule; fileSystem: NativeFileSystemModule }
  | { kind: "missing"; detail: string };

/** Looks the native modules up without throwing so the UI can report why. */
export function findNativeModules(): NativeModules {
  const audio = requireOptionalNativeModule<NativeAudioModule>("ExpoAudio");
  const fileSystem = requireOptionalNativeModule<NativeFileSystemModule>("FileSystem");
  if (!audio || !fileSystem) {
    return { kind: "missing", detail: `ExpoAudio=${!!audio} FileSystem=${!!fileSystem}` };
  }
  return { kind: "ok", audio, fileSystem };
}

// Mirrors the app's own dictation recorder, at a speech-friendly bit rate:
// mono 16 kHz AAC in an M4A file. The native layer reads only the
// platform-specific keys merged on top of the common ones.
export function nativeRecordingOptions(): object {
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

/** Reads a finished recording as base64 and removes the cache file. */
export async function takeRecording(
  fileSystem: NativeFileSystemModule,
  uri: string,
): Promise<string> {
  const file = new fileSystem.FileSystemFile(uri);
  file.validatePath();
  if (!file.exists) throw new Error(`Recording file does not exist: ${uri}`);
  const base64 = await file.base64();
  file.delete();
  return base64;
}
