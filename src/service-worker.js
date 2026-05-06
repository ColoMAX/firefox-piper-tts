/**
 * Service Worker - Model Management
 * 
 * Fetches available Piper voices from the official server
 * and manages download/cache via IndexedDB
 */

console.log('[Piper TTS] Background script started');

const PIPER_VOICES_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json';
const MODEL_CACHE_DB = 'piper-models';
const MODEL_CACHE_STORE = 'voices';

let voicesCache = null;

// Fetch available voices from Piper server
async function fetchAvailableVoices() {
  console.log('[Piper TTS] Fetching voices from:', PIPER_VOICES_URL);
  
  // Return cached if available
  if (voicesCache) {
    console.log('[Piper TTS] Returning cached voices');
    return voicesCache;
  }
  
  try {
    const response = await fetch(PIPER_VOICES_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    voicesCache = await response.json();
    console.log('[Piper TTS] Successfully fetched', Object.keys(voicesCache).length, 'voices');
    return voicesCache;
  } catch (error) {
    console.error('[Piper TTS] Failed to fetch Piper voices:', error);
    return {};
  }
}

// Handle messages from content script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Piper TTS] Background received message:', message.type);
  
  if (message.type === 'GET_AVAILABLE_VOICES') {
    fetchAvailableVoices().then(voices => {
      console.log('[Piper TTS] Responding with', Object.keys(voices).length, 'voices');
      sendResponse({ voices });
    }).catch(error => {
      console.error('[Piper TTS] Error fetching voices:', error);
      sendResponse({ voices: {} });
    });
    return true; // Keep channel open for async response
  }
});

console.log('[Piper TTS] Background script ready');
