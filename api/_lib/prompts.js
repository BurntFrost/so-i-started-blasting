import { CLIPS } from "./scenes-data.js";

export function buildLibraryFingerprint() {
  return CLIPS.map((c) => c.videoId).filter(Boolean).join(", ");
}

export function buildDiscoveryPrompt(watchHistory, currentVibes, sessionPlayed) {
  const fingerprint = buildLibraryFingerprint();

  const historyBlock = watchHistory.map((s) =>
    `- "${s.source?.title}" (${s.era}) [${s.vibes.join(", ")}] — "${s.quote}"`
  ).join("\n");

  const filterBlock = currentVibes.length > 0
    ? `The viewer has these vibe filters active: ${currentVibes.join(", ")}. Lean toward these vibes, but don't limit yourself exclusively to them.`
    : "No filters active. Suggest a diverse mix across vibes and eras.";

  const sessionBlock = sessionPlayed.length > 0
    ? `Already shown this session (also avoid): ${sessionPlayed.join(", ")}`
    : "";

  return `You are a deep-internet video archaeologist. Your job is to unearth YouTube clips that a pirate TV station doesn't already have.

The station already has these videos in its library (do NOT suggest any of these video IDs):
${fingerprint}

${sessionBlock}

Here is what the viewer has been watching recently (use this to understand their taste):
${historyBlock}

${filterBlock}

Dig deep. Find obscure, surprising, weird, or forgotten clips that fit this viewer's taste but are NOT in the library above. Think beyond the obvious viral hits — find the deep cuts, the cult favorites, the clips that got 500K views but never became mainstream memes.

You can suggest clips that don't fit existing categories. If a clip needs a new vibe tag that doesn't exist in the vocabulary below, include a "suggestedVibe" field with your proposed name. Otherwise set suggestedVibe to null.

${VOCABULARY_BLOCK}

Return ONLY a JSON array of exactly 5 objects (no markdown, no explanation):
{
  "videoId": "11-char YouTube video ID (you must be confident this exists)",
  "start": number (seconds — best estimate of an iconic 15-45 second segment),
  "end": number (seconds — must be > start, max 45 seconds after start),
  "quote": "memorable line, moment description, or lyric from this segment",
  "description": "1-2 sentences of context about what makes this clip notable",
  "vibes": ["vibe1"],
  "era": "era-key",
  "source": { "title": "Video or Show Title", "year": number },
  "suggestedVibe": null
}`;
}

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

