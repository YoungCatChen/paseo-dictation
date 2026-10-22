Speak your prompts instead of typing them. Tap **Rec** above an agent's composer, speak, and tap again to stop. An audio-capable model of your choice transcribes the recording and tidies it, removing filler words, false starts, and repetition while keeping technical terms intact. The result is sent to the agent as your prompt.

Unlike plain dictation, it uses the recent conversation as context, so project names, file paths, and identifiers come out spelled right. Mixed-language speech works, for example Chinese with English technical terms. The plugin UI is available in English and Simplified Chinese and follows Paseo's language setting.

## How it works

Recording runs on the client: the Paseo app's native recorder on iOS and Android, and the browser recorder on desktop and web. While recording, the pill shows live input level bars and elapsed time. The clip is then uploaded to the daemon, which calls the model and sends the result, so a phone can close the app as soon as you stop recording.

A row in the agent's chat shows progress and keeps the verbatim transcript beside the prompt that was sent. With **Review before sending** on, the row shows the tidied text with Send, Edit, and Discard buttons instead of sending it. Clips under 0.6 seconds, and clips with no recognizable speech, are never sent.

## Setup

Open the plugin's settings and choose:

- An OpenAI-compatible base URL. The default is Gemini's OpenAI-compatible endpoint.
- A model that accepts `input_audio` in chat completions. The default is `gemini-3.5-flash`. OpenAI's own chat models do not accept the M4A audio the mobile app records.
- A credential: an API key, a helper command run on the daemon host whose last output line is the key, or none.

Optional settings cover extra request headers, how many recent turns and characters of context to send, extra prompt instructions, review before sending, and the plugin language. Changes save automatically. **Test connection** checks the setup with a short text request.

Before recording, the plugin lists the endpoint's models (no tokens are spent) to confirm the URL, credential, and model work. If they do not, the pill shows a warning icon and refuses to record, explaining why. A passing check is reused for 10 minutes; a failing one is retried on the next tap, after 30 seconds, and whenever settings change.

Requires Paseo 0.11.0 or later.

## Data and access

- Each recording, and up to the configured number of recent user and assistant messages from that agent, is sent to the endpoint you configure, along with any extra headers.
- Settings, including an API key if you enter one, are stored as plain text in the daemon's plugin settings, readable by every client connected to that daemon. A helper command avoids storing the key; it runs with the daemon user's permissions.
- On iOS and Android the plugin calls the Paseo app's built-in Expo audio, file system, and localization native modules directly, and reads Paseo's stored app settings to follow its language. These are not public plugin APIs; if a Paseo release changes them, mobile recording or language detection may stop working while desktop recording keeps working.
- On mobile, the recording file is deleted from the app cache once read for upload; on desktop and web it stays in memory. The daemon holds audio in memory only while the request runs and never writes it to disk. The verbatim transcript and the sent prompt are kept in the agent's chat history, like any other message.

## Limits

- The pill appears on existing agents only. Paseo provides no plugin slot in the new-agent or new-workspace composer, or beside the built-in microphone button.
- One recording at a time per client.
- A prompt awaiting review is held in daemon memory and is lost if the daemon restarts.
- The chat row appears above the turn's "Worked for" footer; plugins cannot reorder rows.
