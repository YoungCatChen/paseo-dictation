Speak your prompts instead of typing them. Tap **Rec** above an agent's composer, speak, then tap again to stop. The daemon sends the clip and a few recent turns to an audio-capable model of your choice. The model transcribes and tidies what you said, removing filler words, false starts, and repetition while keeping technical terms intact, and the result is sent to the agent as your prompt. Unlike plain dictation, it knows the recent conversation, so names and identifiers come out spelled right.

Mixed-language speech works, for example Chinese with English technical terms. The plugin UI is in English and Simplified Chinese.

## How it works

Recording runs on the client: the app's native recorder on iOS and Android, and the browser recorder on desktop and web. Transcription runs on the daemon, so a phone can close the app right after you stop recording. A row in the agent's chat shows progress and keeps the verbatim transcript beside the message that was sent.

## Setup

Open the plugin's settings and set an OpenAI-compatible base URL (Gemini's by default), a model that accepts audio input (`gemini-3.5-flash` by default), and a credential. A credential can be an API key, a helper command run on the daemon host whose output is the key, or none. You can also add request headers, choose how many recent turns and characters of context to send, and turn on review before sending.

API keys are stored as plain text in the daemon's plugin settings, which every connected client can read. A helper command avoids storing the key. The plugin lists models to confirm the setup works, rechecking every few minutes and after settings change; if it does not work, the pill shows a warning and refuses to record.

## Limits

The audio and recent conversation are sent to the endpoint you configure. The **Rec** pill appears on existing agents only, not in the new-agent or new-workspace composer. The daemon host needs `npm` to install the plugin.
