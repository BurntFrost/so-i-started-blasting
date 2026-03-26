// src/players/DirectVideoPlayer.js
import { enforceEndTime } from "./PlayerBase.js";

const STALL_TIMEOUT_MS = 5_000;

export class DirectVideoPlayer {
  constructor() {
    this._video = null;
    this._ready = false;
    this._options = null;
    this._cleanupEnd = null;
    this._stallTimer = null;
  }

  create(container, scene, options) {
    this._options = options;
    container.innerHTML = "";

    const video = document.createElement("video");
    video.src = scene.videoUrl;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = !!options.muted;
    video.style.cssText = "width:100%;height:100%;object-fit:cover;";

    video.addEventListener("canplay", () => {
      if (this._ready) return;
      clearTimeout(this._stallTimer);
      this._ready = true;
      if (scene.start) video.currentTime = scene.start;
      this._options?.onReady?.();
    }, { once: true });

    video.addEventListener("ended", () => {
      this._options?.onEnded?.();
    });

    video.addEventListener("error", () => {
      clearTimeout(this._stallTimer);
      this._options?.onError?.();
    });

    container.appendChild(video);
    this._video = video;

    // Stall timer: if video never becomes playable (blocked/CORS), auto-advance
    this._stallTimer = setTimeout(() => {
      if (!this._ready) this._options?.onError?.();
    }, STALL_TIMEOUT_MS);

    // End-time enforcement
    if (scene.end) {
      this._cleanupEnd = enforceEndTime(
        () => video.currentTime,
        scene.end,
        () => this._options?.onEnded?.(),
      );
    }
  }

  updateCallbacks(options) {
    this._options = options;
  }

  load(scene) {
    if (!this._video) return;
    this._cleanupEnd?.();
    this._video.src = scene.videoUrl;
    if (scene.start) {
      this._video.addEventListener("canplay", () => {
        this._video.currentTime = scene.start;
      }, { once: true });
    }
    this._video.load();
    this._video.play().catch(() => {});
    if (scene.end) {
      this._cleanupEnd = enforceEndTime(
        () => this._video.currentTime,
        scene.end,
        () => this._options?.onEnded?.(),
      );
    }
  }

  play() { this._video?.play().catch(() => {}); }
  pause() { this._video?.pause(); }

  destroy() {
    clearTimeout(this._stallTimer);
    this._cleanupEnd?.();
    if (this._video) {
      this._video.pause();
      this._video.removeAttribute("src");
      this._video.load(); // release resources
      this._video.remove();
    }
    this._video = null;
    this._ready = false;
  }

  setVolume(vol) { if (this._video) this._video.volume = vol / 100; }
  mute() { if (this._video) this._video.muted = true; }
  unmute() { if (this._video) { this._video.muted = false; this._video.volume = 1; } }
  isReady() { return this._ready; }
}
