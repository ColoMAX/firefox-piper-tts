/**
 * Piper Worker - Pyodide TTS Engine
 * 
 * Runs in a Web Worker to avoid blocking the main thread
 * Loads Pyodide + Piper and synthesizes text to audio
 */

let pyodide = null;
let piper = null;
let loadedVoices = {};

// Initialize Pyodide and Piper
async function initPyodide() {
  if (pyodide) return;
  
  try {
    // Load Pyodide from CDN
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.24.0/full/pyodide.js');
    
    pyodide = await loadPyodide();
    
    // Install piper-tts from PyPI
    await pyodide.loadPackage(['numpy', 'scipy']);
    await pyodide.runPythonAsync(`
      import micropip
      await micropip.install('piper-tts')
    `);
    
    piper = pyodide.pyimport('piper');
    
    self.postMessage({ type: 'READY' });
  } catch (error) {
    console.error('Pyodide initialization failed:', error);
    self.postMessage({ type: 'ERROR', error: error.message });
  }
}

// Load voice model
async function loadVoice(voiceName) {
  if (loadedVoices[voiceName]) {
    return loadedVoices[voiceName];
  }
  
  try {
    // Use Piper's built-in download_voices
    await pyodide.runPythonAsync(`
      from piper import download_voices
      download_voices(['${voiceName}'])
    `);
    
    // Load the voice
    const voice = await pyodide.runPythonAsync(`
      from piper import PiperVoice
      PiperVoice.load('${voiceName}')
    `);
    
    loadedVoices[voiceName] = voice;
    return voice;
  } catch (error) {
    throw new Error(`Failed to load voice ${voiceName}: ${error.message}`);
  }
}

// Synthesize text to audio
async function synthesize(text, voiceName, config = {}) {
  try {
    const voice = await loadVoice(voiceName);
    
    // Set up synthesis config
    const synConfig = pyodide.globals.get('dict')();
    if (config.rate) synConfig.set('length_scale', 1 / config.rate);
    
    // Synthesize
    const result = await pyodide.runPythonAsync(`
      import io
      
      voice = ${voice}
      config = dict(length_scale=${config.rate ? 1 / config.rate : 1})
      
      # Synthesize to WAV bytes
      wav_bytes = io.BytesIO()
      voice.synthesize('${text.replace(/'/g, "\\'")}', wav_bytes, **config)
      wav_bytes.getvalue()
    `);
    
    // Convert WAV to Float32Array
    const audioData = wavToFloat32Array(result);
    
    return audioData;
  } catch (error) {
    throw new Error(`Synthesis failed: ${error.message}`);
  }
}

// Convert WAV bytes to Float32Array
function wavToFloat32Array(wavBytes) {
  // Parse WAV header
  const view = new DataView(wavBytes);
  
  // Skip to PCM data (simplified, assumes standard WAV format)
  // WAV structure: header (44 bytes) + audio data
  const offset = 44;
  const samples = (wavBytes.byteLength - offset) / 4; // 32-bit float
  
  const audioData = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    audioData[i] = view.getFloat32(offset + i * 4, true);
  }
  
  return audioData;
}

// Handle messages from content script
self.onmessage = async (event) => {
  const { type, text, voiceName, rate } = event.data;
  
  if (type === 'SYNTHESIZE') {
    try {
      // Initialize on first use
      if (!pyodide) {
        await initPyodide();
      }
      
      const audioData = await synthesize(text, voiceName, { rate });
      
      self.postMessage({
        type: 'AUDIO_READY',
        audio: audioData
      });
    } catch (error) {
      self.postMessage({
        type: 'ERROR',
        error: error.message
      });
    }
  }
};

// Auto-initialize when worker starts
initPyodide();
