import type { PluginServerContext } from "@getpaseo/plugin/server";
import { reportProbe, submitRecording } from "./server/probe";
import { reportProbeRpc, submitRecordingRpc } from "./shared/probe";

export default function contribute(server: PluginServerContext) {
  server.handle(submitRecordingRpc, submitRecording);
  server.handle(reportProbeRpc, reportProbe);
  return () => {};
}
