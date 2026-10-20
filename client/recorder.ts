import { Platform } from "react-native";
import {
  findNativeModules,
  type NativeAudioModule,
  type NativeFileSystemModule,
  type NativeRecorder,
  nativeRecordingOptions,
  takeRecording,
} from "./native-audio";

export interface Recording {
  base64: string;
  /** Value for the OpenAI `input_audio.format` field. */
  format: string;
  durationMillis: number;
}

export interface ActiveRecording {
  stop(): Promise<Recording>;
  cancel(): void;
}

export class RecorderError extends Error {
  constructor(
    readonly reason: "unavailable" | "permission" | "no-file",
    detail: string,
  ) {
    super(detail);
  }
}

async function startNative(
  audio: NativeAudioModule,
  fileSystem: NativeFileSystemModule,
): Promise<ActiveRecording> {
  const permission = await audio.requestRecordingPermissionsAsync();
  if (!permission.granted) throw new RecorderError("permission", permission.status);
  await audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
  const recorder: NativeRecorder = new audio.AudioRecorder(nativeRecordingOptions());
  await recorder.prepareToRecordAsync();
  recorder.record();

  const finish = async () => {
    const durationMillis = recorder.getStatus().durationMillis;
    if (recorder.isRecording) await recorder.stop();
    const uri = recorder.uri;
    recorder.release();
    // Hand the audio session back so the app's own playback is unaffected.
    await audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    return { uri, durationMillis };
  };
  return {
    async stop() {
      const { uri, durationMillis } = await finish();
      if (!uri) throw new RecorderError("no-file", "recorder returned no URI");
      return { base64: await takeRecording(fileSystem, uri), format: "mp4", durationMillis };
    },
    cancel() {
      void finish()
        .then(({ uri }) => uri && takeRecording(fileSystem, uri))
        .catch(() => {});
    },
  };
}

// Web and Electron expose standard browser media APIs. This plugin typechecks
// without the DOM library, so declare only what is used.
interface BrowserMediaRecorder {
  readonly mimeType: string;
  state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}
interface BrowserTrack {
  stop(): void;
}
interface BrowserGlobals {
  navigator?: {
    mediaDevices?: {
      getUserMedia(constraints: object): Promise<{ getTracks(): BrowserTrack[] }>;
    };
  };
  MediaRecorder?: {
    new (stream: unknown, options?: object): BrowserMediaRecorder;
    isTypeSupported(type: string): boolean;
  };
  FileReader?: new () => {
    result: unknown;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    readAsDataURL(blob: Blob): void;
  };
}

function blobToBase64(blob: Blob, browser: BrowserGlobals): Promise<string> {
  const Reader = browser.FileReader;
  if (!Reader) return Promise.reject(new Error("FileReader is unavailable"));
  return new Promise((resolve, reject) => {
    const reader = new Reader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.readAsDataURL(blob);
  });
}

async function startBrowser(browser: BrowserGlobals): Promise<ActiveRecording> {
  const media = browser.navigator?.mediaDevices;
  const Recorder = browser.MediaRecorder;
  if (!media || !Recorder) throw new RecorderError("unavailable", "MediaRecorder is unavailable");
  let stream: { getTracks(): BrowserTrack[] };
  try {
    stream = await media.getUserMedia({ audio: { channelCount: 1 } });
  } catch (error) {
    throw new RecorderError("permission", error instanceof Error ? error.message : String(error));
  }
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
    Recorder.isTypeSupported(type),
  );
  const recorder = new Recorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : {});
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = resolve));
  const startedAt = Date.now();
  recorder.start();

  const finish = async () => {
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();
  };
  return {
    async stop() {
      const durationMillis = Date.now() - startedAt;
      await finish();
      const type = recorder.mimeType || mimeType || "audio/webm";
      // React Native's Blob typing requires lastModified; browsers ignore it.
      const blob = new Blob(chunks, { type, lastModified: Date.now() });
      if (blob.size === 0) throw new RecorderError("no-file", "recording is empty");
      return {
        base64: await blobToBase64(blob, browser),
        format: type.includes("mp4") ? "mp4" : "webm",
        durationMillis,
      };
    },
    cancel() {
      void finish();
    },
  };
}

export function startRecording(): Promise<ActiveRecording> {
  if (Platform.OS === "web") return startBrowser(globalThis as BrowserGlobals);
  const modules = findNativeModules();
  if (modules.kind === "missing") {
    return Promise.reject(new RecorderError("unavailable", modules.detail));
  }
  return startNative(modules.audio, modules.fileSystem);
}
