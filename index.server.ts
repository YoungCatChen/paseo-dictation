import type { PluginServerContext } from "@getpaseo/plugin/server";
import { VoicePromptJobs } from "./server/jobs";
import {
  dictateRpc,
  discardDraftRpc,
  readinessRpc,
  sendDraftRpc,
  testConnectionRpc,
} from "./shared/rpc";
import { voicePromptSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const jobs = new VoicePromptJobs(server.registerSettings(voicePromptSettings));
  server.handle(dictateRpc, (input, { paseo }) => jobs.submit(input, paseo));
  server.handle(sendDraftRpc, (input, { paseo }) => jobs.send(input, paseo));
  server.handle(discardDraftRpc, (input, { paseo }) => jobs.discard(input, paseo));
  server.handle(testConnectionRpc, () => jobs.test());
  server.handle(readinessRpc, ({ refresh }) => jobs.checkReadiness(refresh));
  return () => {};
}
