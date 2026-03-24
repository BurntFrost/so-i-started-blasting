import { useMemo } from "react";
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

export function FilterBar({ active, onToggle, onClear }) {
  const poolSize = useMemo(
    () =>
      active.length === 0
        ? SCENES.length
        : SCENES.filter((s) => matchesFilters(s, active)).length,
    [active],
  );

  return (
    <div className="filter-bar">
      <div className="filter-bar-header">
        <span className="filter-pool-count">{poolSize} clips</span>
        {active.length > 0 && (
          <button className="filter-clear" onClick={onClear}>
            ✕ Clear
          </button>
        )}
      </div>

      <div className="filter-bar-scroll">
        {VIBE_GROUPS.map((group) => {
          const vibes = getVibesByGroup(group.key);
          return (
            <div key={group.key} className="filter-group">
              <span className="filter-group-label">{group.label}</span>
              <div className="filter-pills">
                {vibes.map((f) => {
                  const isActive = active.includes(f.key);
                  const count = isActive
                    ? countWithout(f.key, active)
                    : countIfAdded(f.key, active);
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
                      <span className="pill-count">{isActive ? "✓" : count}</span>
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
              const count = isActive
                ? countWithout(f.key, active)
                : countIfAdded(f.key, active);
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
                  <span className="pill-count">{isActive ? "✓" : count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
