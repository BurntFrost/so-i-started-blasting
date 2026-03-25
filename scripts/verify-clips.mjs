#!/usr/bin/env node
/**
 * Verify non-YouTube video clips via oEmbed APIs.
 * Usage: node scripts/verify-clips.mjs scripts/candidates.json
 *
 * Outputs:
 *   scripts/verified.json   — clips that passed verification
 *   scripts/failed.json     — clips that failed (for debugging)
 */

import { readFileSync, writeFileSync } from "fs";

const OEMBED_URLS = {
  vimeo: (id) =>
    `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}`,
  dailymotion: (id) =>
    `https://www.dailymotion.com/services/oembed?url=https://www.dailymotion.com/video/${id}&format=json`,
};

async function verifyClip(clip) {
  const builder = OEMBED_URLS[clip.type];
  if (!builder) return { clip, ok: false, reason: `Unknown type: ${clip.type}` };

  const url = builder(clip.videoId);
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "ChannelZero-Verifier/1.0" },
    });
    if (!res.ok) {
      return { clip, ok: false, reason: `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      clip,
      ok: true,
      title: data.title,
      duration: data.duration,
      author: data.author_name,
    };
  } catch (err) {
    return { clip, ok: false, reason: err.message };
  }
}

async function main() {
  const file = process.argv[2] || "scripts/candidates.json";
  const candidates = JSON.parse(readFileSync(file, "utf-8"));

  console.log(`Verifying ${candidates.length} candidates...\n`);

  // Process in batches of 10 to avoid rate limiting
  const results = [];
  const BATCH = 10;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(verifyClip));
    results.push(...batchResults);

    const done = Math.min(i + BATCH, candidates.length);
    const passed = results.filter((r) => r.ok).length;
    process.stdout.write(`\r  ${done}/${candidates.length} checked, ${passed} verified`);

    // Small delay between batches
    if (i + BATCH < candidates.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  console.log("\n");

  const verified = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`✅ Verified: ${verified.length}`);
  console.log(`❌ Failed:   ${failed.length}\n`);

  // Print verified clips with their actual titles
  verified.forEach((r) => {
    console.log(`  ✅ [${r.clip.type}] ${r.clip.id} — "${r.title}" (${r.duration}s) by ${r.author}`);
  });

  if (failed.length > 0) {
    console.log("\nFailed:");
    failed.forEach((r) => {
      console.log(`  ❌ [${r.clip.type}] ${r.clip.id} — ${r.reason}`);
    });
  }

  // Write results
  writeFileSync(
    "scripts/verified.json",
    JSON.stringify(
      verified.map((r) => ({
        ...r.clip,
        _verifiedTitle: r.title,
        _duration: r.duration,
        _author: r.author,
      })),
      null,
      2
    )
  );
  writeFileSync(
    "scripts/failed.json",
    JSON.stringify(
      failed.map((r) => ({ ...r.clip, _reason: r.reason })),
      null,
      2
    )
  );

  console.log("\nWrote scripts/verified.json and scripts/failed.json");
}

main().catch(console.error);
