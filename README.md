# Firefox Piper TTS

A Firefox extension that adds [Piper](https://github.com/OHF-Voice/piper1-gpl) text-to-speech voices to Firefox's native Reader View.

## Features

- 🎤 High-quality Piper voices integrated directly into Reader View
- 📖 Uses Firefox's native Reader View TTS controls (no additional UI)
- 💾 Automatic voice model download and caching on first use
- 🚀 Non-blocking synthesis via Web Worker
- 🐍 Powered by Pyodide + Python Piper TTS

## Requirements

- Firefox 121+
- Voice models are downloaded on-demand (~60-100MB each)

## Installation

1. Clone this repository
2. Open `about:debugging#/runtime/this-firefox` in Firefox
3. Click "Load Temporary Add-on"
4. Select `manifest.json` from this directory

## Usage

1. Open any article in Reader View (or use the Reader View button)
2. Click the speaker icon to enable text-to-speech
3. Choose a Piper voice from the voice dropdown
4. The article will be read aloud using Piper TTS

## Architecture

- **Service Worker**: Manages model downloads and caching
- **Content Script**: Hooks into Reader View's TTS system
- **Web Worker**: Runs Pyodide + Piper synthesis in the background
- **Pyodide**: Browser-based Python runtime
- **Piper TTS**: Python neural text-to-speech engine

## Voice Models

Currently ships with:
- **en_US-lessac-medium**: High-quality US English voice

Additional voices can be added by extending the `VOICE_MODELS` object in `service-worker.js`.

## Development

The main synthesis logic is in `src/piper-worker.js` and needs to be completed:

1. Extract tar.gz model files in the browser
2. Load ONNX model and config JSON
3. Call Piper's Python API: `voice.synthesize(text, config)`
4. Return Float32Array audio samples

## License

GPL-3.0 (compatible with Piper)
