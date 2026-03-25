// src/players/YouTubePlayer.js

// ─── YouTube IFrame API loader (singleton) ───
let ytApiReady = null;
function loadYTApi() {
  if (ytApiReady) return ytApiReady;
  ytApiReady = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return ytApiReady;
}

const STALL_TIMEOUT_MS = 8000;

export class YouTubePlayer {
  constructor() {
    this._player = null;
    this._ready = false;
    this._cancelled = false;
    this._generation = 0;
    this._options = null;
    this._scene = null;
    this._muted = true;
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

  create(container, scene, options) {
    const gen = ++this._generation;
    this._cancelled = false;
    this._options = options;
    this._scene = scene;
    this._muted = !!options.muted;

    loadYTApi().then(() => {
      if (this._cancelled || this._generation !== gen) return;

      container.innerHTML = "";
      const div = document.createElement("div");
      container.appendChild(div);

      this._player = new window.YT.Player(div, {
        width: "100%",
        height: "100%",
        videoId: scene.videoId,
        playerVars: {
          start: scene.start,
          end: scene.end,
          autoplay: 1,
          mute: this._muted ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          vq: "hd2160",
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (this._cancelled) return;
            this._clearStallTimer();
            this._startStallTimer(); // fresh 8s window for playback to begin
            this._ready = true;
            const player = event.target;
            this._applyQuality(player);
            if (!this._muted) this._applyVolume(player);
            player.playVideo();
            options.onReady?.();
          },
          onError: (event) => {
            if (this._cancelled) return;
            this._clearStallTimer();
            const code = event.data;
            if (code === 2 || code === 5 || code === 100 || code === 101 || code === 150) {
              options.onError?.();
            }
          },
          onStateChange: (event) => {
            if (this._cancelled) return;
            const player = event.target;

            // On play — clear stall timer, max quality, max volume
            if (event.data === 1) {
              this._clearStallTimer();
              this._applyQuality(player);
              if (!this._muted) this._applyVolume(player);
            }

            // State 0 = ended — guard against spurious fires
            if (event.data === 0) {
              try {
                const currentTime = player.getCurrentTime?.();
                if (!Number.isFinite(currentTime)) return;
                if (this._scene?.end) {
                  const clipDuration = this._scene.end - (this._scene.start || 0);
                  const threshold = Math.min(5, clipDuration / 2);
                  if (currentTime < this._scene.end - threshold) {
                    player.seekTo(this._scene.start || 0);
                    player.playVideo();
                    return;
                  }
                }
                options.onEnded?.();
              } catch {}
            }
          },
        },
      });
      this._startStallTimer();
    }).catch(() => {
      this._clearStallTimer();
      options.onError?.();
    });
  }

  load(scene) {
    this._scene = scene;
    if (!this._player || !this._ready) return;
    this._startStallTimer();
    try {
      this._player.loadVideoById({
        videoId: scene.videoId,
        startSeconds: scene.start,
        endSeconds: scene.end,
      });
    } catch {}
  }

  play() {
    try { this._player?.playVideo(); } catch {}
  }

  pause() {
    try { this._player?.pauseVideo(); } catch {}
  }

  destroy() {
    this._generation++;
    this._cancelled = true;
    this._ready = false;
    this._clearStallTimer();
    try { this._player?.destroy(); } catch {}
    this._player = null;
  }

  setVolume(vol) {
    try { this._player?.setVolume(vol); } catch {}
  }

  mute() {
    this._muted = true;
    try { this._player?.mute(); } catch {}
  }

  unmute() {
    this._muted = false;
    try {
      this._player?.unMute();
      this._player?.setVolume(100);
    } catch {}
  }

  isReady() {
    return this._ready;
  }

  // ─── YouTube-specific helpers ───
  _applyQuality(player) {
    try {
      const levels = player.getAvailableQualityLevels?.();
      if (levels?.length) player.setPlaybackQuality(levels[0]);
    } catch {}
  }

  _applyVolume(player) {
    try {
      player.unMute();
      player.setVolume(100);
    } catch {}
  }
}
