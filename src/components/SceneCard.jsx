export function SceneCard({ scene, onSelect, onRemove }) {
  return (
    <div className="scene-card" onClick={() => onSelect(scene)}>
      <div className="card-quote">"{scene.quote}"</div>
      <div className="card-meta">
        {scene.source.title} ({scene.source.year})
      </div>
      <button
        className="card-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(scene.id);
        }}
        aria-label="Remove from favorites"
      >
        ✕
      </button>
    </div>
  );
}
