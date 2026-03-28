#!/usr/bin/env node
/**
 * Batch add iconic sci-fi TV/film clips to scenes.js
 * Usage: node scripts/batch-scifi-icons.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from "fs";

const DRY_RUN = process.argv.includes("--dry-run");

const clips = [
  // ── Mind-Blowing Reveals & Discoveries ─────────────────────────────────
  {
    videoId: "12bU6BFsStU",
    id: "tng-dyson-sphere",
    start: 0, end: 60,
    quote: "It is an almost unimaginable construction.",
    description: "The Enterprise discovers a Dyson Sphere in Star Trek: The Next Generation.",
    vibes: ["iconic-cinema", "existential-dread", "fever-dream"],
    era: "viral-classics",
    source: { title: "Star Trek: The Next Generation", year: 1992 },
  },
  {
    videoId: "dk01eeKMD_I",
    id: "twilight-zone-to-serve-man",
    start: 0, end: 60,
    quote: "It's a cookbook!",
    description: "The horrifying reveal in 'To Serve Man' — the Kanamit book is a cookbook.",
    vibes: ["existential-dread", "iconic-cinema", "dark-humor"],
    era: "ancient-web",
    source: { title: "The Twilight Zone – To Serve Man", year: 1962 },
  },
  {
    videoId: "lscmisu2zI0",
    id: "twilight-zone-time-enough-at-last",
    start: 0, end: 60,
    quote: "That's not fair. That's not fair at all. There was time now...",
    description: "Burgess Meredith finally has time to read — then breaks his glasses.",
    vibes: ["existential-dread", "iconic-cinema", "dark-humor"],
    era: "ancient-web",
    source: { title: "The Twilight Zone – Time Enough at Last", year: 1959 },
  },
  {
    videoId: "ARJ8cAGm6JE",
    id: "hal-9000-sorry-dave",
    start: 0, end: 60,
    quote: "I'm sorry, Dave. I'm afraid I can't do that.",
    description: "HAL 9000 refuses to open the pod bay doors in 2001: A Space Odyssey.",
    vibes: ["existential-dread", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "2001: A Space Odyssey", year: 1968 },
  },
  {
    videoId: "ou6JNQwPWE0",
    id: "2001-stargate-sequence",
    start: 0, end: 60,
    quote: "Beyond the infinite.",
    description: "The psychedelic Star Gate sequence from 2001: A Space Odyssey.",
    vibes: ["fever-dream", "sensory-overload", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "2001: A Space Odyssey", year: 1968 },
  },
  {
    videoId: "6ixvpLCdqkA",
    id: "interstellar-docking-scene",
    start: 0, end: 60,
    quote: "It's not possible. No... it's necessary.",
    description: "Cooper attempts the impossible docking maneuver in Interstellar.",
    vibes: ["chaotic-energy", "iconic-cinema", "sensory-overload"],
    era: "modern-chaos",
    source: { title: "Interstellar", year: 2014 },
  },
  {
    videoId: "MG0PEozw5kk",
    id: "contact-launch-sequence",
    start: 0, end: 60,
    quote: "I'm okay to go.",
    description: "The machine fires up and Ellie Arroway launches into the unknown.",
    vibes: ["iconic-cinema", "sensory-overload", "fever-dream"],
    era: "viral-classics",
    source: { title: "Contact", year: 1997 },
  },

  // ── Intense / Disturbing Sci-Fi ────────────────────────────────────────
  {
    videoId: "3CqtHAbNNjw",
    id: "alien-chestburster-1979",
    start: 0, end: 60,
    quote: "Oh God, it's moving...",
    description: "The chestburster erupts from Kane during dinner in Alien.",
    vibes: ["disturbing", "body-horror", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "Alien", year: 1979 },
  },
  {
    videoId: "MYDgw6DV1gM",
    id: "the-thing-blood-test",
    start: 0, end: 60,
    quote: "I know I'm human. And if you were all these things, then you'd just attack me right now.",
    description: "MacReady tests blood samples to find the Thing — one reacts.",
    vibes: ["disturbing", "chaotic-energy", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "The Thing", year: 1982 },
  },
  {
    videoId: "KomquOrtcCc",
    id: "x-files-scully-meets-mulder",
    start: 0, end: 60,
    quote: "Sorry, nobody down here but the FBI's most unwanted.",
    description: "Scully walks into Mulder's basement office for the first time.",
    vibes: ["iconic-cinema", "pure-nostalgia", "dark-humor"],
    era: "viral-classics",
    source: { title: "The X-Files – Pilot", year: 1993 },
  },
  {
    videoId: "AdmUrPK3VcA",
    id: "black-mirror-white-bear-ending",
    start: 0, end: 60,
    quote: "Every day she wakes up, and she doesn't remember a thing.",
    description: "The horrifying reveal at the end of Black Mirror's 'White Bear'.",
    vibes: ["existential-dread", "disturbing", "dark-humor"],
    era: "modern-chaos",
    source: { title: "Black Mirror – White Bear", year: 2013 },
  },
  {
    videoId: "9S4fnYc3Fyc",
    id: "westworld-violent-delights",
    start: 0, end: 60,
    quote: "These violent delights have violent ends.",
    description: "The phrase that triggers Dolores's awakening in Westworld.",
    vibes: ["existential-dread", "iconic-cinema", "fever-dream"],
    era: "modern-chaos",
    source: { title: "Westworld", year: 2016 },
  },

  // ── Epic Space Battles & Action ────────────────────────────────────────
  {
    videoId: "sjgG_f35vZY",
    id: "bsg-pegasus-sacrifice",
    start: 0, end: 60,
    quote: "Sometimes you gotta roll the hard six.",
    description: "The Pegasus sacrifices itself to save the fleet in Battlestar Galactica.",
    vibes: ["chaotic-energy", "iconic-cinema", "epic-fight-scenes"],
    era: "modern-chaos",
    source: { title: "Battlestar Galactica – Exodus Part 2", year: 2006 },
  },
  {
    videoId: "jk3EsXgXcyQ",
    id: "picard-four-lights",
    start: 0, end: 60,
    quote: "THERE... ARE... FOUR... LIGHTS!",
    description: "Picard's defiant declaration after enduring Cardassian torture.",
    vibes: ["iconic-cinema", "chaotic-energy", "existential-dread"],
    era: "viral-classics",
    source: { title: "Star Trek: TNG – Chain of Command", year: 1992 },
  },
  {
    videoId: "w7KFfbjg3Iw",
    id: "tng-best-of-both-worlds-cliffhanger",
    start: 0, end: 60,
    quote: "Mr. Worf... fire.",
    description: "Riker orders fire on the Borg cube containing Picard — the greatest cliffhanger in TV history.",
    vibes: ["iconic-cinema", "chaotic-energy", "existential-dread"],
    era: "viral-classics",
    source: { title: "Star Trek: TNG – Best of Both Worlds", year: 1990 },
  },
  {
    videoId: "GLheiLGZ1k8",
    id: "empire-strikes-back-i-am-your-father",
    start: 0, end: 60,
    quote: "No... I am your father.",
    description: "Darth Vader reveals the truth to Luke Skywalker on Cloud City.",
    vibes: ["iconic-cinema", "existential-dread"],
    era: "ancient-web",
    source: { title: "Star Wars: The Empire Strikes Back", year: 1980 },
  },
  {
    videoId: "c-Nu3A-q1mU",
    id: "babylon-5-shadow-battle",
    start: 0, end: 60,
    quote: "The Shadows have returned to Z'ha'dum.",
    description: "The first large-scale battle against the Shadows in Babylon 5.",
    vibes: ["chaotic-energy", "epic-fight-scenes", "iconic-cinema"],
    era: "viral-classics",
    source: { title: "Babylon 5", year: 1996 },
  },
  {
    videoId: "x3h7xz558EY",
    id: "stargate-portal-activation",
    start: 0, end: 60,
    quote: "It's working... my God, it's working.",
    description: "The Stargate portal activates for the first time.",
    vibes: ["iconic-cinema", "sensory-overload", "fever-dream"],
    era: "viral-classics",
    source: { title: "Stargate", year: 1994 },
  },

  // ── Classic TV Sci-Fi Moments ──────────────────────────────────────────
  {
    videoId: "RB3z8Ehk6TI",
    id: "doctor-who-tenth-regeneration",
    start: 0, end: 60,
    quote: "I don't want to go.",
    description: "The Tenth Doctor's heartbreaking final regeneration.",
    vibes: ["existential-dread", "iconic-cinema", "pure-nostalgia"],
    era: "modern-chaos",
    source: { title: "Doctor Who – The End of Time", year: 2010 },
  },
  {
    videoId: "0Q14rHLvMco",
    id: "lost-we-have-to-go-back",
    start: 0, end: 60,
    quote: "We have to go back, Kate! We have to go back!",
    description: "Jack's desperate breakdown reveals they escaped the island — the twist that changed everything.",
    vibes: ["chaotic-energy", "existential-dread", "iconic-cinema"],
    era: "modern-chaos",
    source: { title: "Lost – Through the Looking Glass", year: 2007 },
  },
  {
    videoId: "ODmhPsgqGgQ",
    id: "matrix-neo-dodges-bullets",
    start: 0, end: 60,
    quote: "What is he doing? He's beginning to believe.",
    description: "Neo bends reality and dodges bullets in bullet time.",
    vibes: ["iconic-cinema", "epic-fight-scenes", "fever-dream"],
    era: "viral-classics",
    source: { title: "The Matrix", year: 1999 },
  },
];

// ── Main ────────────────────────────────────────────────────────────────────
async function verify(clip) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${clip.videoId}&format=json`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "ChannelZero-Verifier/1.0" },
    });
    if (!res.ok) return { clip, ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    return { clip, ok: true, title: data.title, author: data.author_name };
  } catch (err) {
    return { clip, ok: false, reason: err.message };
  }
}

async function main() {
  console.log(`\n🖖 Sci-Fi Icons Batch — verifying ${clips.length} clips...\n`);

  const results = [];
  const BATCH = 10;
  for (let i = 0; i < clips.length; i += BATCH) {
    const batch = clips.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(verify));
    results.push(...batchResults);
    const done = Math.min(i + BATCH, clips.length);
    const passed = results.filter((r) => r.ok).length;
    process.stdout.write(`\r  ${done}/${clips.length} checked, ${passed} verified`);
    if (i + BATCH < clips.length) await new Promise((r) => setTimeout(r, 500));
  }
  console.log("\n");

  const verified = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`✅ Verified: ${verified.length}`);
  console.log(`❌ Failed:   ${failed.length}\n`);

  verified.forEach((r) => console.log(`  ✅ ${r.clip.id} — "${r.title}"`));
  failed.forEach((r) => console.log(`  ❌ ${r.clip.id} — ${r.reason}`));

  if (DRY_RUN) { console.log("\n🏜️  Dry run — no files modified."); return; }
  if (verified.length === 0) { console.log("\n⚠️  No verified clips."); return; }

  const scenesPath = "src/data/scenes.js";
  let scenes = readFileSync(scenesPath, "utf-8");

  const existingIds = new Set();
  for (const m of scenes.matchAll(/id:\s*"([^"]+)"/g)) existingIds.add(m[1]);

  const newClips = verified.filter((r) => {
    if (existingIds.has(r.clip.id)) { console.log(`  ⏭️  Skipping duplicate: ${r.clip.id}`); return false; }
    return true;
  });

  if (newClips.length === 0) { console.log("\n⚠️  All clips already exist."); return; }

  const entries = newClips.map((r) => {
    const c = r.clip;
    return [
      `  {`,
      `    id: "${c.id}",`,
      `    videoId: "${c.videoId}",`,
      `    start: ${c.start},`,
      `    end: ${c.end},`,
      `    quote: ${JSON.stringify(c.quote)},`,
      `    description: ${JSON.stringify(c.description)},`,
      `    vibes: ${JSON.stringify(c.vibes)},`,
      `    era: "${c.era}",`,
      `    source: { title: ${JSON.stringify(c.source.title)}, year: ${c.source.year} },`,
      `  },`,
    ].join("\n");
  });

  const closingBracket = scenes.lastIndexOf("];");
  const before = scenes.substring(0, closingBracket);
  const after = scenes.substring(closingBracket);

  const newContent =
    before +
    `\n  // ═══════════════════════════════════════════════════════════════\n` +
    `  // 🖖 ICONIC SCI-FI — TV & Film Moments (verified ${new Date().toISOString().split("T")[0]})\n` +
    `  // ═══════════════════════════════════════════════════════════════\n\n` +
    entries.join("\n") + "\n" + after;

  writeFileSync(scenesPath, newContent);
  console.log(`\n🎬 Added ${newClips.length} iconic sci-fi clips to scenes.js`);
}

main().catch(console.error);
