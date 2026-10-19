# Dictation probe (experimental)

A throwaway Paseo plugin that answers one question: can a plugin record audio
on the Paseo mobile app without any change to Paseo itself?

Paseo exposes no recording API to plugins, and the client `require` allowlist
does not include `expo-audio`. This probe bundles `expo-modules-core` into the
client bundle instead. Its `requireOptionalNativeModule` looks native modules up
on the app-wide `globalThis.expo.modules` registry, so the plugin reaches the
host app's own `ExpoAudio` and `FileSystem` native modules directly. The
JavaScript layers of `expo-audio` and `expo-file-system` are not bundled; the
small native surface used here is typed in `client/native-audio.ts`.

## What it does

- Adds a **Rec** composer pill to every agent.
- The pill opens a popover that looks up the native modules, asks for
  microphone permission, records mono 16 kHz AAC (M4A), and uploads the bytes
  to the daemon through a plugin RPC.
- The daemon saves each clip under `~/.paseo/dictation-probe/` and logs every
  probe step with a `[probe]` or `[recording]` prefix.

No transcription happens yet.

## Install

```bash
paseo plugin add github:YoungCatChen/paseo-dictation --ref experimental/recording-probe
paseo plugin logs dictation-probe
```

The manifest runs `npm ci --omit=dev --ignore-scripts --legacy-peer-deps` so the daemon host can
resolve `expo-modules-core` while compiling the client bundle; it needs `npm`
on the daemon's `PATH`.
