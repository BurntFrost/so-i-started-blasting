# Cinematic quality and interaction

Use this direction for every scene brief, implementation, asset and review.
The goal is an appealing, deliberately composed movie moment that is enjoyable
to watch and control. Prioritize visual quality, readable action and polished UI
over physical realism. Use realism where it strengthens the result; treat strict
physical accuracy as a requirement only when the user requests it. Choose a
coherent style appropriate to the film; this does not prescribe a cartoon or
photorealistic finish for every scene.

## Direct the image

- Establish the focal subject, its silhouette and the viewer's emotional response.
  Compose foreground, subject and background with clear separation and useful
  negative space. Review the scene together with its title, status and controls.
- Set a deliberate palette, light direction and contrast hierarchy. Use fill,
  rim light, atmospheric depth or stylized materials to make the subject appealing
  and readable. Literal darkness, scale or exposure must not hide the action.
- Adjust proportions, distances, trajectories and event timing when that improves
  composition or drama. Keep those choices internally consistent and identify
  them as art direction rather than researched film facts or physical simulation.
- Add detail where the viewer will see it. More polygons, textures, particles,
  bloom or simulated turbulence are useful only when they improve the image.
  Preserve the same visual identity and focal subject at lower quality tiers.

## Direct the animation and UI

- Give the moment anticipation, a clear event and a satisfying aftermath. Shape
  acceleration, pauses, overlap and settling to communicate weight and energy.
  Avoid uniform drifting, abrupt unmotivated transitions and long dead intervals.
- Time flashes, shake, glow and debris to support the event. Let the viewer see
  what happened; sustained glare or clutter must not conceal the main action.
  Treat sound as support for the visual rhythm, while keeping silent playback clear.
- Keep the default camera intentional and orbit/reset predictable. Any scripted
  camera motion must respect user control and the player's reduced-motion behavior.
- Keep title/status text legible against changing imagery, phase labels accurate,
  timeline feedback immediate, and play/pause/replay/speed/fullscreen controls
  easy to find and use. Check pointer, keyboard and touch interactions and phone
  framing. Preserve existing accessibility and audio-consent behavior.
- Make changes within the requested scene/UI scope. Improving cinematic quality
  does not automatically authorize redesigning the entire player.

## Carry the direction through the workflow

Use the existing brief fields: put mood and intended experience in `intent`,
composition/material/palette cues in `signature`, pacing in `beats[].action`,
deliberate departures from realism in `assumptions`, and observable visual/UI
requirements in `acceptance`. Keep `look` as its existing two-color structure;
no new schema is needed. Describe what lower tiers preserve in `quality`.

Review the actual browser scene in two complementary ways:

1. View settled frames at anticipation, event and aftermath, on desktop and a
   narrow layout. Judge silhouette, lighting, color, material finish and UI
   hierarchy together. Check intermediate frames as well as the selected hero.
2. Watch a complete 30-second playback at normal speed, then interact with the
   timeline and camera. Judge rhythm, continuity, impact, settling and control
   responsiveness. Record the playback actually observed; still captures and
   automated assertions alone cannot establish animation quality.

Record visual/experience findings separately from technical pass/fail results.
Describe the visible problem, time/viewport and desired improvement. Require
refinement for muddy lighting, weak composition, monotonous motion, distracting
effects or awkward controls even when all tests pass. Do not reject a successful
stylized choice merely because it is physically inaccurate.
