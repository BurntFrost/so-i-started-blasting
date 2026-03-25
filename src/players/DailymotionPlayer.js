// src/players/DailymotionPlayer.js
import { loadScript } from "./PlayerBase.js";

const DM_SDK = "https://geo.dailymotion.com/libs/player/cl3a5.js";

export class DailymotionPlayer {
  constructor() {
    this._player = null;
    this._ready = false;
    this._options = null;
    this._container = null;
    this._endFired = false;
    this._timeupdateHandler = null;
  }

  _setupEndEnforcement(scene) {
    // Remove previous handler to avoid stacking
    if (this._timeupdateHandler && this._player) {
      this._player.off("timeupdate", this._timeupdateHandler);
    }
    this._endFired = false;
    this._timeupdateHandler = null;

    if (scene.end && this._player) {
      this._timeupdateHandler = (state) => {
        if (!this._endFired && state.videoTime >= scene.end) {
          this._endFired = true;
          this._player.pause();
          this._options?.onEnded?.();
        }
      };
      this._player.on("timeupdate", this._timeupdateHandler);
    }
  }

  create(container, scene, options) {
    this._options = options;
    this._container = container;
    container.innerHTML = "";

    const div = document.createElement("div");
    div.id = `dm-player-${Date.now()}`;
    container.appendChild(div);

    loadScript(DM_SDK)
      .then(() => {
        return window.dailymotion.createPlayer(div.id, {
          video: scene.videoId,
          params: {
            autoplay: true,
            mute: !!options.muted,
            startTime: scene.start || 0,
          },
        });
      })
      .then((player) => {
        this._player = player;
        this._ready = true;
        options.onReady?.();

        player.on("video_end", () => {
          if (!this._endFired) options.onEnded?.();
        });
        player.on("error", () => options.onError?.());

        this._setupEndEnforcement(scene);
      })
      .catch(() => options.onError?.());
  }

  load(scene) {
    this._endFired = false;
    if (!this._player) return;
    this._player.loadContent({
      video: scene.videoId,
      params: { startTime: scene.start || 0 },
    });
    this._setupEndEnforcement(scene);
  }

  play() { this._player?.play(); }
  pause() { this._player?.pause(); }

  destroy() {
    if (this._timeupdateHandler && this._player) {
      this._player.off("timeupdate", this._timeupdateHandler);
    }
    this._ready = false;
    try { this._player?.destroy(); } catch {}
    this._player = null;
  }

  setVolume(vol) { this._player?.setVolume(vol / 100); }
  mute() { this._player?.setMute(true); }
  unmute() { this._player?.setMute(false); this._player?.setVolume(1); }
  isReady() { return this._ready; }
}
