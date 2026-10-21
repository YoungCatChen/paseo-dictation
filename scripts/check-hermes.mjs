// Bundles the client entry the way the Paseo plugin compiler does (CommonJS,
// ES2020, async lowered, host modules external) and parses it with the Hermes
// compiler shipped in react-native. Hermes in the Paseo app rejects syntax
// that esbuild leaves untouched, such as `class`, so typecheck alone misses it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";

const hostPlatform = { darwin: "osx-bin", linux: "linux64-bin", win32: "win64-bin" }[process.platform];
const hermesc = path.resolve("node_modules/react-native/sdks/hermesc", hostPlatform, "hermesc");

const result = await build({
  entryPoints: ["index.client.tsx"],
  bundle: true,
  format: "cjs",
  jsx: "automatic",
  platform: "neutral",
  target: "es2020",
  mainFields: ["module", "main"],
  supported: { "async-await": false },
  external: ["@getpaseo/plugin", "@getpaseo/plugin/*", "@tanstack/react-query", "react", "react/jsx-runtime", "react-native", "zod"],
  write: false,
  logLevel: "silent",
});

const directory = mkdtempSync(path.join(tmpdir(), "paseo-dictation-"));
try {
  const bundle = path.join(directory, "client.js");
  writeFileSync(bundle, result.outputFiles[0].text);
  execFileSync(hermesc, ["-w", "-emit-binary", "-out", path.join(directory, "client.hbc"), bundle], {
    stdio: "inherit",
  });
  console.log("Hermes parsed the client bundle.");
} catch {
  process.exitCode = 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
