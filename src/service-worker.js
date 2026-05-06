/**
 * Service Worker - Model Management
 * 
 * Fetches available Piper voices from the official server
 * and manages download/cache via IndexedDB
 */

const PIPER_VOICES_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json';
const MODEL_CACHE_DB = 'piper-models';
const MODEL_CACHE_STORE = 'voices';

// Initialize IndexedDB for model caching
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_CACHE_DB, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(MODEL_CACHE_STORE)) {
        db.createObjectStore(MODEL_CACHE_STORE, { keyPath: 'name' });
      }
    };
  });
}

// Fetch available voices from Piper server
async function fetchAvailableVoices() {
  try {
    const response = await fetch(PIPER_VOICES_URL);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch Piper voices:', error);
    return {};
  }
}

// Get cached voice model
async function getCachedVoice(voiceName) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MODEL_CACHE_STORE], 'readonly');
    const store = transaction.objectStore(MODEL_CACHE_STORE);
    const request = store.get(voiceName);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// Cache voice model
async function cacheVoice(voiceName, modelData) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([MODEL_CACHE_STORE], 'readwrite');
    const store = transaction.objectStore(MODEL_CACHE_STORE);
    const request = store.put({
      name: voiceName,
      data: modelData,
      cached_at: new Date().toISOString()
    });
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_AVAILABLE_VOICES') {
    fetchAvailableVoices().then(voices => {
      sendResponse({ voices });
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'GET_VOICE_MODEL') {
    const { voiceName } = message;
    
    (async () => {
      // Check cache first
      const cached = await getCachedVoice(voiceName);
      if (cached) {
        sendResponse({ model: cached.data, cached: true });
        return;
      }
      
      // If not cached, Piper.download_voices will handle it in the worker
      sendResponse({ model: null, cached: false });
    })();
    
    return true;
  }
});
