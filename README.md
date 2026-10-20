# Paseo Dictation

Talk to a [Paseo](https://paseo.sh) agent instead of typing. Tap **Rec** above
an agent's composer, speak, and tap **Stop**. The daemon sends the recording
and a few recent turns to an audio-capable model, which transcribes it and
tidies it up, removing filler words, false starts, and repetition while
keeping technical terms. The result goes to the agent as your message.

It works with mixed-language speech, such as Chinese with English technical
terms. The plugin UI is available in English and Simplified Chinese.

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

## Setup

Open **Settings → Plugins → Dictation**.

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
| Plugin language | follow the device | English or Simplified Chinese. |

Use **Test connection** to check the URL, key, and model with a text-only request.

Settings live in `$PASEO_HOME/plugin-settings/<plugin id>/dictation.json` on
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
    "extraHeaders": { "X-Client-Name": "paseo-dictation" }
  }
}
```

Omitted values take their defaults.

## Install

```bash
paseo plugin add github:YoungCatChen/paseo-dictation
```

Requires Paseo 0.11.2 or later, and `npm` on the daemon host's `PATH`: the
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

## Development

```bash
npm install
npm run typecheck
paseo plugin install "$PWD" --id dictation-dev
paseo plugin reload dictation-dev
paseo plugin logs dictation-dev
```
