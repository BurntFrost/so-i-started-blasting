// src/players/DailymotionPlayer.js
// Uses iframe embed — the Dailymotion Library Player SDK requires a partner
// player ID that is no longer valid. iframe embed is the reliable fallback.
//
// Ad blockers frequently break Dailymotion embeds — the player gets stuck on
// a black screen waiting for ads that will never load. A fallback timer
// auto-advances after MAX_WAIT_SECONDS to prevent users staring at nothing.

const MAX_WAIT_SECONDS = 5;

export class DailymotionPlayer {
  constructor() {
    this._iframe = null;
    this._ready = false;
    this._muted = true;
    this._options = null;
    this._endTimer = null;
    this._fallbackTimer = null;
  }

  _buildSrc(videoId, start, muted) {
    const params = new URLSearchParams({
      autoplay: "1",
      queue_enable: "0",
      sharing_enable: "0",
      ui_logo: "0",
    });
    if (muted) params.set("mute", "1");
    if (start) params.set("start", String(start));
    return `https://www.dailymotion.com/embed/video/${videoId}?${params}`;
  }

  _clearTimers() {
    clearTimeout(this._endTimer);
    clearTimeout(this._fallbackTimer);
  }

  _setupTimers(scene) {
    this._clearTimers();
    const duration = (scene.end || 30) - (scene.start || 0);

    // Normal end timer — fires onEnded when clip should be done
    this._endTimer = setTimeout(() => {
      this._clearTimers();
      this._options?.onEnded?.();
    }, duration * 1000);

    // Fallback timer — if DM is stuck on blocked ads, skip after MAX_WAIT
    // Only matters for clips longer than MAX_WAIT; short clips end naturally
    if (duration > MAX_WAIT_SECONDS) {
      this._fallbackTimer = setTimeout(() => {
        this._clearTimers();
        this._options?.onError?.();
      }, MAX_WAIT_SECONDS * 1000);
    }
  }

  create(container, scene, options) {
    this._options = options;
    this._muted = !!options.muted;
    container.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.src = this._buildSrc(scene.videoId, scene.start, this._muted);
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "autoplay; fullscreen";

    iframe.addEventListener("load", () => {
      this._ready = true;
      this._options?.onReady?.();
    });

    iframe.addEventListener("error", () => {
      this._clearTimers();
      this._options?.onError?.();
    });

    container.appendChild(iframe);
    this._iframe = iframe;

    this._setupTimers(scene);
  }

  updateCallbacks(options) {
    this._options = options;
  }

  load(scene) {
    if (!this._iframe) return;
    this._clearTimers();
    this._iframe.src = this._buildSrc(scene.videoId, scene.start, this._muted);
    this._setupTimers(scene);
  }

  play() { /* no API control via iframe */ }
  pause() {
    // Remove iframe entirely — setting src="about:blank" causes DM scripts
    // to loop errors in the sandboxed blank page
    this._clearTimers();
    if (this._iframe) {
      this._iframe.removeAttribute("src");
      this._iframe.remove();
      this._iframe = null;
    }
  }

  destroy() {
    this._clearTimers();
    if (this._iframe) {
      this._iframe.removeAttribute("src");
      this._iframe.remove();
    }
    this._iframe = null;
    this._ready = false;
  }

  setVolume() { /* no API control via iframe */ }
  mute() { this._muted = true; /* applied on next load() — no API control */ }
  unmute() { this._muted = false; /* requires new iframe — applied on next load() */ }
  isReady() { return this._ready; }
}
