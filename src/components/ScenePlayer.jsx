import { useState, useEffect, useRef } from "react";
import { getFilterByKey } from "../data/filters.js";

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

  const embedUrl = `https://www.youtube.com/embed/${displayScene.videoId}?start=${displayScene.start}&end=${displayScene.end}&autoplay=1&mute=1&rel=0&modestbranding=1&enablejsapi=1`;

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
