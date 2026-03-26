// src/players/VimeoPlayer.js
import { loadScript } from "./PlayerBase.js";

const VIMEO_SDK = "https://player.vimeo.com/api/player.js";
const STALL_TIMEOUT_MS = 5_000;

export class VimeoPlayer {
  constructor() {
    this._player = null;
    this._ready = false;
    this._cancelled = false;
    this._muted = true;
    this._options = null;
    this._scene = null;
    this._endFired = false;
    this._stallTimer = null;
  }

  _startStallTimer() {
    this._clearStallTimer();
    this._stallTimer = setTimeout(() => {
      if (!this._cancelled) this._options?.onError?.();
    }, STALL_TIMEOUT_MS);
  }

  _clearStallTimer() {
    clearTimeout(this._stallTimer);
    this._stallTimer = null;
  }

  _setupEndEnforcement(scene) {
    // Remove any previous timeupdate listener
    if (this._player) this._player.off("timeupdate");
    this._endFired = false;

    if (scene.end && this._player) {
      this._player.on("timeupdate", (data) => {
        if (!this._endFired && data.seconds >= scene.end) {
          this._endFired = true;
          this._player.pause();
          this._options?.onEnded?.();
        }
      });
    }
  }

  create(container, scene, options) {
    this._cancelled = false;
    this._muted = !!options.muted;
    this._options = options;
    this._scene = scene;
    container.innerHTML = "";

    const div = document.createElement("div");
    container.appendChild(div);

    this._startStallTimer();

    loadScript(VIMEO_SDK)
      .then(() => {
        if (this._cancelled) return;
        this._player = new window.Vimeo.Player(div, {
          id: scene.videoId,
          width: "100%",
          autoplay: true,
          muted: !!options.muted,
          transparent: true,
        });

        this._player.ready().then(() => {
          if (this._cancelled) return;
          this._clearStallTimer();
          this._ready = true;
          if (scene.start) this._player.setCurrentTime(scene.start);
          this._options?.onReady?.();
        }).catch(() => {
          if (!this._cancelled) this._options?.onError?.();
        });

        this._player.on("ended", () => {
          if (this._cancelled || this._endFired) return;
          this._options?.onEnded?.();
        });

        this._setupEndEnforcement(scene);
      })
      .catch(() => {
        this._clearStallTimer();
        this._options?.onError?.();
      });
  }

  updateCallbacks(options) {
    this._options = options;
  }

  load(scene) {
    this._scene = scene;
    this._endFired = false;
    if (!this._player) return;
    this._player.loadVideo(scene.videoId).then(() => {
      if (scene.start) this._player.setCurrentTime(scene.start);
      this._setupEndEnforcement(scene);
    }).catch(() => this._options?.onError?.());
  }

  play() { this._player?.play().catch(() => {}); }
  pause() { this._player?.pause().catch(() => {}); }

  destroy() {
    this._cancelled = true;
    this._ready = false;
    this._clearStallTimer();
    if (this._player) {
      this._player.off("timeupdate");
      this._player.off("ended");
    }
    try { this._player?.destroy(); } catch {}
    this._player = null;
  }

  setVolume(vol) { this._player?.setVolume(vol / 100).catch(() => {}); }
  mute() { this._muted = true; this._player?.setMuted(true).catch(() => {}); }
  unmute() { this._muted = false; this._player?.setMuted(false).catch(() => {}); this._player?.setVolume(1).catch(() => {}); }
  isReady() { return this._ready; }
}
