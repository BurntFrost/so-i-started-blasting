import { put, list } from "@vercel/blob";

const QUEUE_FILE = "promotion-queue.json";

async function loadQueue() {
  try {
    const { blobs } = await list({ prefix: QUEUE_FILE });
    if (blobs.length === 0) return [];
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await put(QUEUE_FILE, JSON.stringify(queue, null, 2), {
    access: "public",
    addRandomSuffix: false,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check
  const secret = req.headers["x-promote-secret"];
  if (!secret || secret !== process.env.PROMOTE_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const scene = req.body;
  if (!scene?.videoId) {
    return res.status(400).json({ error: "Missing scene data" });
  }

  const queue = await loadQueue();

  // Dedup by videoId
  if (queue.some((s) => s.videoId === scene.videoId)) {
    return res.json({ queued: false, reason: "already_in_queue", queueSize: queue.length });
  }

  queue.push({
    ...scene,
    _promotedAt: Date.now(),
  });

  await saveQueue(queue);
  return res.json({ queued: true, queueSize: queue.length });
}
