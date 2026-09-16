# A1 tone mapping and film

BALANCED, HIGH and ULTRA render through AgX with a per-scene grade. LITE keeps native antialiasing, ACES and exposure 1.3. Cinema owns exposure on scene updates and quality transitions; `applyEnvironment` no longer resets it.

The current chain is RenderPass → UnrealBloomPass → OutputPass → FXAA → Film. FXAA is unmodified. The separate film ShaderPass operates on display-referred colour, samples opposite radial red/blue offsets, applies saturation and tint, retains the original vignette, adds zero-centred grain and clamps RGB to [0,1]. Alpha is preserved. Grain hashes the physical pixel position and `floor(sceneTime * 24)`; no accumulated frame counters or wall clocks are used.

All fifteen scene configurations carry exposure, bloom strength/radius/threshold, tint, saturation, grain and aberration. Initial exposure is 1.6; bloom ratios, tint and saturation are translated from the preceding scene ladders. Grain is .012 and aberration .0012. Partial factory configs fall back to their catalogue grade, then the default grade. Knowing's photosphere radiance is multiplied by 1.35 on composer tiers and remains 1 on LITE.

Unit contracts cover complete finite grades, tint shape, subtle film bounds, reverse seeks across scene changes and 24 fps grain boundaries. Existing browser screenshot byte-equality assertions remain the GPU determinism check. Visual acceptance requires before/after fifteen-scene contact sheets and the exposure → bloom → tint walk; unit tests alone do not establish visual parity.
