# Film-signature audio

Each scene now has its own 30-second bed composed against that scene's visual
timeline, plus scene-specific transient cues. Nothing is sampled from any film:
every sound is synthesized by `tools/author-audio.py` with SoX and FFmpeg, and the
two musical references are public-domain compositions rendered from scratch. The
audio behavior (consent before download, beds resuming at the timeline position,
cues that fire only when playback crosses them, no replay while scrubbing) is
unchanged from the earlier pass.

## Per-scene design

| Scene | Bed (time-locked) | Cues (fired on crossing) |
|---|---|---|
| Independence Day | Sub-bass mothership hum with metallic craft resonance, sonar-like signal pings and radio static while the signal is detected; the weapon charge builds under the ship 9–13 s; blast tail, rolling firestorm and debris rattle through the collapse | charge 9 s, blast 13 s, collapse 16 s |
| Deep Impact | Ocean and storm gusts under a mournful string pad that lifts from D minor to B-flat major; a descending comet whistle and rip of air 4–13 s; the wall of water rises 14–28 s with sea spray | entry 10 s, impact 13 s, surge 25 s |
| The Day After Tomorrow | Howling wind and a lower moan; the superstorm arrives 8–20 s with hail hiss and thunder rolls; from 20 s the deep freeze brings groaning ice and a crystalline shimmer | pressure drop 9 s, thunder 12 s and 16.5 s, freeze 20 s |
| Melancholia | Deep space and the rogue planet's rising pressure under an original synthesized rendering of the opening of Wagner's Tristan Prelude (cello line, the Tristan chord, the rising wind figure, resolution); atmospheres touch from 22 s; white-out at 27 s | contact 22 s, collision 27 s |
| Terminator 2 | The last quiet morning with soft wind, a city hum and wind chimes; the thermal flash rings at 4 s and the fireball roars up; the shock front's hurricane, debris and glass 13–23 s; fallout wind with a sparse industrial metallic figure | flash 4 s, shockwave 13 s, collapse 15.5 s |
| 2012 | Earth groans and rising pressure; the fault opens at 3 s and the ground never settles, with rock cracking, two distant sirens and three building collapses; dust after 24 s | rupture 3 s, collapse 10 s, 14.5 s and 21 s |
| War of the Worlds | Ominous drone, ground tremor and electrical charge with three thunder rolls as the lightning strikes; emergence at 6 s; the machines walk from 9 s with servo whines on each step and a mechanical pulse | lightning 1.5 s, 3.5 s, 5.5 s; horn blasts 8 s, 16 s, 26 s; heat rays 20.5 s and 23.5 s |
| Knowing | The solar roar and plasma hiss under a low-string figure on the dactylic rhythm of Beethoven's Seventh (second movement) with an original melodic line and an A-minor pad; eruption tail at 5 s; the ejection rushes 8–27 s; engulfment crescendo from 20 s | eruption 5 s, engulf 23 s |
| Armageddon | Cosmic drones and asteroid rumble with a mission clock and comms static; drilling and grinding 6–15 s; detonation tail, fracturing and the shock 16–21 s; fragment field rumble | countdown beeps 13 s, detonation 16 s, flybys 21 s, 24 s, 27 s |
| Interstellar | An original sustained organ cluster (A minor add 9) swelling over a sub pedal, with a clock ticking every 1.25 s that accelerates as the orbit tightens from 17 s; upper voices and a suspension resolve 17–30 s; at the event horizon everything sinks to a pedal tone | orbit 17 s, horizon 26 s |

Timings follow the render modules' own easing windows (for example the Terminator 2
ignition at 4 s, the 2012 rupture at 3 s, the Armageddon split at 16 s, the
Interstellar orbit tightening at 17 s and horizon at 26 s).

## Why nothing is sampled

The site is public and the repository rule is that no film soundtrack or film
recording is included. Film scores and sound design are copyrighted, so
"reflecting the movie" is done by evoking each film's sonic identity with original
synthesis. Wagner's Tristan und Isolde (1859) and Beethoven's Seventh Symphony
(1812) are public-domain compositions; the Melancholia bed renders the Tristan
opening from note names, and the Knowing bed borrows only the Allegretto's
rhythm with a different melodic line. No recording of either work was used.
MusicGen output was not used because the local model is licensed for
noncommercial prototyping only.

## Budget

| Set | Files | Size |
|---|---:|---:|
| Beds | 10 | 4.7 MB |
| Cues | 26 | 1.5 MB |
| Intro | 1 | 48 KB |

Audio still downloads only after sound consent, and only the selected scene's bed
and cues are fetched. The previous eleven files totaled 3.6 MB.

## Verification (2026-09-13)

Technical checks, run on this Mac with Node 24, the Homebrew SoX build, FFmpeg 9.0.1 and installed Chrome:

| Check | Result |
|---|---|
| Decode and duration | All 37 MP3s decode; beds are exactly 30.00 s, cues 2.0 to 5.0 s |
| Encoded peaks | Beds -12.4 to -13.8 dBFS; cues -8.5 to -13.2 dBFS |
| Band balance | Interstellar organ (150–1200 Hz) within 2 dB of its sub pedal, ticks 20 dB under; Melancholia strings level with the sub; Knowing ostinato 4 dB above the roar |
| Spectrogram review | Six beds inspected: ticks accelerate from 17 s in Interstellar, the Tristan phrase spans 2–18 s, tripod steps land every 2.4 s from 9.2 s, Terminator 2 shows the quiet morning, 4 s flash, fireball, 13 s shock front and 23–30 s metallic figure |
| JavaScript unit/build tests | 94 passed, including the new bed-ownership and on-disk existence test |
| Committed asset checksums | 52 passed |
| Chromium browser suite | 11 passed, including consent-gated audio, playback, scrubbing, volume and scene changes |
| WebKit browser suite | 3 passed, including audio consent, pause/resume and scene changes |

AI observation, separate from the technical checks: CLAP text-to-audio ranking over
all 37 files (10-second windows) placed the intended file first for 5 of 19 short
captions ("countdown beeps", "blizzard wind", "drilling machine", "sun roaring",
"whoosh flyby") and in the top three for 11 of 19 ("church organ", "ticking
clock" and "orchestral strings" ranked second; "ocean waves", "giant footsteps"
and "spaceship hum" third). Broadband beds (rumble, roar, wind) are confused with
each other, and short cues are outranked by beds that contain similar events, so
the ranking is a sanity check, not a measure of quality. Nobody has listened to
these files in this pass; listening review is the remaining step.

Driving the built site in the desktop app's Browser pane with sound enabled
confirmed the consent gate, the per-scene downloads (bed plus that scene's cues
only), the playing state and the intro cue. That pane delivered one animation
frame per second during the check, so the simulation clock crawled and cue
timing could not be judged there; the Chromium suite's soundtrack test covers
cue crossings at full speed.

## Rebuilding

```sh
python3 tools/author-audio.py
npm run assets:verify   # fails until tools/asset-baseline.json is updated intentionally
```

Regenerated bytes can differ between SoX and FFmpeg versions; review before
updating the checksum manifest.
