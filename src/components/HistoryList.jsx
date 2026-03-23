export function HistoryList({ history, scenes, onSelect, onClear, onClose }) {
  const historyScenes = history
    .map((entry) => {
      const scene = scenes.find((s) => s.id === entry.id);
      return scene ? { ...scene, watchedAt: entry.watchedAt } : null;
    })
    .filter(Boolean);

  const formatTime = (ts) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="favorites-overlay" onClick={onClose}>
      <div className="favorites-panel" onClick={(e) => e.stopPropagation()}>
        <div className="favorites-header">
          <h2>📼 Recently Watched</h2>
          <button className="favorites-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {historyScenes.length === 0 ? (
          <p className="favorites-empty">
            Nothing watched yet. Start blasting to build your history.
          </p>
        ) : (
          <>
            <button className="history-clear-btn" onClick={onClear}>
              Clear history
            </button>
            <div className="favorites-list">
              {historyScenes.map((scene) => (
                <div
                  key={`${scene.id}-${scene.watchedAt}`}
                  className="scene-card"
                  onClick={() => onSelect(scene)}
                >
                  <div className="card-quote">"{scene.quote}"</div>
                  <div className="card-meta">
                    {scene.source.title} ({scene.source.year})
                    <span className="history-time">
                      {" "}
                      · {formatTime(scene.watchedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
