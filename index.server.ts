import type { PluginServerContext } from "@getpaseo/plugin/server";
import { DictationJobs } from "./server/jobs";
import { dictateRpc, discardDraftRpc, sendDraftRpc, testConnectionRpc } from "./shared/rpc";
import { dictationSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const jobs = new DictationJobs(server.registerSettings(dictationSettings));
  server.handle(dictateRpc, (input, { paseo }) => jobs.submit(input, paseo));
  server.handle(sendDraftRpc, (input, { paseo }) => jobs.send(input, paseo));
  server.handle(discardDraftRpc, (input, { paseo }) => jobs.discard(input, paseo));
  server.handle(testConnectionRpc, () => jobs.test());
  return () => {};
}
