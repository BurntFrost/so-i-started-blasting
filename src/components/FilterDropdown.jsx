import { FILTERS } from "../data/filters.js";

const vibes = FILTERS.filter((f) => f.type === "vibe");
const eras = FILTERS.filter((f) => f.type === "era");

export function FilterDropdown({ active, onSelect }) {
  return (
    <select
      className="filter-dropdown"
      value={active}
      onChange={(e) => onSelect(e.target.value)}
    >
      <option value="all">All</option>
      <optgroup label="Vibe">
        {vibes.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </optgroup>
      <optgroup label="Era">
        {eras.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </optgroup>
    </select>
  );
}
