# Tidy Voice Prompt

[English](README.md) | [简体中文](README.zh-CN.md)

A [Paseo](https://paseo.sh) plugin for speaking prompts instead of typing
them. Tap **Rec** above an agent's composer, speak, and tap again to stop. The
daemon sends the recording and a few recent turns to an audio-capable model,
which transcribes it and tidies it up, removing filler words, false starts, and
repetition while keeping technical terms. The result goes to the agent as your
prompt.

## Why not Paseo's built-in dictation

- **It tidies, not just transcribes.** What reaches the agent reads like a
  typed prompt rather than a verbatim transcript.
- **It knows the conversation.** Recent turns go along as context, so project
  names, file paths, and identifiers come out spelled right.
- **Mixed-language speech works,** such as Chinese with English technical
  terms.
- **Any OpenAI-compatible audio model,** including internal gateways that
  authenticate with a key helper command.
- **Your phone can close after you stop recording.** Transcription and sending
  happen on the daemon.
- **Every prompt is auditable.** The verbatim transcript stays beside what was
  sent, and you can review before sending.

It works with mixed-language speech, such as Chinese with English technical
terms. The plugin UI is available in English and Simplified Chinese and
follows Paseo's language setting.

## How it works

- **Recording** happens on the client. On iOS and Android the plugin uses the
  Paseo app's own native audio recorder; on desktop and web it uses the
  browser `MediaRecorder`.
- **Transcription** happens on the daemon host. The client uploads the clip and
  is then free to close: the daemon calls the model, sends the message, and
  reports progress in a timeline row in the agent's chat.
- **The timeline row** keeps the verbatim transcript next to the message that
  was sent, so you can check what the model changed.
- Clips shorter than 0.6 s, and clips with no recognizable speech, are never
  sent.
- **Before recording**, the plugin checks that the endpoint, credential, and
  model work by listing models (no tokens spent). A passing check is reused for
  10 minutes; a failing one is retried after 30 seconds, on each tap, and after
  settings are saved. If they do not, the pill
  shows a warning icon and refuses to record, explaining why.

## Setup

Open **Settings → Plugins → Tidy Voice Prompt → Settings**.

| Setting | Default | Notes |
| --- | --- | --- |
| Base URL | Gemini's OpenAI-compatible endpoint | Any OpenAI-compatible `/chat/completions` endpoint that accepts `input_audio`. |
| Model | `gemini-3.5-flash` | Must accept audio input. |
| API key source | API key | `API key`, `Key helper command`, or `None`. |
| API key | empty | Stored in plain text in the daemon's plugin settings and readable by every connected client. |
| Key helper command | empty | Runs in a shell on the daemon host; the last line of its standard output is used as the key. |
| Cache key for | 1800 s | How long a helper's key is reused. `0` reruns it for every recording. |
| Extra headers | none | One `Name: value` per line, sent with every request. |
| Recent turns | 3 | Earlier messages sent as context so the model spells names right. |
| Context size limit | 8000 characters | Oldest context is dropped first. |
| Review before sending | off | Show the tidied text with Send, Edit, and Discard buttons instead. |
| Extra prompt instructions | empty | Appended to the built-in prompt. |
| Plugin language | follow Paseo | English or Simplified Chinese. |

Changes save automatically. Use **Test connection** to check the URL, key, and model with a text-only request.

Settings live in `$PASEO_HOME/plugin-settings/tidy-voice-prompt/preferences.json` on
the daemon host (`~/.paseo` by default) and can also be edited there. For
example, to use an internal gateway with a credential helper:

```json
{
  "version": 1,
  "values": {
    "baseUrl": "https://gateway.example.com/v1",
    "model": "gemini-3.5-flash",
    "authMode": "command",
    "apiKeyCommand": "my-gateway-key-helper",
    "extraHeaders": { "X-Client-Name": "paseo-tidy-voice-prompt" }
  }
}
```

Omitted values take their defaults.

Paseo rewrites this file as a single line on every save. Keys follow a fixed
order (the schema's, with extra headers sorted by name), so for version control
pipe it through `jq --sort-keys .` or `jq .` to get a stable, indented copy;
the plugin reads either form.

## Install

```bash
paseo plugin add github:YoungCatChen/paseo-tidy-voice-prompt
```

Requires Paseo 0.11.0 or later, and `npm` on the daemon host's `PATH`: the
manifest runs `npm ci` to fetch `expo-modules-core`, which the client bundle
uses to reach the app's native recorder.

## Limits

- The pill appears only on existing agents. Paseo gives plugins no place in
  the new-agent or new-workspace composer, nor next to the built-in microphone
  button.
- One recording at a time across all agents on a client.
- A message awaiting review is held in daemon memory; restarting the daemon
  drops it.
- Reaching the native recorder relies on Paseo shipping `expo-audio` and
  `expo-file-system` native modules. A Paseo release that removes or renames
  them would break mobile recording without breaking desktop.
- The audio and recent conversation are sent to the configured endpoint.
- The timeline row appears above the turn's "Worked for" footer. Paseo pins
  that footer to the agent's last reply, and plugins cannot reorder rows.
- Following Paseo's language reads Paseo's own stored app settings, which are
  not a public plugin API. If that ever stops working, the plugin falls back to
  the device language.

## Development

```bash
npm install
npm run check   # typecheck, then parse the client bundle with Hermes
paseo plugin install "$PWD" --id tidy-voice-prompt-dev
paseo plugin reload tidy-voice-prompt-dev
paseo plugin logs tidy-voice-prompt-dev
```

The Paseo mobile app runs plugin client bundles on Hermes, which rejects some
syntax that typecheck and esbuild accept, notably `class`. Client code
therefore uses closures and tagged errors; `npm run check` catches regressions.
