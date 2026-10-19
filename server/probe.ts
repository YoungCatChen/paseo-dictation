import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import type { reportProbeRpc, submitRecordingRpc } from "../shared/probe";

const kOutputDirectory = path.join(homedir(), ".paseo", "dictation-probe");

export async function submitRecording(input: RpcInput<typeof submitRecordingRpc>) {
  const audio = Buffer.from(input.base64, "base64");
  const extension = input.mimeType.includes("webm") ? "webm" : "m4a";
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const savedPath = path.join(kOutputDirectory, `${stamp}-${input.platform}.${extension}`);
  await mkdir(kOutputDirectory, { recursive: true });
  await writeFile(savedPath, audio);
  // An MP4 container starts with a size word followed by "ftyp".
  const header = audio.subarray(4, 8).toString("latin1");
  console.log(
    `[recording] platform=${input.platform} bytes=${audio.length} ` +
      `durationMs=${input.durationMillis} header=${JSON.stringify(header)} ` +
      `saved=${savedPath}`,
  );
  return { bytes: audio.length, savedPath, header };
}

export function reportProbe(input: RpcInput<typeof reportProbeRpc>) {
  console.log(
    `[probe] platform=${input.platform} step=${input.step} ` +
      `ok=${input.ok} detail=${input.detail}`,
  );
  return { received: true };
}
