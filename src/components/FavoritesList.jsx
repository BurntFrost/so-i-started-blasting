import { SceneCard } from "./SceneCard.jsx";

export function FavoritesList({ favoriteIds, scenes, onSelect, onRemove, onClose }) {
  const favoriteScenes = favoriteIds
    .map((id) => scenes.find((s) => s.id === id))
    .filter(Boolean);

  return (
    <div className="favorites-overlay" onClick={onClose}>
      <div className="favorites-panel" onClick={(e) => e.stopPropagation()}>
        <div className="favorites-header">
          <h2>♥ Favorites</h2>
          <button className="favorites-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {favoriteScenes.length === 0 ? (
          <p className="favorites-empty">
            No favorites yet. Start blasting and save the ones you love.
          </p>
        ) : (
          <div className="favorites-list">
            {favoriteScenes.map((scene) => (
              <SceneCard
                key={scene.id}
                scene={scene}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
