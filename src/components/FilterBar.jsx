import { useEffect, useMemo } from "react";
import { FILTERS, VIBE_GROUPS, getVibesByGroup } from "../data/filters.js";
import { SCENES } from "../data/scenes.js";
import { matchesFilters } from "../data/filters.js";

const eras = FILTERS.filter((f) => f.type === "era");

function countIfAdded(filterKey, activeFilters) {
  const hypothetical = [...activeFilters, filterKey];
  return SCENES.filter((s) => matchesFilters(s, hypothetical)).length;
}

function countWithout(filterKey, activeFilters) {
  if (activeFilters.length === 0) return SCENES.length;
  return SCENES.filter((s) =>
    matchesFilters(s, activeFilters.filter((k) => k !== filterKey)),
  ).length;
}

export function FilterBar({ active, onToggle, onClear, onClose }) {
  const counts = useMemo(() => {
    const map = {};
    for (const f of FILTERS) {
      const isActive = active.includes(f.key);
      map[f.key] = isActive
        ? countWithout(f.key, active)
        : countIfAdded(f.key, active);
    }
    return map;
  }, [active]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <>
      <div className="filter-sidebar-overlay" onClick={onClose} aria-hidden="true" />
      <div className="filter-sidebar" role="dialog" aria-modal="true" aria-label="Filters">
        <div className="filter-sidebar-header">
          <h2 className="filter-sidebar-title">🎛 Filters</h2>
          <div className="filter-sidebar-actions">
            {active.length > 0 && (
              <button className="filter-clear" onClick={onClear}>
                ✕ Clear all
              </button>
            )}
            <button className="filter-sidebar-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="filter-groups">
          {VIBE_GROUPS.map((group) => {
            const vibes = getVibesByGroup(group.key);
            return (
              <div key={group.key} className="filter-group">
                <span className="filter-group-label">{group.label}</span>
                <div className="filter-pills">
                  {vibes.map((f) => {
                    const isActive = active.includes(f.key);
                    const count = counts[f.key];
                    return (
                      <button
                        key={f.key}
                        className={`filter-pill ${isActive ? "active" : ""} ${!isActive && count === 0 ? "empty" : ""}`}
                        style={{
                          "--pill-color": f.color,
                          "--pill-bg": f.color + "18",
                          "--pill-glow": f.color + "40",
                        }}
                        onClick={() => onToggle(f.key)}
                        title={isActive ? `Remove ${f.label}` : `${f.label} — ${count} clip${count !== 1 ? "s" : ""}`}
                      >
                        {f.label}
                        {isActive && <span className="pill-count">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="filter-group">
            <span className="filter-group-label">📅 Era</span>
            <div className="filter-pills">
              {eras.map((f) => {
                const isActive = active.includes(f.key);
                const count = counts[f.key];
                return (
                  <button
                    key={f.key}
                    className={`filter-pill ${isActive ? "active" : ""} ${!isActive && count === 0 ? "empty" : ""}`}
                    style={{
                      "--pill-color": f.color,
                      "--pill-bg": f.color + "18",
                      "--pill-glow": f.color + "40",
                    }}
                    onClick={() => onToggle(f.key)}
                    title={isActive ? `Remove ${f.label}` : `${f.label} — ${count} clip${count !== 1 ? "s" : ""}`}
                  >
                    {f.label}
                    {isActive && <span className="pill-count">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
