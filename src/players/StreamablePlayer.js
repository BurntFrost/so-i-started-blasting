// src/players/StreamablePlayer.js

const STALL_TIMEOUT_MS = 5_000;

export class StreamablePlayer {
  constructor() {
    this._iframe = null;
    this._ready = false;
    this._muted = true;
    this._options = null;
    this._endTimer = null;
    this._stallTimer = null;
  }

  create(container, scene, options) {
    this._options = options;
    this._muted = !!options.muted;
    container.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.src = `https://streamable.com/e/${scene.videoId}?autoplay=1${this._muted ? "&muted=1" : ""}`;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "autoplay; fullscreen";

    iframe.addEventListener("load", () => {
      clearTimeout(this._stallTimer);
      this._ready = true;
      this._options?.onReady?.();
      // Start end timer after iframe loads (not at creation) so network
      // latency doesn't eat into the clip's playback duration
      const duration = (scene.end || 30) - (scene.start || 0);
      this._endTimer = setTimeout(() => {
        this._options?.onEnded?.();
      }, duration * 1000);
    });

    iframe.addEventListener("error", () => {
      clearTimeout(this._stallTimer);
      this._options?.onError?.();
    });

    container.appendChild(iframe);
    this._iframe = iframe;

    // Stall timer: if iframe never loads (blocked by ad blocker), auto-advance
    this._stallTimer = setTimeout(() => {
      if (!this._ready) this._options?.onError?.();
    }, STALL_TIMEOUT_MS);
  }

  updateCallbacks(options) {
    this._options = options;
  }

  load(scene) {
    if (!this._iframe) return;
    clearTimeout(this._endTimer);
    this._iframe.src = `https://streamable.com/e/${scene.videoId}?autoplay=1${this._muted ? "&muted=1" : ""}`;
    const duration = (scene.end || 30) - (scene.start || 0);
    this._endTimer = setTimeout(() => {
      this._options?.onEnded?.();
    }, duration * 1000);
  }

  play() { /* no API control */ }
  pause() { /* no API control */ }

  destroy() {
    clearTimeout(this._endTimer);
    clearTimeout(this._stallTimer);
    if (this._iframe) {
      this._iframe.removeAttribute("src");
      this._iframe.remove();
    }
    this._iframe = null;
    this._ready = false;
  }

  setVolume() { /* no API control */ }
  mute() { this._muted = true; /* applied on next load() */ }
  unmute() { this._muted = false; /* applied on next load() */ }
  isReady() { return this._ready; }
}
