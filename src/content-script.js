/**
 * Content Script - Reader View TTS Integration
 * 
 * Registers Piper voices into Firefox's native speechSynthesis API
 * Intercepts speech synthesis requests and routes to our Pyodide worker
 */

const WORKER_PATH = chrome.runtime.getURL('src/piper-worker.js');
let worker = null;
let voiceList = [];
let isPlaying = false;

// Initialize Web Worker
function initWorker() {
  if (worker) return;
  worker = new Worker(WORKER_PATH);
  
  worker.onmessage = (event) => {
    const { type, audio, error } = event.data;
    
    if (type === 'READY') {
      console.log('Piper worker ready');
    } else if (type === 'AUDIO_READY') {
      playAudio(audio);
    } else if (type === 'ERROR') {
      console.error('Worker error:', error);
    }
  };
}

// Fetch available voices from service worker
async function fetchAvailableVoices() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_AVAILABLE_VOICES' },
      (response) => {
        voiceList = response.voices || {};
        resolve(voiceList);
      }
    );
  });
}

// Register Piper voices in speechSynthesis API
async function registerPiperVoices() {
  const voices = await fetchAvailableVoices();
  
  // Create synthetic voice objects for each Piper voice
  Object.entries(voices).forEach(([voiceName, voiceData]) => {
    const synVoice = new SpeechSynthesisVoice();
    synVoice.name = `🎤 ${voiceData.language || 'Unknown'}`;
    synVoice.lang = voiceData.language || 'en-US';
    synVoice.voiceURI = `piper:${voiceName}`;
    synVoice.default = false;
    synVoice.localService = true;
    synVoice.rate = 1;
    
    // Inject into speechSynthesis.getVoices()
    Object.defineProperty(speechSynthesis, 'getVoices', {
      value: function() {
        return [...this._originalVoices || [], synVoice];
      }
    });
  });
}

// Intercept speechSynthesis.speak()
const originalSpeak = speechSynthesis.speak.bind(speechSynthesis);
speechSynthesis.speak = function(utterance) {
  // Check if a Piper voice is selected
  if (utterance.voice && utterance.voice.voiceURI.startsWith('piper:')) {
    handlePiperSynthesis(utterance);
    return;
  }
  
  // Fall back to native speech synthesis
  return originalSpeak(utterance);
};

// Handle Piper voice synthesis
async function handlePiperSynthesis(utterance) {
  if (!worker) initWorker();
  
  const voiceName = utterance.voice.voiceURI.replace('piper:', '');
  const rate = utterance.rate || 1;
  const text = utterance.text;
  
  // Split text into sentences for natural pausing
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  isPlaying = true;
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    
    // Request synthesis from worker
    await new Promise((resolve) => {
      const messageHandler = (event) => {
        if (event.data.type === 'AUDIO_READY') {
          worker.removeEventListener('message', messageHandler);
          resolve();
        }
      };
      
      worker.addEventListener('message', messageHandler);
      worker.postMessage({
        type: 'SYNTHESIZE',
        text: trimmed,
        voiceName,
        rate
      });
    });
    
    // Pause between sentences (configurable, default 100ms)
    await new Promise(r => setTimeout(r, utterance.pauseUnitMillis || 100));
  }
  
  isPlaying = false;
  utterance.onend?.(new SpeechSynthesisEvent('end'));
}

// Play audio using Web Audio API
async function playAudio(audioData) {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(
      1, // mono
      audioData.length,
      22050 // sample rate
    );
    
    audioBuffer.getChannelData(0).set(audioData);
    
    // Create source and play
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);
    
    // Wait for playback to finish
    return new Promise((resolve) => {
      source.onended = resolve;
    });
  } catch (error) {
    console.error('Audio playback failed:', error);
  }
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', registerPiperVoices);
} else {
  registerPiperVoices();
}
