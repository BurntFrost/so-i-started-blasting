export function ScenePlayer({ scene, isFavorite, onToggleFavorite }) {
  if (!scene) return null;

  const embedUrl = `https://www.youtube.com/embed/${scene.videoId}?start=${scene.start}&end=${scene.end}&autoplay=1&rel=0&modestbranding=1`;

  return (
    <div className="scene-player">
      <div className="video-wrapper">
        <iframe
          key={scene.id}
          src={embedUrl}
          title={scene.quote}
          allow="autoplay; encrypted-media"
          allowFullScreen
          loading="lazy"
        />
      </div>

      <div className="scene-info">
        <blockquote className="scene-quote">"{scene.quote}"</blockquote>
        <p className="scene-description">{scene.description}</p>
        <div className="scene-meta">
          <span className="episode-tag">
            S{scene.episode.season}E{scene.episode.episode} — "
            {scene.episode.title}"
          </span>
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
