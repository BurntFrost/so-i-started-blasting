import { list } from "@vercel/blob";
import { readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";

const QUEUE_FILE = "promotion-queue.json";

async function loadQueue() {
  const { blobs } = await list({ prefix: QUEUE_FILE });
  if (blobs.length === 0) {
    console.log("No promotion queue found.");
    return [];
  }
  const res = await fetch(blobs[0].url);
  return await res.json();
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function toKebab(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function main() {
  const queue = await loadQueue();
  if (queue.length === 0) {
    console.log("Queue is empty. Nothing to review.");
    process.exit(0);
  }

  console.log(`\n📋 ${queue.length} clips in promotion queue\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const approved = [];
  const remaining = [];

  for (const clip of queue) {
    console.log("─".repeat(60));
    console.log(`📺 ${clip.source?.title || "Unknown"} (${clip.source?.year || "?"})`);
    console.log(`   "${clip.quote}"`);
    console.log(`   Vibes: ${clip.vibes?.join(", ")}`);
    console.log(`   Era: ${clip.era}`);
    console.log(`   https://youtube.com/watch?v=${clip.videoId}&t=${clip.start}`);
    if (clip.suggestedVibe) {
      console.log(`   ⚡ Suggested new vibe: ${clip.suggestedVibe}`);
    }
    console.log();

    const answer = await prompt(rl, "  [a]pprove / [r]eject / [s]kip? ");

    if (answer.toLowerCase() === "a") {
      const id = toKebab(clip.source?.title || clip.videoId);
      approved.push({ ...clip, id, _promotedAt: undefined, _ai: undefined, _verified: undefined, _discoveredAt: undefined });
      console.log(`  ✅ Approved as "${id}"`);
    } else if (answer.toLowerCase() === "r") {
      console.log("  ❌ Rejected");
    } else {
      remaining.push(clip);
      console.log("  ⏭️  Skipped (stays in queue)");
    }
  }

  rl.close();

  console.log(`\n📊 Results: ${approved.length} approved, ${queue.length - approved.length - remaining.length} rejected, ${remaining.length} skipped`);

  if (approved.length > 0) {
    const scenesPath = "src/data/scenes.js";
    const scenesContent = readFileSync(scenesPath, "utf-8");
    const insertPoint = scenesContent.lastIndexOf("];");

    const newEntries = approved.map((clip) => {
      const entry = {
        id: clip.id,
        videoId: clip.videoId,
        start: clip.start,
        end: clip.end,
        quote: clip.quote,
        description: clip.description,
        vibes: clip.vibes,
        era: clip.era,
        source: clip.source,
      };
      return `  ${JSON.stringify(entry, null, 2).replace(/\n/g, "\n  ")}`;
    }).join(",\n");

    const updated = scenesContent.slice(0, insertPoint) + ",\n" + newEntries + "\n" + scenesContent.slice(insertPoint);
    writeFileSync(scenesPath, updated);
    console.log(`\n📝 Added ${approved.length} clips to ${scenesPath}`);
    console.log("   Run: npm run sync-clips && git add -A && git commit");
  }

  // Save remaining items back to Blob (overwrites queue with only skipped items)
  const { put } = await import("@vercel/blob");
  await put("promotion-queue.json", JSON.stringify(remaining, null, 2), {
    access: "public",
    addRandomSuffix: false,
  });
  console.log(`\n📦 Queue updated: ${remaining.length} clips remain`);
}

main().catch(console.error);
