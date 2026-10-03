# AI Guru Classroom TTS

## Runtime order

1. Microsoft Edge Read Aloud TTS — primary
2. Google Cloud Text-to-Speech — secondary
3. Existing Sarvam / Piper providers — optional fallback
4. Browser `SpeechSynthesis` — **disabled**

The classroom therefore never silently switches to Chrome's browser voice.

## Edge TTS

The server uses `msedge-tts` (MIT) and the voices:

- English: `en-IN-NeerjaNeural`
- Malayalam: `ml-IN-SobhanaNeural`

No Microsoft account or API key is required by the Edge Read Aloud service. The synthesis is performed server-side.

## Google Cloud TTS

Cloud TTS is also called server-side. Configure either:

- `GOOGLE_CLOUD_TTS_API_KEY`, or
- Google Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` / local `gcloud auth application-default login`).

A Gemini Developer / Google AI Studio API key is **not automatically a Google Cloud Text-to-Speech credential**. If the key stored in `GEMINI_API_KEY` is actually a Google Cloud API key authorized for Cloud TTS, you may set `GOOGLE_CLOUD_TTS_USE_GEMINI_KEY=true`; otherwise use a Cloud TTS credential.

Cloud Text-to-Speech requires the API to be enabled and billing configured for the Google Cloud project. See Google's current authentication guidance before production deployment.
