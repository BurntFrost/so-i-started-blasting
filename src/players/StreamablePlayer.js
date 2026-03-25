// src/players/StreamablePlayer.js

export class StreamablePlayer {
  constructor() {
    this._iframe = null;
    this._ready = false;
    this._options = null;
    this._endTimer = null;
  }

  create(container, scene, options) {
    this._options = options;
    container.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.src = `https://streamable.com/e/${scene.videoId}?autoplay=1${options.muted ? "&muted=1" : ""}`;
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

    // End enforcement via setTimeout (Streamable has no playback API)
    // Start time is NOT supported for Streamable — clips should use start: 0
    const duration = (scene.end || 30) - (scene.start || 0);
    this._endTimer = setTimeout(() => {
      options.onEnded?.();
    }, duration * 1000);
  }

  load(scene) {
    if (!this._iframe) return;
    clearTimeout(this._endTimer);
    this._iframe.src = `https://streamable.com/e/${scene.videoId}?autoplay=1`;
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
  mute() { /* no API control — muted via URL param on create/load */ }
  unmute() { /* no API control */ }
  isReady() { return this._ready; }
}
