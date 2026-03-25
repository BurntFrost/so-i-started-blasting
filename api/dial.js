import { callClaude } from "./_lib/claude.js";
import { buildDiscoveryPrompt, VALID_VIBES, VALID_ERAS } from "./_lib/prompts.js";
import { verifyVideo } from "./_lib/verify.js";
import { checkRateLimit } from "./_lib/ratelimit.js";
import { CLIPS } from "./_lib/scenes-data.js";

// Build a Set of existing library videoIds for fast dedup
const LIBRARY_IDS = new Set(CLIPS.map((c) => c.videoId).filter(Boolean));

function sanitizeScene(raw, index, batchTs) {
  if (!raw.videoId || typeof raw.videoId !== "string") return null;
  if (typeof raw.start !== "number" || typeof raw.end !== "number") return null;

  let start = Math.max(0, Math.floor(raw.start));
  let end = Math.floor(raw.end);

  // Clamp: max 45s duration, fallback if invalid
  if (end <= start || end - start > 45) {
    start = Math.max(0, start);
    end = start + 30;
  }

  const vibes = (raw.vibes || []).filter((v) => VALID_VIBES.includes(v));
  const era = VALID_ERAS.includes(raw.era) ? raw.era : "viral-classics";

  return {
    id: `ai-disc-${batchTs}-${index}`,
    type: "youtube",
    videoId: raw.videoId,
    start,
    end,
    quote: String(raw.quote || "").slice(0, 200),
    description: String(raw.description || "").slice(0, 300),
    vibes: vibes.length > 0 ? vibes : ["chaotic-energy"],
    era,
    source: {
      title: String(raw.source?.title || "Unknown").slice(0, 100),
      year: Number(raw.source?.year) || 2020,
    },
    suggestedVibe: raw.suggestedVibe && typeof raw.suggestedVibe === "string"
      ? raw.suggestedVibe.slice(0, 50)
      : null,
    _ai: true,
    _verified: true,
    _discoveredAt: batchTs,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ─── Auth gate ───
  const byokKey = req.headers.authorization?.replace("Bearer ", "") || null;
  let rateMeta = null;

  if (!byokKey) {
    // Free tier: check rate limit
    const ip = req.headers["x-real-ip"] || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
    rateMeta = await checkRateLimit(ip);

    if (!rateMeta.allowed) {
      res.setHeader("X-RateLimit-Reset", rateMeta.resetsAt);
      return res.status(429).json({
        error: "RATE_LIMITED",
        remaining: 0,
        resetsAt: rateMeta.resetsAt,
      });
    }

    // Free tier must have server-side key configured
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: "Discovery unavailable" });
    }
  }

  const { watchHistory = [], sessionPlayed = [], currentVibes = [] } = req.body || {};

  // ─── SSE setup ───
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const prompt = buildDiscoveryPrompt(watchHistory, currentVibes, sessionPlayed);
    const text = await callClaude(byokKey, prompt);

    // Parse Claude's JSON response
    let suggestions;
    try {
      suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) throw new Error("Not an array");
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      suggestions = match ? JSON.parse(match[0]) : [];
    }

    const batchTs = Date.now();
    const sessionSet = new Set(sessionPlayed);

    // Sanitize and dedup
    const candidates = suggestions
      .map((raw, i) => sanitizeScene(raw, i, batchTs))
      .filter(Boolean)
      .filter((s) => !LIBRARY_IDS.has(s.videoId))      // dedup vs library
      .filter((s) => !sessionSet.has(s.videoId));        // dedup vs session

    // Verify all candidates in parallel
    const verifyResults = await Promise.allSettled(
      candidates.map(async (scene) => {
        const valid = await verifyVideo(scene.videoId);
        return { scene, valid };
      })
    );

    // Stream verified scenes
    for (const result of verifyResults) {
      if (result.status === "fulfilled" && result.value.valid) {
        res.write(`data: ${JSON.stringify({ scene: result.value.scene })}\n\n`);
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  // Send rate limit metadata (for free tier)
  if (rateMeta) {
    res.write(`data: ${JSON.stringify({ meta: rateMeta })}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ meta: { tier: "byok", remaining: null, resetsAt: null } })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
