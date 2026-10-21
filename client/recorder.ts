import { Platform } from "react-native";
import { levelFromDecibels } from "./level-store";
import {
  findNativeModules,
  type NativeAudioModule,
  type NativeFileSystemModule,
  type NativeRecorder,
  nativeRecordingOptions,
  takeRecording,
} from "./native-audio";

// How often the pill's level meter refreshes while recording.
const kLevelIntervalMillis = 100;

/** Receives input level in [0, 1] and elapsed time while recording. */
export type LevelListener = (level: number, elapsedMillis: number) => void;

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

export type RecorderFailure = "unavailable" | "permission" | "no-file";

// Hermes in the Paseo app cannot parse `class`, and the plugin compiler does
// not lower it, so client code builds tagged errors instead of subclasses.
export interface RecorderError extends Error {
  recorderFailure: RecorderFailure;
}

function recorderError(reason: RecorderFailure, detail: string): RecorderError {
  return Object.assign(new Error(detail), { recorderFailure: reason });
}

export function isRecorderError(error: unknown): error is RecorderError {
  return error instanceof Error && "recorderFailure" in error;
}

async function startNative(
  audio: NativeAudioModule,
  fileSystem: NativeFileSystemModule,
  onLevel: LevelListener,
): Promise<ActiveRecording> {
  const permission = await audio.requestRecordingPermissionsAsync();
  if (!permission.granted) throw recorderError("permission", permission.status);
  await audio.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
  const recorder: NativeRecorder = new audio.AudioRecorder(nativeRecordingOptions());
  await recorder.prepareToRecordAsync();
  recorder.record();
  const meter = setInterval(() => {
    const { durationMillis, metering } = recorder.getStatus();
    onLevel(metering === undefined ? 0 : levelFromDecibels(metering), durationMillis);
  }, kLevelIntervalMillis);

  const finish = async () => {
    clearInterval(meter);
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
      if (!uri) throw recorderError("no-file", "recorder returned no URI");
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
interface BrowserAnalyser {
  fftSize: number;
  getFloatTimeDomainData(samples: Float32Array): void;
}
interface BrowserAudioContext {
  createMediaStreamSource(stream: unknown): { connect(node: BrowserAnalyser): void };
  createAnalyser(): BrowserAnalyser;
  close(): Promise<void>;
}

/** Samples the stream's RMS level; returns a stop function. */
function meterBrowserStream(
  browser: BrowserGlobals,
  stream: unknown,
  startedAt: number,
  onLevel: LevelListener,
): () => void {
  const Context = browser.AudioContext;
  if (!Context) return () => {};
  const context = new Context();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    const rms = Math.sqrt(sum / samples.length);
    onLevel(levelFromDecibels(20 * Math.log10(Math.max(rms, 1e-8))), Date.now() - startedAt);
  }, kLevelIntervalMillis);
  return () => {
    clearInterval(timer);
    void context.close().catch(() => {});
  };
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
  AudioContext?: new () => BrowserAudioContext;
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

async function startBrowser(
  browser: BrowserGlobals,
  onLevel: LevelListener,
): Promise<ActiveRecording> {
  const media = browser.navigator?.mediaDevices;
  const Recorder = browser.MediaRecorder;
  if (!media || !Recorder) throw recorderError("unavailable", "MediaRecorder is unavailable");
  let stream: { getTracks(): BrowserTrack[] };
  try {
    stream = await media.getUserMedia({ audio: { channelCount: 1 } });
  } catch (error) {
    throw recorderError("permission", error instanceof Error ? error.message : String(error));
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
  const stopMeter = meterBrowserStream(browser, stream, startedAt, onLevel);

  const finish = async () => {
    stopMeter();
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
      if (blob.size === 0) throw recorderError("no-file", "recording is empty");
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

export function startRecording(onLevel: LevelListener): Promise<ActiveRecording> {
  if (Platform.OS === "web") return startBrowser(globalThis as BrowserGlobals, onLevel);
  const modules = findNativeModules();
  if (modules.kind === "missing") {
    return Promise.reject(recorderError("unavailable", modules.detail));
  }
  return startNative(modules.audio, modules.fileSystem, onLevel);
}
