import { useState, useEffect, useRef } from "react";

export function ScenePlayer({ scene, isFavorite, onToggleFavorite }) {
  const [transitioning, setTransitioning] = useState(false);
  const [displayScene, setDisplayScene] = useState(scene);
  const prevIdRef = useRef(null);

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

  if (!displayScene) return null;

  const embedUrl = `https://www.youtube.com/embed/${displayScene.videoId}?start=${displayScene.start}&end=${displayScene.end}&autoplay=1&rel=0&modestbranding=1`;

  return (
    <div className="scene-player">
      <div className="crt-tv">
        <div className="tv-body">
          <div className="tv-bezel">
            <div className="tv-screen">
              <iframe
                key={displayScene.id}
                src={embedUrl}
                title={displayScene.quote}
                allow="autoplay; encrypted-media"
                allowFullScreen
                loading="lazy"
              />
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
            <span className="tv-brand">Paddy's Pub</span>
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
          <span className="episode-tag">
            S{scene.episode.season}E{scene.episode.episode} — "
            {scene.episode.title}"
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
