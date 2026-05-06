/**
 * Content Script - Reader View TTS Integration
 * 
 * Registers Piper voices into Firefox's native speechSynthesis API
 * Intercepts speech synthesis requests and routes to our Pyodide worker
 */

console.log('[Piper TTS] Content script loaded');

const WORKER_PATH = browser.runtime.getURL('src/piper-worker.js');
let worker = null;
let voiceList = {};

// Initialize Web Worker
function initWorker() {
  if (worker) return;
  console.log('[Piper TTS] Initializing worker from:', WORKER_PATH);
  
  try {
    worker = new Worker(WORKER_PATH);
    
    worker.onmessage = (event) => {
      const { type, audio, error } = event.data;
      console.log('[Piper TTS] Worker message:', type);
      
      if (type === 'READY') {
        console.log('[Piper TTS] Worker ready');
      } else if (type === 'AUDIO_READY') {
        playAudio(audio);
      } else if (type === 'ERROR') {
        console.error('[Piper TTS] Worker error:', error);
      }
    };
    
    worker.onerror = (error) => {
      console.error('[Piper TTS] Worker initialization error:', error);
    };
  } catch (error) {
    console.error('[Piper TTS] Failed to create worker:', error);
  }
}

// Fetch available voices from service worker
async function fetchAvailableVoices() {
  return new Promise((resolve) => {
    console.log('[Piper TTS] Requesting available voices from background');
    
    browser.runtime.sendMessage(
      { type: 'GET_AVAILABLE_VOICES' },
      (response) => {
        console.log('[Piper TTS] Received voices response:', response);
        voiceList = response?.voices || {};
        console.log('[Piper TTS] Voice list count:', Object.keys(voiceList).length);
        resolve(voiceList);
      }
    );
  });
}

// Register Piper voices in speechSynthesis API
async function registerPiperVoices() {
  console.log('[Piper TTS] Registering Piper voices');
  
  const voices = await fetchAvailableVoices();
  console.log('[Piper TTS] Got', Object.keys(voices).length, 'voices');
  
  if (Object.keys(voices).length === 0) {
    console.warn('[Piper TTS] No voices available');
    return;
  }
  
  // Hook into speechSynthesis.speak() to intercept Piper voices
  const originalSpeak = speechSynthesis.speak.bind(speechSynthesis);
  
  speechSynthesis.speak = function(utterance) {
    console.log('[Piper TTS] speak() called with voice:', utterance.voice?.name);
    
    // Check if voice name contains our marker
    if (utterance.voice?.name?.includes('🎤')) {
      console.log('[Piper TTS] Piper voice selected, routing to worker');
      handlePiperSynthesis(utterance);
      return;
    }
    
    // Fall back to native speech synthesis
    console.log('[Piper TTS] Using native voice');
    return originalSpeak(utterance);
  };
  
  // Create proxy voice getter to add Piper voices to list
  const originalGetVoices = speechSynthesis.getVoices.bind(speechSynthesis);
  
  speechSynthesis.getVoices = function() {
    const nativeVoices = originalGetVoices();
    console.log('[Piper TTS] getVoices() called, returning', nativeVoices.length, 'native +', Object.keys(voices).length, 'Piper voices');
    
    // Create Piper voice objects
    const piperVoices = Object.entries(voices).map(([voiceName, voiceData]) => {
      const voice = new SpeechSynthesisVoice();
      Object.defineProperty(voice, 'voiceURI', { value: `piper:${voiceName}`, writable: false });
      Object.defineProperty(voice, 'name', { value: `🎤 ${voiceData.language || 'Unknown'}`, writable: false });
      Object.defineProperty(voice, 'lang', { value: voiceData.language || 'en-US', writable: false });
      Object.defineProperty(voice, 'localService', { value: true, writable: false });
      Object.defineProperty(voice, 'default', { value: false, writable: false });
      return voice;
    });
    
    return [...nativeVoices, ...piperVoices];
  };
  
  // Force voice list update
  speechSynthesis.getVoices();
  console.log('[Piper TTS] Voice registration complete');
}

// Handle Piper voice synthesis
async function handlePiperSynthesis(utterance) {
  console.log('[Piper TTS] Handling Piper synthesis');
  
  if (!worker) initWorker();
  
  const voiceURI = utterance.voice?.voiceURI || '';
  const voiceName = voiceURI.replace('piper:', '');
  const rate = utterance.rate || 1;
  const text = utterance.text;
  
  console.log('[Piper TTS] Synthesizing with voice:', voiceName, 'rate:', rate);
  
  // Split text into sentences for natural pausing
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  console.log('[Piper TTS] Split into', sentences.length, 'sentences');
  
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
      console.log('[Piper TTS] Sending to worker:', trimmed.substring(0, 50) + '...');
      
      worker.postMessage({
        type: 'SYNTHESIZE',
        text: trimmed,
        voiceName,
        rate
      });
    });
    
    // Pause between sentences
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log('[Piper TTS] Synthesis complete');
  utterance.onend?.(new SpeechSynthesisEvent('end'));
}

// Play audio using Web Audio API
async function playAudio(audioData) {
  console.log('[Piper TTS] Playing audio, samples:', audioData.length);
  
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
    
    console.log('[Piper TTS] Audio started playing');
    
    // Wait for playback to finish
    return new Promise((resolve) => {
      source.onended = () => {
        console.log('[Piper TTS] Audio playback finished');
        resolve();
      };
    });
  } catch (error) {
    console.error('[Piper TTS] Audio playback failed:', error);
  }
}

// Initialize on page load
console.log('[Piper TTS] Document ready state:', document.readyState);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[Piper TTS] DOM loaded, registering voices');
    registerPiperVoices();
  });
} else {
  console.log('[Piper TTS] Document already loaded, registering voices immediately');
  registerPiperVoices();
}

console.log('[Piper TTS] Content script initialized');
