// src/players/PlayerBase.js

// Singleton script loader — same pattern as the existing loadYTApi
const scriptCache = {};
const SCRIPT_TIMEOUT_MS = 5_000;

export function loadScript(url) {
  if (scriptCache[url]) return scriptCache[url];
  scriptCache[url] = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    // Timeout: ad blockers can silently swallow scripts without firing
    // onload or onerror — this prevents the promise from hanging forever
    const timer = setTimeout(() => {
      delete scriptCache[url];
      reject(new Error(`Script load timed out: ${url}`));
    }, SCRIPT_TIMEOUT_MS);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => {
      clearTimeout(timer);
      delete scriptCache[url]; // Don't cache failures — allow retry
      reject(new Error(`Failed to load script: ${url}`));
    };
    document.head.appendChild(script);
  });
  return scriptCache[url];
}

/**
 * Poll-based end time enforcement for non-YouTube players.
 * Call from timeupdate/polling handlers.
 * Returns a cleanup function to stop the interval.
 *
 * @param {() => number} getCurrentTime - function returning current playback time
 * @param {number} endTime - scene end time in seconds
 * @param {() => void} onEnded - callback when end time is reached
 * @param {number} [intervalMs=250] - polling interval
 * @returns {() => void} cleanup function
 */
export function enforceEndTime(getCurrentTime, endTime, onEnded, intervalMs = 250) {
  if (!endTime) return () => {};
  let fired = false;
  const id = setInterval(() => {
    if (fired) return;
    try {
      const t = getCurrentTime();
      if (Number.isFinite(t) && t >= endTime) {
        fired = true;
        clearInterval(id);
        onEnded();
      }
    } catch {}
  }, intervalMs);
  return () => { fired = true; clearInterval(id); };
}
