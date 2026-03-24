import { callClaude } from "./_lib/claude.js";
import { buildTapePrompt, VALID_VIBES, VALID_ERAS } from "./_lib/prompts.js";
import { verifyVideo } from "./_lib/verify.js";

function sanitizeScene(raw, index, batchTs) {
  if (!raw.videoId || typeof raw.videoId !== "string") return null;
  if (typeof raw.start !== "number" || typeof raw.end !== "number") return null;
  if (raw.end <= raw.start) return null;

  const vibes = (raw.vibes || []).filter((v) => VALID_VIBES.includes(v));
  const era = VALID_ERAS.includes(raw.era) ? raw.era : "viral-classics";

  return {
    id: `ai-tape-${batchTs}-${index}`,
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

  const { watchHistory = [], favorites = [] } = req.body || {};

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const prompt = buildTapePrompt(watchHistory, favorites);
    const text = await callClaude(apiKey, prompt);

    // Parse Claude's JSON response
    let tapeData;
    try {
      tapeData = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      tapeData = match ? JSON.parse(match[0]) : null;
    }

    if (!tapeData || !Array.isArray(tapeData.clips)) {
      throw new Error("Invalid tape format");
    }

    // Stream tape metadata first
    res.write(`data: ${JSON.stringify({
      tape: {
        name: String(tapeData.name || "MYSTERY TAPE").slice(0, 60),
        theme: String(tapeData.theme || "").slice(0, 200),
      }
    })}\n\n`);

    // Verify and stream each clip (batchTs shared across all scenes)
    const batchTs = Date.now();
    for (let i = 0; i < tapeData.clips.length; i++) {
      const scene = sanitizeScene(tapeData.clips[i], i, batchTs);
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
