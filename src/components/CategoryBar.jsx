import { CATEGORIES } from "../data/categories.js";

export function CategoryBar({ active, onSelect, sceneCounts }) {
  return (
    <div className="category-bar">
      {Object.entries(CATEGORIES).map(([key, cat]) => (
        <button
          key={key}
          className={`category-chip ${active === key ? "chip-active" : ""}`}
          style={{
            "--chip-color": cat.color,
          }}
          onClick={() => onSelect(key)}
        >
          <span className="chip-icon">{cat.icon}</span>
          <span className="chip-label">{cat.label}</span>
          {sceneCounts[key] !== undefined && (
            <span className="chip-count">{sceneCounts[key]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
