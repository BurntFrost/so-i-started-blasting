export const FILTERS = [
  // Vibes
  { key: "chaotic-energy",    label: "Chaotic Energy",    type: "vibe", color: "#ef4444" },
  { key: "legendary-fails",   label: "Legendary Fails",   type: "vibe", color: "#f97316" },
  { key: "weird-flex",        label: "Weird Flex",        type: "vibe", color: "#84cc16" },
  { key: "unhinged-wisdom",   label: "Unhinged Wisdom",   type: "vibe", color: "#22d3ee" },
  { key: "pure-nostalgia",    label: "Pure Nostalgia",    type: "vibe", color: "#f472b6" },
  { key: "wholesome-chaos",   label: "Wholesome Chaos",   type: "vibe", color: "#34d399" },
  { key: "cursed-content",    label: "Cursed Content",    type: "vibe", color: "#a855f7" },
  { key: "musical-mayhem",    label: "Musical Mayhem",    type: "vibe", color: "#fb923c" },
  { key: "dangerous",         label: "Dangerous",         type: "vibe", color: "#dc2626" },
  { key: "disturbing",        label: "Disturbing",        type: "vibe", color: "#7c3aed" },
  { key: "chaotic-good",      label: "Chaotic Good",      type: "vibe", color: "#14b8a6" },
  { key: "iconic-cinema",     label: "Iconic Cinema",     type: "vibe", color: "#eab308" },
  { key: "unhinged-shorts",   label: "Unhinged Shorts",   type: "vibe", color: "#06b6d4" },
  // Eras
  { key: "early-internet",    label: "Early Internet",    type: "era",  color: "#8b5cf6" },
  { key: "viral-classics",    label: "Viral Classics",    type: "era",  color: "#ec4899" },
  { key: "modern-chaos",      label: "Modern Chaos",      type: "era",  color: "#ffd600" },
  { key: "ancient-web",       label: "Ancient Web",       type: "era",  color: "#94a3b8" },
];

export const getFilterByKey = (key) => FILTERS.find((f) => f.key === key);

export const matchesFilter = (scene, filterKey) => {
  if (filterKey === "all") return true;
  const filter = getFilterByKey(filterKey);
  if (!filter) return true;
  if (filter.type === "vibe") return scene.vibes.includes(filterKey);
  if (filter.type === "era") return scene.era === filterKey;
  return true;
};
