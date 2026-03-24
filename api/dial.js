import { callClaude } from "./_lib/claude.js";
import { buildDialPrompt, VALID_VIBES, VALID_ERAS } from "./_lib/prompts.js";
import { verifyVideo } from "./_lib/verify.js";

function sanitizeScene(raw, index, batchTs) {
  // Validate and clean Claude's suggestions
  if (!raw.videoId || typeof raw.videoId !== "string") return null;
  if (typeof raw.start !== "number" || typeof raw.end !== "number") return null;
  if (raw.end <= raw.start) return null;

  const vibes = (raw.vibes || []).filter((v) => VALID_VIBES.includes(v));
  const era = VALID_ERAS.includes(raw.era) ? raw.era : "viral-classics";

  return {
    id: `ai-dial-${batchTs}-${index}`,
    videoId: raw.videoId,
    start: Math.max(0, Math.floor(raw.start)),
    end: Math.floor(raw.end),
    quote: String(raw.quote || "").slice(0, 200),
    description: String(raw.description || "").slice(0, 300),
    vibes: vibes.length > 0 ? vibes : ["chaotic-energy"],
    era,
    source: {
      title: String(raw.source?.title || "Unknown").slice(0, 100),
      year: Number(raw.source?.year) || 2020,
    },
    _ai: true,
    _verified: true,
    _discoveredAt: batchTs,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(400).json({ error: "No API key" });
  }

  const { watchHistory = [], currentVibes = [] } = req.body || {};

  // Set up SSE streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const prompt = buildDialPrompt(watchHistory, currentVibes);
    const text = await callClaude(apiKey, prompt);

    // Parse Claude's JSON response
    let suggestions;
    try {
      suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) throw new Error("Not an array");
    } catch {
      // Try extracting JSON array from response
      const match = text.match(/\[[\s\S]*\]/);
      suggestions = match ? JSON.parse(match[0]) : [];
    }

    // Verify and stream each suggestion (batchTs shared across all scenes in this request)
    const batchTs = Date.now();
    for (let i = 0; i < suggestions.length; i++) {
      const scene = sanitizeScene(suggestions[i], i, batchTs);
      if (!scene) continue;

      const valid = await verifyVideo(scene.videoId);
      if (!valid) continue;

      res.write(`data: ${JSON.stringify({ scene })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
