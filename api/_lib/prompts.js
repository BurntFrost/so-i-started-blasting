// The canonical vocabulary — must stay in sync with src/data/filters.js
export const VALID_VIBES = [
  "chaotic-energy", "dangerous", "epic-fight-scenes", "disturbing",
  "unhinged", "unhinged-wisdom", "unhinged-shorts", "cursed-content", "weird-flex",
  "wholesome-chaos", "chaotic-good", "pure-nostalgia", "awkward-gold", "epic-recovery",
  "iconic-cinema", "legendary-fails", "musical-mayhem", "synchronicity", "funny-revenge",
];

export const VALID_ERAS = ["early-internet", "viral-classics", "modern-chaos", "ancient-web"];

export const MODEL_ID = "claude-haiku-4-5-20251001";

const VOCABULARY_BLOCK = `
VALID VIBES (use ONLY these exact strings): ${VALID_VIBES.join(", ")}
VALID ERAS (use ONLY one of these): ${VALID_ERAS.join(", ")}
`;

export function buildDialPrompt(watchHistory, currentVibes) {
  const historyBlock = watchHistory.map((s) =>
    `- "${s.source?.title}" (${s.era}) [${s.vibes.join(", ")}] — "${s.quote}"`
  ).join("\n");

  const filterBlock = currentVibes.length > 0
    ? `The user currently has these vibe filters active: ${currentVibes.join(", ")}. Lean toward these vibes.`
    : "No filters active. Suggest a diverse mix.";

  return `You are a pirate TV signal decoder that finds YouTube clips people will love.

Here are the user's recent watches:
${historyBlock}

${filterBlock}

Suggest 5-8 YouTube video clips this person would enjoy. For each clip:
- Pick well-known, famous, or iconic YouTube videos (viral moments, movie scenes, TV clips, music videos, internet culture)
- Provide the real 11-character YouTube video ID (you must be confident it exists)
- Choose a specific 15-45 second segment with start and end timestamps in seconds
- Pick a memorable quote or moment description from that segment
- Tag with vibes and era from the vocabulary below

${VOCABULARY_BLOCK}

Return ONLY a JSON array (no markdown, no explanation). Each element:
{
  "videoId": "11-char YouTube ID",
  "start": number,
  "end": number,
  "quote": "memorable line or moment",
  "description": "brief context",
  "vibes": ["vibe1", "vibe2"],
  "era": "era-key",
  "source": { "title": "Video/Show Title", "year": number }
}`;
}

export function buildTapePrompt(watchHistory, favorites) {
  const historyBlock = watchHistory.map((s) =>
    `- "${s.source?.title}" (${s.era}) [${s.vibes.join(", ")}] — "${s.quote}"`
  ).join("\n");

  const favBlock = favorites.length > 0
    ? favorites.map((s) =>
        `- "${s.source?.title}" [${s.vibes.join(", ")}] — "${s.quote}"`
      ).join("\n")
    : "No favorites yet.";

  return `You are a pirate TV curator who assembles mystery VHS tapes based on someone's viewing tastes.

Study this person's watch history:
${historyBlock}

Their favorites:
${favBlock}

Create a themed VHS tape — a curated sequence of 4-6 YouTube clips that follow a mood arc (e.g., start weird, escalate to chaotic, end with something unexpectedly wholesome). The clips should tell a loose "story" through tone and vibe.

For each clip, pick well-known, famous, or iconic YouTube videos. You must be confident the video ID exists.

${VOCABULARY_BLOCK}

Return ONLY a JSON object (no markdown, no explanation):
{
  "name": "TAPE NAME IN ALL CAPS (creative, like a VHS label)",
  "theme": "One-sentence theme description",
  "clips": [
    {
      "videoId": "11-char YouTube ID",
      "start": number,
      "end": number,
      "quote": "memorable line or moment",
      "description": "brief context",
      "vibes": ["vibe1", "vibe2"],
      "era": "era-key",
      "source": { "title": "Video/Show Title", "year": number }
    }
  ]
}`;
}
