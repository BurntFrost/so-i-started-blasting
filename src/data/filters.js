export const FILTERS = [
  // Vibes
  { key: "chaotic-energy",   label: "Chaotic Energy",   type: "vibe", color: "#ef4444" },
  { key: "legendary-fails",  label: "Legendary Fails",  type: "vibe", color: "#f97316" },
  { key: "weird-flex",       label: "Weird Flex",       type: "vibe", color: "#84cc16" },
  { key: "unhinged-wisdom",  label: "Unhinged Wisdom",  type: "vibe", color: "#22d3ee" },
  // Eras
  { key: "early-internet",   label: "Early Internet",   type: "era",  color: "#8b5cf6" },
  { key: "viral-classics",   label: "Viral Classics",   type: "era",  color: "#ec4899" },
  { key: "modern-chaos",     label: "Modern Chaos",     type: "era",  color: "#ffd600" },
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
