import { useState, useEffect, useRef } from "react";
import { getFilterByKey } from "../data/filters.js";

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

export function ScenePlayer({ scene, isFavorite, onToggleFavorite, hasInteracted }) {
  const [transitioning, setTransitioning] = useState(false);
  const [displayScene, setDisplayScene] = useState(scene);
  const prevIdRef = useRef(null);
  const playerRef = useRef(null);
  const containerRef = useRef(null);

  // Keep latest values in refs to avoid stale closures in YT callbacks
  const hasInteractedRef = useRef(hasInteracted);
  hasInteractedRef.current = hasInteracted;
  // ─── Channel-change transition ───
  useEffect(() => {
    if (!scene) return;
    if (prevIdRef.current && prevIdRef.current !== scene.id) {
      setTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayScene(scene);
        setTransitioning(false);
      }, 900);
      return () => clearTimeout(timer);
    } else {
      setDisplayScene(scene);
    }
    prevIdRef.current = scene.id;
  }, [scene]);

  // ─── Create/recreate YT player when scene changes ───
  useEffect(() => {
    if (!displayScene || transitioning) return;

    let cancelled = false;

    loadYTApi().then(() => {
      if (cancelled) return;

      // Tear down previous player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      // Fresh div — YT.Player replaces the target element with an iframe
      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = "";
      const div = document.createElement("div");
      container.appendChild(div);

      playerRef.current = new window.YT.Player(div, {
        width: "100%",
        height: "100%",
        videoId: displayScene.videoId,
        playerVars: {
          start: displayScene.start,
          end: displayScene.end,
          autoplay: 1,
          mute: hasInteractedRef.current ? 0 : 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          vq: "hd2160",
          enablejsapi: 1,
        },
        events: {
          onReady(event) {
            if (cancelled) return;
            const player = event.target;
            if (hasInteractedRef.current) {
              player.unMute();
              player.setVolume(100);
            }
            player.playVideo();
          },
          onStateChange() {},
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, [displayScene?.id, transitioning]);

  // ─── Unmute + max volume the instant the user first interacts ───
  useEffect(() => {
    if (!hasInteracted || !playerRef.current) return;
    try {
      playerRef.current.unMute();
      playerRef.current.setVolume(100);
    } catch {}
  }, [hasInteracted]);

  if (!displayScene) return null;

  return (
    <div className="scene-player">
      <div className="crt-tv">
        <div className="tv-body">
          <div className="tv-bezel">
            <div className="tv-screen">
              <div ref={containerRef} className="yt-player-container" />
              {transitioning && (
                <div className="tv-transition">
                  <div className="tv-static" />
                  <div className="tv-color-bars">
                    <div style={{ background: "#fff" }} />
                    <div style={{ background: "#ff0" }} />
                    <div style={{ background: "#0ff" }} />
                    <div style={{ background: "#0f0" }} />
                    <div style={{ background: "#f0f" }} />
                    <div style={{ background: "#f00" }} />
                    <div style={{ background: "#00f" }} />
                  </div>
                  <div className="tv-vhold" />
                  <div className="tv-channel-num">
                    CH {Math.floor(Math.random() * 60) + 2}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="tv-controls">
            <span className="tv-brand">Channel Zero</span>
            <div className="tv-knobs">
              <div className="tv-led" />
              <div className="tv-knob" />
              <div className="tv-knob" />
            </div>
          </div>
        </div>
        <div className="tv-stand">
          <div className="tv-leg" />
          <div className="tv-leg" />
        </div>
      </div>

      <div className="scene-info">
        <div className="scene-info-text">
          <blockquote className="scene-quote">"{scene.quote}"</blockquote>
          <p className="scene-description">{scene.description}</p>
          <div className="scene-tags">
            {scene.vibes.map((v) => {
              const filter = getFilterByKey(v);
              return filter ? (
                <span key={v} className="tag-pill" style={{ color: filter.color, borderColor: filter.color }}>
                  {filter.label}
                </span>
              ) : null;
            })}
            {(() => {
              const eraFilter = getFilterByKey(scene.era);
              return eraFilter ? (
                <span className="tag-pill" style={{ color: eraFilter.color, borderColor: eraFilter.color }}>
                  {eraFilter.label}
                </span>
              ) : null;
            })()}
          </div>
          <span className="source-tag">
            {scene.source.title} ({scene.source.year})
          </span>
        </div>
        <div className="scene-actions">
          <button
            className={`fav-btn ${isFavorite ? "fav-active" : ""}`}
            onClick={() => onToggleFavorite(scene.id)}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            {isFavorite ? "♥" : "♡"}
          </button>
        </div>
      </div>
    </div>
  );
}
