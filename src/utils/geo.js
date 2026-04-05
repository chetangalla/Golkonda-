/**
 * Calculate the distance between two coordinates using the Haversine formula.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Pre-loaded audio instances, keyed by URL
const audioCache = new Map();

// Audio playback queue – array of { url, name }
let audioQueue = [];
let isPlaying = false;

/**
 * Pre-load an audio file so it's ready to play instantly.
 * Call this as soon as a location is added or the user is within a wider radius.
 */
export function preloadAudio(url) {
  if (!url || audioCache.has(url)) return;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = url;
  // Trigger browser to start fetching/buffering
  audio.load();
  audioCache.set(url, audio);
}

/**
 * Internal helper that plays the next item in the queue.
 */
function _playNext() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const { url, resolve, reject } = audioQueue.shift();

  let audio = audioCache.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = 'auto';
    audioCache.set(url, audio);
  }

  // Reset to start
  try {
    audio.currentTime = 0;
  } catch (e) {}

  const onEnded = () => {
    audio.removeEventListener('ended', onEnded);
    audio.removeEventListener('error', onError);
    resolve();
    _playNext();
  };

  const onError = (e) => {
    audio.removeEventListener('ended', onEnded);
    audio.removeEventListener('error', onError);
    reject(e);
    _playNext(); // Keep queue moving even on error
  };

  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);

  const playPromise = audio.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => {
      console.warn('Audio playback failed:', e);
      reject(e);
      _playNext();
    });
  }
}

/**
 * Enqueue audio for sequential playback.
 * If nothing is currently playing, starts immediately.
 * Returns a promise that resolves when this specific clip finishes.
 */
export function enqueueAudio(url) {
  if (!url) return Promise.reject(new Error('No audio URL provided.'));

  return new Promise((resolve, reject) => {
    // Ensure audio is cached/preloaded
    if (!audioCache.has(url)) {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audioCache.set(url, audio);
    }

    audioQueue.push({ url, resolve, reject });

    if (!isPlaying) {
      _playNext();
    }
  });
}

/**
 * Clear the current audio queue and stop any playing audio.
 */
export function clearAudioQueue() {
  audioQueue = [];
  isPlaying = false;
  for (const [, audio] of audioCache) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) {}
  }
}

/**
 * Legacy single-play helper kept for manual "Test Audio" button.
 * Plays immediately, interrupting the queue.
 */
export function playAudio(url) {
  if (!url) return Promise.reject(new Error('No audio URL provided.'));

  return new Promise((resolve, reject) => {
    try {
      let audio = audioCache.get(url);
      if (!audio) {
        audio = new Audio(url);
        audioCache.set(url, audio);
      }

      try {
        if (audio.readyState >= 1) {
          audio.currentTime = 0;
        }
      } catch (e) {}

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(resolve).catch(e => {
          console.warn('Audio playback failed.', e);
          reject(e);
        });
      } else {
        resolve();
      }
    } catch (error) {
      console.error('Error playing audio', error);
      reject(error);
    }
  });
}
