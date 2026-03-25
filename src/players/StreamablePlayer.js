// src/players/StreamablePlayer.js

export class StreamablePlayer {
  constructor() {
    this._iframe = null;
    this._ready = false;
    this._muted = true;
    this._options = null;
    this._endTimer = null;
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
      this._ready = true;
      options.onReady?.();
      // Start end timer after iframe loads (not at creation) so network
      // latency doesn't eat into the clip's playback duration
      const duration = (scene.end || 30) - (scene.start || 0);
      this._endTimer = setTimeout(() => {
        options.onEnded?.();
      }, duration * 1000);
    });

    iframe.addEventListener("error", () => {
      options.onError?.();
    });

    container.appendChild(iframe);
    this._iframe = iframe;
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
