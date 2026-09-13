# Film-signature audio

Approved direction: Steve asked to upgrade each scene's audio so it reflects the film the scene comes from. Assumption stated up front: this means original audio that evokes each film's sonic identity. The repository's own rule (no film soundtrack or film recording) and the public site make sampled score or sound design unshippable, so nothing is sampled. Where a film's signature is a public-domain composition (Wagner's Tristan Prelude in Melancholia; Beethoven's Seventh in Knowing), an original synthesized rendering or a rhythm-inspired figure is used and documented as such.

## Current state

Seven synthesized 30-second beds serve ten scenes (three scenes share one cosmic drone, two share one seismic rumble) and three generic effects (impact, fracture, charge) serve every scene. `dist/audio.js` plays the bed from the timeline offset and fires cues when playback crosses their timestamps.

## Design

1. **One bed per scene**, composed against that scene's visual timeline (the `ease`/`smooth` timings in the render modules), so the evolving arc of each film moment is baked into the time-locked bed: the mothership hum and weapon charge, the comet approach and tsunami rise, the arriving superstorm and deep freeze, the Tristan-style swell and planetary contact, the quiet morning and firestorm, the earth groans and collapsing city, the lightning strikes and advancing tripods, the solar roar and engulfment, the mission clock and drilling, the organ cluster and accelerating tick.
2. **Scene-specific cues** for the discrete transients (blasts, thunder, horn blasts, heat rays, countdown, collision, flybys), keeping the existing crossing semantics: scrubbing never replays a past event, replay can fire it again.
3. **Synthesis stays original and reproducible**: SoX oscillators, noise, filters, bends and reverb plus FFmpeg `aevalsrc` expressions for organ chords, ticks, sirens, beeps and impulse trains, orchestrated by `tools/author-audio.py` with the standard library only. No MusicGen output ships (the local model is licensed for noncommercial prototyping only).
4. **Loudness discipline** unchanged: beds normalized to a -12 dBFS peak, transients to -8 dBFS, MP3 128 kbit/s 44.1 kHz stereo.
5. **Naming**: `bed-<scene-id>.mp3` and `<scene>-<event>.mp3`; the old shared files are removed and the checksum manifest updated.

## Tests

- `tests/audio.test.mjs`: cue names follow the new soundtrack table; a new check confirms every bed and cue referenced by `dist/audio.js` exists on disk and that each scene has its own bed.
- Existing consent, pause, scrub, failure and late-load tests stay green.
- Browser suites keep the consent-before-download and hashed-URL checks.

## Verification

FFmpeg decode and peak measurement for every file, `sox spectrogram` review of the timeline shape for representative beds, CLAP text-to-audio ranking as a qualitative check that each bed matches its descriptor, the release-gate stages, and driving the built app with sound enabled through a scene.
