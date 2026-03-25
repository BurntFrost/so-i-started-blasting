// src/players/DailymotionPlayer.js
// Uses iframe embed — the Dailymotion Library Player SDK requires a partner
// player ID that is no longer valid. iframe embed is the reliable fallback.

export class DailymotionPlayer {
  constructor() {
    this._iframe = null;
    this._ready = false;
    this._options = null;
    this._endTimer = null;
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

  _setupEndTimer(scene) {
    clearTimeout(this._endTimer);
    const duration = (scene.end || 30) - (scene.start || 0);
    this._endTimer = setTimeout(() => {
      this._options?.onEnded?.();
    }, duration * 1000);
  }

  create(container, scene, options) {
    this._options = options;
    container.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.src = this._buildSrc(scene.videoId, scene.start, options.muted);
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "autoplay; fullscreen";

    iframe.addEventListener("load", () => {
      this._ready = true;
      options.onReady?.();
    });

    iframe.addEventListener("error", () => {
      options.onError?.();
    });

    container.appendChild(iframe);
    this._iframe = iframe;

    this._setupEndTimer(scene);
  }

  load(scene) {
    if (!this._iframe) return;
    clearTimeout(this._endTimer);
    this._iframe.src = this._buildSrc(scene.videoId, scene.start);
    this._setupEndTimer(scene);
  }

  play() { /* no API control via iframe */ }
  pause() {
    // Stop playback by blanking the iframe src
    if (this._iframe) this._iframe.src = "about:blank";
  }

  destroy() {
    clearTimeout(this._endTimer);
    if (this._iframe) {
      this._iframe.removeAttribute("src");
      this._iframe.remove();
    }
    this._iframe = null;
    this._ready = false;
  }

  setVolume() { /* no API control via iframe */ }
  mute() {
    // Reload with mute param to stop audio bleed
    if (this._iframe && this._iframe.src && !this._iframe.src.includes("about:blank")) {
      const url = new URL(this._iframe.src);
      url.searchParams.set("mute", "1");
      this._iframe.src = url.toString();
    }
  }
  unmute() { /* unmuting requires reload — handled by scene switch */ }
  isReady() { return this._ready; }
}
