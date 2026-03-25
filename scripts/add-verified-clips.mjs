#!/usr/bin/env node
/**
 * Add verified non-YouTube clips to scenes.js
 * Usage: node scripts/add-verified-clips.mjs
 */

import { readFileSync, writeFileSync } from "fs";

const BAD_IDS = ["vimeo-black-hole", "vimeo-fauve"];

const verified = JSON.parse(readFileSync("scripts/verified.json", "utf-8"))
  .filter((c) => !BAD_IDS.includes(c.id));

// Read existing scenes.js
const scenesPath = "src/data/scenes.js";
let scenes = readFileSync(scenesPath, "utf-8");

// Build the new entries
const entries = verified.map((c) => {
  // Clean up internal fields
  const { _verifiedTitle, _duration, _author, ...clip } = c;
  const lines = [];
  lines.push(`  {`);
  lines.push(`    id: "${clip.id}",`);
  lines.push(`    type: "${clip.type}",`);
  lines.push(`    videoId: "${clip.videoId}",`);
  lines.push(`    start: ${clip.start},`);
  lines.push(`    end: ${clip.end},`);
  lines.push(`    quote: ${JSON.stringify(clip.quote)},`);
  lines.push(`    description: ${JSON.stringify(clip.description)},`);
  lines.push(`    vibes: ${JSON.stringify(clip.vibes)},`);
  lines.push(`    era: "${clip.era}",`);
  lines.push(`    source: { title: ${JSON.stringify(clip.source.title)}, year: ${clip.source.year} },`);
  lines.push(`  },`);
  return lines.join("\n");
});

// Insert before the closing ];
const closingBracket = scenes.lastIndexOf("];");
if (closingBracket === -1) {
  console.error("Could not find closing ]; in scenes.js");
  process.exit(1);
}

const before = scenes.substring(0, closingBracket);
const after = scenes.substring(closingBracket);

// Add a comment section header
const newContent =
  before +
  `\n  // ═══════════════════════════════════════════════════════════════\n` +
  `  // NON-YOUTUBE SOURCES — Dailymotion & Vimeo (verified ${new Date().toISOString().split("T")[0]})\n` +
  `  // ═══════════════════════════════════════════════════════════════\n\n` +
  entries.join("\n") +
  "\n" +
  after;

writeFileSync(scenesPath, newContent);
console.log(`Added ${entries.length} verified clips to scenes.js`);
console.log(`  Dailymotion: ${verified.filter((c) => c.type === "dailymotion").length}`);
console.log(`  Vimeo: ${verified.filter((c) => c.type === "vimeo").length}`);
