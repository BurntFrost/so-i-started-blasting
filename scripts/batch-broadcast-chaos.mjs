#!/usr/bin/env node
/**
 * Batch add broadcast chaos clips (late 80s–90s) to scenes.js
 * Usage: node scripts/batch-broadcast-chaos.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from "fs";

const DRY_RUN = process.argv.includes("--dry-run");

// ── Clip definitions ────────────────────────────────────────────────────────
const clips = [
  // Late 1980s: Cracks in the Broadcast Facade
  {
    url: "https://www.youtube.com/watch?v=XXt-ioTk4_c",
    id: "geraldo-nose-broken-1988",
    start: 0, end: 60,
    quote: "A live stage brawl broke Geraldo's nose on national television.",
    description: "Geraldo Rivera gets his nose broken during a live on-air brawl in 1988.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "Geraldo Rivera Show", year: 1988 },
  },
  {
    url: "https://www.youtube.com/watch?v=YzrnbjwMKhE",
    id: "morton-downey-jr-promo",
    start: 0, end: 60,
    quote: "The Morton Downey Jr. Show defined combative television.",
    description: "Promo illustrating the era's combative talk show format.",
    vibes: ["chaotic-energy", "unhinged"],
    era: "ancient-web",
    source: { title: "The Morton Downey Jr. Show", year: 1988 },
  },
  {
    url: "https://www.youtube.com/watch?v=qM8wyN6yrZw",
    id: "roy-innis-vs-sharpton",
    start: 0, end: 60,
    quote: "Things got physical on The Morton Downey Jr. Show.",
    description: "Roy Innis physically confronts Al Sharpton on The Morton Downey Jr. Show.",
    vibes: ["chaotic-energy", "dangerous", "epic-fight-scenes"],
    era: "ancient-web",
    source: { title: "The Morton Downey Jr. Show", year: 1988 },
  },
  {
    url: "https://m.youtube.com/shorts/eqHqg_kQveg",
    id: "black-monday-retrospective",
    start: 0, end: 60,
    quote: "The market crashed 22% in a single day.",
    description: "Retrospective analysis of the 1987 Black Monday stock market crash.",
    vibes: ["existential-dread", "dark-humor"],
    era: "ancient-web",
    source: { title: "Black Monday Retrospective", year: 1987 },
  },
  {
    url: "https://www.youtube.com/watch?v=0_8YEglCFdU",
    id: "wpix-black-monday-1987",
    start: 0, end: 60,
    quote: "Panic on Wall Street — live from the trading floor.",
    description: "WPIX live coverage of the 1987 Stock Market Crash panic in New York.",
    vibes: ["chaotic-energy", "existential-dread"],
    era: "ancient-web",
    source: { title: "WPIX News", year: 1987 },
  },
  {
    url: "https://www.youtube.com/watch?v=76DbHi8e9Ws",
    id: "cbs-black-monday-special",
    start: 0, end: 60,
    quote: "This is a CBS News Special Report.",
    description: "CBS News Special Report on the 1987 Black Monday crash.",
    vibes: ["existential-dread", "chaotic-energy"],
    era: "ancient-web",
    source: { title: "CBS News", year: 1987 },
  },
  {
    url: "https://www.youtube.com/watch?v=YUKNvoAAa8s",
    id: "loma-prieta-earthquake-world-series",
    start: 0, end: 60,
    quote: "I'll tell you what — we're having an earth—",
    description: "Al Michaels broadcasting live as the 1989 Loma Prieta earthquake interrupts the World Series.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "ABC World Series Broadcast", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=umIzQ-C-fTc",
    id: "loma-prieta-abc-coverage",
    start: 0, end: 60,
    quote: "Continuous crisis coverage from the Bay Area.",
    description: "ABC News continuous crisis coverage of the Loma Prieta earthquake.",
    vibes: ["chaotic-energy", "existential-dread"],
    era: "ancient-web",
    source: { title: "ABC News", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=Gfj8awqnpSA",
    id: "berlin-wall-falls-abc",
    start: 0, end: 60,
    quote: "The Wall is coming down.",
    description: "Live ABC network coverage as the Berlin Wall falls in 1989.",
    vibes: ["chaotic-energy", "pure-nostalgia"],
    era: "ancient-web",
    source: { title: "ABC News", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=qq8zFLIftGk",
    id: "tiananmen-tank-man-raw",
    start: 0, end: 60,
    quote: "One man stood against a column of tanks.",
    description: "Raw footage compilation of the Tiananmen Square Tank Man standoff.",
    vibes: ["existential-dread", "iconic-cinema", "dangerous"],
    era: "ancient-web",
    source: { title: "Tiananmen Square Footage", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=G7REeVXC_iM",
    id: "tiananmen-cbs-evening-news",
    start: 0, end: 60,
    quote: "CBS Evening News reports from Beijing.",
    description: "CBS Evening News report on the Tiananmen Square protests.",
    vibes: ["existential-dread", "dangerous"],
    era: "ancient-web",
    source: { title: "CBS Evening News", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=HFp_0Xp_tgE",
    id: "rob-lowe-snow-white-oscars",
    start: 0, end: 60,
    quote: "The worst Oscars opening in Academy history.",
    description: "Rob Lowe and Snow White at the disastrous 1989 Academy Awards.",
    vibes: ["awkward-gold", "cursed-content"],
    era: "ancient-web",
    source: { title: "61st Academy Awards", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=4YtvuiJfVCE",
    id: "andrew-dice-clay-mtv-vmas-1989",
    start: 0, end: 60,
    quote: "MTV banned him after this performance.",
    description: "Andrew Dice Clay's controversial, banned performance at the 1989 MTV VMAs.",
    vibes: ["unhinged", "dangerous", "dark-humor"],
    era: "ancient-web",
    source: { title: "MTV Video Music Awards", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=rQPfSw_hBhw",
    id: "madonna-like-a-prayer-pepsi",
    start: 0, end: 60,
    quote: "Pepsi pulled the ad. Madonna kept the money.",
    description: "News report on the Madonna 'Like a Prayer' Pepsi controversy.",
    vibes: ["dark-humor", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "Madonna / Pepsi Controversy", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=omH7az8dyG8",
    id: "public-enemy-fight-the-power",
    start: 0, end: 60,
    quote: "Fight the power!",
    description: "Public Enemy performing 'Fight the Power' amidst late 80s social tension.",
    vibes: ["chaotic-energy", "iconic-cinema", "musical-mayhem"],
    era: "ancient-web",
    source: { title: "Public Enemy – Fight the Power", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=gxpAdDrlFk4",
    id: "acid-house-rave-1988",
    start: 0, end: 60,
    quote: "Illegal warehouse raves defined the second summer of love.",
    description: "Raw footage of an illegal 1988 London Acid House warehouse rave.",
    vibes: ["chaotic-energy", "sensory-overload", "fever-dream"],
    era: "ancient-web",
    source: { title: "1988 Acid House Rave", year: 1988 },
  },
  {
    url: "https://www.youtube.com/watch?v=Y7M-xAG03l8",
    id: "nbc-wall-street-greed-80s",
    start: 0, end: 60,
    quote: "Greed is good — or so they said.",
    description: "NBC Flashback on 'Wall Street Greed' highlighting 1980s financial culture.",
    vibes: ["dark-humor", "existential-dread"],
    era: "ancient-web",
    source: { title: "NBC News Flashback", year: 1989 },
  },
  {
    url: "https://www.youtube.com/watch?v=sDeOdvbukIk",
    id: "watchmojo-craziest-80s-tv",
    start: 0, end: 60,
    quote: "The craziest moments that aired on live television.",
    description: "WatchMojo countdown of the craziest live television moments of the 1980s.",
    vibes: ["chaotic-energy", "unhinged", "legendary-fails"],
    era: "ancient-web",
    source: { title: "WatchMojo", year: 2015 },
  },

  // Early 1990s: The Reality Rupture
  {
    url: "https://www.youtube.com/watch?v=o5KIiDcs8no",
    id: "la-riots-1992-raw-footage",
    start: 0, end: 60,
    quote: "Raw footage from the streets of Los Angeles, 1992.",
    description: "Raw NBCLA news footage from the 1992 LA Riots.",
    vibes: ["chaotic-energy", "dangerous", "existential-dread"],
    era: "ancient-web",
    source: { title: "NBCLA News", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=enrAWRoXQVA",
    id: "la-riots-florence-normandie",
    start: 0, end: 60,
    quote: "Florence and Normandie became ground zero.",
    description: "Retrospective on the violent flashpoint at Florence and Normandie during the LA Riots.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "LA Riots Retrospective", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=wMPYMgEG-DA",
    id: "la-riots-helicopter-reporter",
    start: 0, end: 60,
    quote: "From above, you could see the city burning.",
    description: "Helicopter reporter recalls the aerial chaos of the LA Riots.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "LA Riots Aerial Coverage", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=u921Q1lMnWc",
    id: "la-riots-nbc-looting",
    start: 0, end: 60,
    quote: "NBC News captured the looting as it happened.",
    description: "NBC News coverage detailing street-level looting during the LA Riots.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "NBC News", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=BskrpzvVE3Q",
    id: "cnn-gulf-war-baghdad-1991",
    start: 0, end: 60,
    quote: "The skies over Baghdad have been illuminated.",
    description: "CNN's historic live broadcast of the 1991 Gulf War Baghdad bombing.",
    vibes: ["chaotic-energy", "dangerous", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "CNN Gulf War Coverage", year: 1991 },
  },
  {
    url: "https://www.youtube.com/watch?v=q3SpA1WJRnU",
    id: "cnn-desert-storm-live",
    start: 0, end: 60,
    quote: "This is CNN, live from Baghdad.",
    description: "Continued live reporting from CNN during Operation Desert Storm.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "CNN Desert Storm Coverage", year: 1991 },
  },
  {
    url: "https://www.youtube.com/watch?v=eYwM7BeOF84",
    id: "waco-siege-48-hours-1993",
    start: 0, end: 60,
    quote: "Video diaries from inside the siege.",
    description: "'48 Hours' investigation featuring raw video diaries from the 1993 Waco Siege.",
    vibes: ["existential-dread", "dangerous", "disturbing"],
    era: "ancient-web",
    source: { title: "48 Hours – Waco Siege", year: 1993 },
  },
  {
    url: "https://www.youtube.com/watch?v=Liyvr0rlNVw",
    id: "waco-compound-destruction",
    start: 0, end: 60,
    quote: "The compound burned to the ground on live television.",
    description: "Aerial footage capturing the destruction of the Waco compound.",
    vibes: ["dangerous", "existential-dread", "disturbing"],
    era: "ancient-web",
    source: { title: "Waco Siege Footage", year: 1993 },
  },
  {
    url: "https://www.youtube.com/watch?v=FSXIYN1DBHc",
    id: "oj-bronco-chase-cbs",
    start: 0, end: 60,
    quote: "95 million Americans watched the chase unfold.",
    description: "CBS live network coverage of the infamous O.J. Simpson Bronco chase.",
    vibes: ["chaotic-energy", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "CBS News – O.J. Simpson Chase", year: 1994 },
  },
  {
    url: "https://www.youtube.com/watch?v=eYjXuYF_8uI",
    id: "oj-bronco-chase-abc",
    start: 0, end: 60,
    quote: "A low-speed pursuit captivated the entire nation.",
    description: "ABC Eyewitness News reporting on the unfolding Bronco pursuit.",
    vibes: ["chaotic-energy", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "ABC Eyewitness News – O.J. Chase", year: 1994 },
  },
  {
    url: "https://www.youtube.com/watch?v=_KikC0AMPus",
    id: "gnr-riverport-riot-1991",
    start: 0, end: 60,
    quote: "Axl Rose dove into the crowd and everything went sideways.",
    description: "Documentary breakdown of the 1991 Guns N' Roses St. Louis 'Riverport Riot'.",
    vibes: ["chaotic-energy", "dangerous", "musical-mayhem"],
    era: "ancient-web",
    source: { title: "GNR Riverport Riot Documentary", year: 1991 },
  },
  {
    url: "https://www.youtube.com/watch?v=-waeFX0sCl0",
    id: "gnr-riverport-riot-news",
    start: 0, end: 60,
    quote: "Fans destroyed the amphitheater after the band walked off.",
    description: "Local news coverage of the amphitheater destruction caused by the 1991 GNR riot.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "Local News – Riverport Riot", year: 1991 },
  },
  {
    url: "https://www.youtube.com/watch?v=UI8RW2Hm14g",
    id: "metallica-gnr-montreal-riot-1992",
    start: 0, end: 60,
    quote: "Two bands, one stadium, total chaos.",
    description: "Report on the 1992 Metallica and Guns N' Roses Montreal stadium riot.",
    vibes: ["chaotic-energy", "dangerous", "musical-mayhem"],
    era: "ancient-web",
    source: { title: "Montreal Stadium Riot Report", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=Bjnb3oaCGvM",
    id: "metallica-gnr-montreal-canadian-tv",
    start: 0, end: 60,
    quote: "Canadian authorities scrambled to contain the destruction.",
    description: "Canadian TV news coverage following the Montreal concert incident.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "Canadian TV News", year: 1992 },
  },
  {
    url: "https://www.youtube.com/shorts/rILF_Rk7-7o",
    id: "cobain-wheelchair-reading-1992",
    start: 0, end: 60,
    quote: "Kurt mocked the press by arriving in a wheelchair.",
    description: "Kurt Cobain mocks the press via a wheelchair entrance at the 1992 Reading Festival.",
    vibes: ["dark-humor", "iconic-cinema", "unhinged"],
    era: "ancient-web",
    source: { title: "Reading Festival", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=TGNz0IW8vQw",
    id: "klf-brit-awards-machine-gun-1992",
    start: 0, end: 60,
    quote: "The KLF fired blanks into the BRIT Awards audience.",
    description: "The KLF fire blank machine gun rounds into the 1992 BRIT Awards audience.",
    vibes: ["chaotic-energy", "unhinged", "dangerous"],
    era: "ancient-web",
    source: { title: "1992 BRIT Awards", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=2dKdBlKgquw",
    id: "sinead-oconnor-snl-pope-1992",
    start: 0, end: 60,
    quote: "Fight the real enemy.",
    description: "Sinead O'Connor tears up a photo of the Pope on live SNL broadcast.",
    vibes: ["chaotic-energy", "iconic-cinema", "dangerous"],
    era: "ancient-web",
    source: { title: "Saturday Night Live", year: 1992 },
  },
  {
    url: "https://www.youtube.com/shorts/3Y5GT0yKngU",
    id: "sinead-oconnor-snl-fallout",
    start: 0, end: 60,
    quote: "The backlash was immediate and devastating.",
    description: "Analysis of the SNL backlash and fallout from Sinead O'Connor's protest.",
    vibes: ["existential-dread", "dark-humor"],
    era: "ancient-web",
    source: { title: "SNL Fallout Analysis", year: 1992 },
  },
  {
    url: "https://www.youtube.com/watch?v=K0F32qPk8pM",
    id: "beavis-butthead-moral-panic-1993",
    start: 0, end: 60,
    quote: "MTV was forced to address the moral panic.",
    description: "MTV News segment addressing the moral panic surrounding Beavis and Butt-Head.",
    vibes: ["dark-humor", "absurdist", "cursed-content"],
    era: "ancient-web",
    source: { title: "MTV News", year: 1993 },
  },
  {
    url: "https://www.youtube.com/watch?v=Bip1G9kBXS0",
    id: "nancy-kerrigan-attack-1994",
    start: 0, end: 60,
    quote: "Why? Why? Why?",
    description: "News coverage of the 1994 attack on figure skater Nancy Kerrigan.",
    vibes: ["chaotic-energy", "dangerous", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "Nancy Kerrigan Attack Coverage", year: 1994 },
  },

  // Late 1990s: Millennium Tension and Manufactured Spectacle
  {
    url: "https://www.youtube.com/watch?v=EYrdN-cUbJg",
    id: "clinton-grand-jury-testimony-1998",
    start: 0, end: 60,
    quote: "It depends on what the meaning of the word 'is' is.",
    description: "Bill Clinton's historic 1998 Grand Jury testimony broadcast.",
    vibes: ["awkward-gold", "iconic-cinema", "dark-humor"],
    era: "ancient-web",
    source: { title: "Clinton Grand Jury Testimony", year: 1998 },
  },
  {
    url: "https://www.youtube.com/watch?v=1H1ToOAAsNg",
    id: "princess-diana-funeral-grief",
    start: 0, end: 60,
    quote: "A nation mourned in real time on television.",
    description: "News coverage of the unprecedented public grief at Princess Diana's funeral.",
    vibes: ["existential-dread", "iconic-cinema", "pure-nostalgia"],
    era: "ancient-web",
    source: { title: "Princess Diana Funeral Coverage", year: 1997 },
  },
  {
    url: "https://www.youtube.com/watch?v=Ejapf4bkqd0",
    id: "princess-diana-funeral-procession",
    start: 0, end: 60,
    quote: "2.5 billion people watched the funeral live.",
    description: "Full funeral procession and live coverage of Princess Diana's funeral.",
    vibes: ["existential-dread", "iconic-cinema"],
    era: "ancient-web",
    source: { title: "Princess Diana Funeral", year: 1997 },
  },
  {
    url: "https://www.youtube.com/watch?v=PgB8_MpeDEs",
    id: "seattle-wto-protests-1999",
    start: 0, end: 60,
    quote: "The Battle of Seattle shut down the WTO.",
    description: "Documentary footage of the chaotic 1999 anti-globalization Seattle WTO Protests.",
    vibes: ["chaotic-energy", "dangerous"],
    era: "ancient-web",
    source: { title: "WTO Protests Documentary", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=Msk0PbhwcuA",
    id: "seattle-wto-battle-wsj",
    start: 0, end: 60,
    quote: "Tear gas and rubber bullets in downtown Seattle.",
    description: "WSJ retrospective on the militarized response to the 'Battle of Seattle'.",
    vibes: ["chaotic-energy", "dangerous", "existential-dread"],
    era: "ancient-web",
    source: { title: "WSJ Retrospective", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=EqMKcNldhfs",
    id: "y2k-panic-compilation",
    start: 0, end: 60,
    quote: "Will your toaster survive midnight?",
    description: "News compilation documenting the nationwide Y2K computer bug panic.",
    vibes: ["absurdist", "existential-dread", "pure-nostalgia"],
    era: "ancient-web",
    source: { title: "Y2K News Compilation", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=C8LAl_6Ac5I",
    id: "y2k-local-news-wnyt",
    start: 0, end: 60,
    quote: "Families stockpiled water and canned goods.",
    description: "WNYT local news report covering Y2K hysteria and preparations.",
    vibes: ["absurdist", "pure-nostalgia", "dark-humor"],
    era: "ancient-web",
    source: { title: "WNYT News", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=DSnjREqyPbM",
    id: "woodstock-99-fires-cbs",
    start: 0, end: 60,
    quote: "Woodstock '99 ended in flames.",
    description: "CBS 6 News vault footage of the Woodstock '99 fires and riots.",
    vibes: ["chaotic-energy", "dangerous", "disturbing"],
    era: "ancient-web",
    source: { title: "CBS 6 News", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=aUbKYin_SUs",
    id: "woodstock-99-aftermath-abc",
    start: 0, end: 60,
    quote: "The peace and love festival descended into total chaos.",
    description: "ABC News detailing the catastrophic aftermath of the Woodstock '99 festival.",
    vibes: ["chaotic-energy", "dangerous", "disturbing"],
    era: "ancient-web",
    source: { title: "ABC News", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=t-qKt2xNPYc",
    id: "limp-bizkit-woodstock-99",
    start: 0, end: 60,
    quote: "Break stuff became a self-fulfilling prophecy.",
    description: "Limp Bizkit performs 'Stuck' amidst crowd chaos at Woodstock '99.",
    vibes: ["chaotic-energy", "dangerous", "musical-mayhem", "sensory-overload"],
    era: "ancient-web",
    source: { title: "Woodstock '99 – Limp Bizkit", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=1IpJWJvbVQU",
    id: "korn-woodstock-99",
    start: 0, end: 60,
    quote: "Korn's set was legendary — and dangerous.",
    description: "Korn performs a legendary set to a surging crowd at Woodstock '99.",
    vibes: ["chaotic-energy", "musical-mayhem", "sensory-overload"],
    era: "ancient-web",
    source: { title: "Woodstock '99 – Korn", year: 1999 },
  },
  {
    url: "https://www.youtube.com/watch?v=KLhkoRSlTk8",
    id: "stone-cold-beer-truck-1999",
    start: 0, end: 60,
    quote: "Austin 3:16 says I just sprayed your ass.",
    description: "Stone Cold Steve Austin drives a beer truck into WWE RAW.",
    vibes: ["chaotic-energy", "unhinged", "legendary-fails", "funny-revenge"],
    era: "ancient-web",
    source: { title: "WWE Monday Night RAW", year: 1999 },
  },
];

// ── Extract video ID from URL ───────────────────────────────────────────────
function extractVideoId(url) {
  // Standard watch URLs
  let match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  // Shorts URLs
  match = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  // youtu.be short URLs
  match = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  return null;
}

// ── Verify via oEmbed ───────────────────────────────────────────────────────
async function verifyClip(clip) {
  const videoId = extractVideoId(clip.url);
  if (!videoId) return { clip, ok: false, reason: "Could not extract video ID" };

  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "ChannelZero-Verifier/1.0" },
    });
    if (!res.ok) return { clip, videoId, ok: false, reason: `HTTP ${res.status}` };
    const data = await res.json();
    return { clip, videoId, ok: true, title: data.title, author: data.author_name };
  } catch (err) {
    return { clip, videoId, ok: false, reason: err.message };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔫 Broadcast Chaos Batch — verifying ${clips.length} clips...\n`);

  // Verify in batches of 10
  const results = [];
  const BATCH = 10;
  for (let i = 0; i < clips.length; i += BATCH) {
    const batch = clips.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(verifyClip));
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

  verified.forEach((r) => {
    console.log(`  ✅ ${r.clip.id} — "${r.title}" by ${r.author}`);
  });
  if (failed.length > 0) {
    console.log("\nFailed:");
    failed.forEach((r) => {
      console.log(`  ❌ ${r.clip.id} — ${r.reason}`);
    });
  }

  if (DRY_RUN) {
    console.log("\n🏜️  Dry run — no files modified.");
    return;
  }

  if (verified.length === 0) {
    console.log("\n⚠️  No verified clips to add.");
    return;
  }

  // Read existing scenes.js and check for duplicates
  const scenesPath = "src/data/scenes.js";
  let scenes = readFileSync(scenesPath, "utf-8");

  const existingIds = new Set();
  for (const m of scenes.matchAll(/id:\s*"([^"]+)"/g)) {
    existingIds.add(m[1]);
  }

  const newClips = verified.filter((r) => {
    if (existingIds.has(r.clip.id)) {
      console.log(`  ⏭️  Skipping duplicate: ${r.clip.id}`);
      return false;
    }
    return true;
  });

  if (newClips.length === 0) {
    console.log("\n⚠️  All clips already exist in scenes.js.");
    return;
  }

  // Build entries
  const entries = newClips.map((r) => {
    const c = r.clip;
    const lines = [];
    lines.push(`  {`);
    lines.push(`    id: "${c.id}",`);
    lines.push(`    videoId: "${r.videoId}",`);
    lines.push(`    start: ${c.start},`);
    lines.push(`    end: ${c.end},`);
    lines.push(`    quote: ${JSON.stringify(c.quote)},`);
    lines.push(`    description: ${JSON.stringify(c.description)},`);
    lines.push(`    vibes: ${JSON.stringify(c.vibes)},`);
    lines.push(`    era: "${c.era}",`);
    lines.push(`    source: { title: ${JSON.stringify(c.source.title)}, year: ${c.source.year} },`);
    lines.push(`  },`);
    return lines.join("\n");
  });

  // Insert before closing ];
  const closingBracket = scenes.lastIndexOf("];");
  if (closingBracket === -1) {
    console.error("Could not find closing ]; in scenes.js");
    process.exit(1);
  }

  const before = scenes.substring(0, closingBracket);
  const after = scenes.substring(closingBracket);

  const newContent =
    before +
    `\n  // ═══════════════════════════════════════════════════════════════\n` +
    `  // 📺 BROADCAST CHAOS — Late 80s Through Late 90s (verified ${new Date().toISOString().split("T")[0]})\n` +
    `  // ═══════════════════════════════════════════════════════════════\n\n` +
    entries.join("\n") +
    "\n" +
    after;

  writeFileSync(scenesPath, newContent);
  console.log(`\n🎬 Added ${newClips.length} broadcast chaos clips to scenes.js`);
}

main().catch(console.error);
