export const FILTERS = [
  // 🔥 Intense
  { key: "chaotic-energy",    label: "Chaotic Energy",    type: "vibe", group: "intense", color: "#ef4444" },
  { key: "dangerous",         label: "Dangerous",         type: "vibe", group: "intense", color: "#dc2626" },
  { key: "epic-fight-scenes", label: "Epic Fight Scenes", type: "vibe", group: "intense", color: "#f59e0b" },
  { key: "disturbing",        label: "Disturbing",        type: "vibe", group: "intense", color: "#7c3aed" },
  { key: "body-horror",       label: "Body Horror",       type: "vibe", group: "intense", color: "#881337" },
  // 🌀 Mind-Melt
  { key: "fever-dream",       label: "Fever Dream",       type: "vibe", group: "mind-melt", color: "#e879f9" },
  { key: "dark-humor",        label: "Dark Humor",        type: "vibe", group: "mind-melt", color: "#6d28d9" },
  { key: "existential-dread", label: "Existential Dread", type: "vibe", group: "mind-melt", color: "#475569" },
  { key: "sensory-overload",  label: "Sensory Overload",  type: "vibe", group: "mind-melt", color: "#f43f5e" },
  { key: "absurdist",         label: "Absurdist",         type: "vibe", group: "mind-melt", color: "#c026d3" },
  // 🤪 Unhinged
  { key: "unhinged",          label: "Unhinged",          type: "vibe", group: "unhinged", color: "#ff6b6b" },
  { key: "unhinged-wisdom",   label: "Unhinged Wisdom",   type: "vibe", group: "unhinged", color: "#22d3ee" },
  { key: "unhinged-shorts",   label: "Unhinged Shorts",   type: "vibe", group: "unhinged", color: "#06b6d4" },
  { key: "cursed-content",    label: "Cursed Content",    type: "vibe", group: "unhinged", color: "#a855f7" },
  { key: "weird-flex",        label: "Weird Flex",        type: "vibe", group: "unhinged", color: "#84cc16" },
  // 😌 Good Vibes
  { key: "wholesome-chaos",   label: "Wholesome Chaos",   type: "vibe", group: "good-vibes", color: "#34d399" },
  { key: "chaotic-good",      label: "Chaotic Good",      type: "vibe", group: "good-vibes", color: "#14b8a6" },
  { key: "pure-nostalgia",    label: "Pure Nostalgia",    type: "vibe", group: "good-vibes", color: "#f472b6" },
  { key: "awkward-gold",      label: "Awkward Gold",      type: "vibe", group: "good-vibes", color: "#c084fc" },
  { key: "epic-recovery",     label: "Epic Recovery",     type: "vibe", group: "good-vibes", color: "#4ade80" },
  // 🎬 Entertainment
  { key: "iconic-cinema",     label: "Iconic Cinema",     type: "vibe", group: "entertainment", color: "#eab308" },
  { key: "legendary-fails",   label: "Legendary Fails",   type: "vibe", group: "entertainment", color: "#f97316" },
  { key: "musical-mayhem",    label: "Musical Mayhem",    type: "vibe", group: "entertainment", color: "#fb923c" },
  { key: "synchronicity",     label: "Synchronicity",     type: "vibe", group: "entertainment", color: "#818cf8" },
  { key: "funny-revenge",     label: "Funny Revenge",     type: "vibe", group: "entertainment", color: "#d946ef" },
  // Eras
  { key: "early-internet",    label: "Early Internet",    type: "era",  color: "#8b5cf6" },
  { key: "viral-classics",    label: "Viral Classics",    type: "era",  color: "#ec4899" },
  { key: "modern-chaos",      label: "Modern Chaos",      type: "era",  color: "#ffd600" },
  { key: "ancient-web",       label: "Ancient Web",       type: "era",  color: "#94a3b8" },
];

export const VIBE_GROUPS = [
  { key: "intense",       label: "🔥 Intense",       color: "#ef4444" },
  { key: "mind-melt",     label: "🌀 Mind-Melt",     color: "#e879f9" },
  { key: "unhinged",      label: "🤪 Unhinged",      color: "#ff6b6b" },
  { key: "good-vibes",    label: "😌 Good Vibes",    color: "#34d399" },
  { key: "entertainment", label: "🎬 Entertainment", color: "#eab308" },
];

export const getFilterByKey = (key) => FILTERS.find((f) => f.key === key);

export const getVibesByGroup = (groupKey) =>
  FILTERS.filter((f) => f.type === "vibe" && f.group === groupKey);

/** Check if a scene matches ALL active filters (AND logic). */
export const matchesFilters = (scene, filterKeys) => {
  if (!filterKeys || filterKeys.length === 0) return true;
  return filterKeys.every((key) => {
    const filter = getFilterByKey(key);
    if (!filter) return true;
    if (filter.type === "vibe") return scene.vibes.includes(key);
    if (filter.type === "era") return scene.era === key;
    return true;
  });
};

/** @deprecated Use matchesFilters (plural) instead */
export const matchesFilter = (scene, filterKey) => {
  if (filterKey === "all") return true;
  return matchesFilters(scene, [filterKey]);
};
