import { useState, useEffect, useRef } from "react";
import { getFilterByKey } from "../data/filters.js";
import { createPlayer, getSceneType } from "../players/createPlayer.js";

export function ScenePlayer({
  scene, nextScene, isFavorite, onToggleFavorite, hasInteracted,
  onBlast, onEnterDiscovery, onAdvanceDiscovery, onExitDiscovery,
  discoveryMode, isScanning, isBuffering, isDriedUp, discoveryError,
  rateMeta, onPromote, promoteEnabled,
  hasKey, keyStatus, onSubmitKey, onClearKey,
  aiEnabled = true,
}) {
  const [transitioning, setTransitioning] = useState(false);
  const [displayScene, setDisplayScene] = useState(scene);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInputValue, setKeyInputValue] = useState("");
  const [showKeyPopover, setShowKeyPopover] = useState(false);
  const keyInputRef = useRef(null);
  const prevIdRef = useRef(null);

  // Player pool: { type: { player, slot } }
  const poolRef = useRef({});
  const activeTypeRef = useRef(null);
  const containerRef = useRef(null);

  // Pre-warm pool: { type: { player, slot } }
  const preWarmPoolRef = useRef({});
  const preWarmContainerRef = useRef(null);
  const preWarmSceneIdRef = useRef(null);

  // Keep latest values in refs to avoid stale closures in YT callbacks
  const hasInteractedRef = useRef(hasInteracted);
  hasInteractedRef.current = hasInteracted;
  const onBlastRef = useRef(onBlast);
  onBlastRef.current = onBlast;
  const onAdvanceDiscoveryRef = useRef(onAdvanceDiscovery);
  onAdvanceDiscoveryRef.current = onAdvanceDiscovery;
  const discoveryModeRef = useRef(discoveryMode);
  discoveryModeRef.current = discoveryMode;
  // Track the scene actually loaded in the player (not the display scene)
  const playingSceneRef = useRef(scene);
  const channelNumRef = useRef(null);

  // ─── Pool helpers ───
  function getOrCreateSlot(container, type) {
    let slot = container?.querySelector(`[data-type="${type}"]`);
    if (!slot) {
      slot = document.createElement("div");
      slot.dataset.type = type;
      slot.style.cssText = "width:100%;height:100%;";
      container?.appendChild(slot);
    }
    return slot;
  }

  function hideAllSlots(container) {
    if (!container) return;
    for (const slot of container.children) {
      slot.style.display = "none";
    }
  }

  function showSlot(slot) {
    if (slot) slot.style.display = "block";
  }

  function getActivePlayer() {
    const type = activeTypeRef.current;
    return type ? poolRef.current[type]?.player : null;
  }

  // ─── AI Key Input Handlers ───
  function handleDiscoveryClick() {
    onEnterDiscovery?.();
  }

  function handleKeySubmit(key) {
    if (!key.trim()) return;
    onSubmitKey?.(key.trim());
  }

  function handleKeyPaste(e) {
    const text = e.clipboardData.getData("text").trim();
    if (text) {
      e.preventDefault();
      setKeyInputValue(text);
      handleKeySubmit(text);
    }
  }

  function handleKeyInputKeyDown(e) {
    if (e.key === "Enter") handleKeySubmit(keyInputValue);
    if (e.key === "Escape") setShowKeyInput(false);
  }

  // Auto-focus key input when shown
  useEffect(() => {
    if (showKeyInput) keyInputRef.current?.focus();
  }, [showKeyInput]);

  // Auto-trigger AI after successful key connection
  const prevKeyStatus = useRef(keyStatus);
  useEffect(() => {
    if (prevKeyStatus.current === "validating" && keyStatus === "connected") {
      setShowKeyInput(false);
      setKeyInputValue("");
      onEnterDiscovery?.();
    }
    prevKeyStatus.current = keyStatus;
  }, [keyStatus, onEnterDiscovery]);

  // Close key popover on outside click or Escape
  useEffect(() => {
    if (!showKeyPopover) return;
    function handleClick() { setShowKeyPopover(false); }
    function handleKeyDown(e) { if (e.key === "Escape") setShowKeyPopover(false); }
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showKeyPopover]);

  // Show key input when INVALID_KEY error occurs
  useEffect(() => {
    if (discoveryError === "INVALID_KEY") {
      const timer = setTimeout(() => {
        setShowKeyInput(true);
      }, 3100); // slightly after the 3s auto-clear
      return () => clearTimeout(timer);
    }
  }, [discoveryError]);

  // ─── Create main player on mount ───
  useEffect(() => {
    if (!scene) return;
    const type = getSceneType(scene);

    // Already have a player for this type
    if (poolRef.current[type]?.player) return;

    const container = containerRef.current;
    if (!container) return;

    const slot = getOrCreateSlot(container, type);
    showSlot(slot);

    const player = createPlayer(type);
    poolRef.current[type] = { player, slot };
    activeTypeRef.current = type;
    playingSceneRef.current = scene;

    player.create(slot, scene, {
      muted: !hasInteractedRef.current,
      onReady() {
        if (!hasInteractedRef.current) {
          player.mute();
        } else {
          player.unmute();
        }
        player.play();
      },
      onError() {
        onBlastRef.current?.();
      },
      onEnded() {
        if (discoveryModeRef.current) {
          onAdvanceDiscoveryRef.current?.();
        } else {
          onBlastRef.current?.();
        }
      },
    });

    return () => {};
  }, [!!scene]);

  // ─── Scene change: transition + pool management ───
  useEffect(() => {
    if (!scene) return;

    if (prevIdRef.current && prevIdRef.current !== scene.id) {
      channelNumRef.current = Math.floor(Math.random() * 60) + 2;
      setTransitioning(true);

      const newType = getSceneType(scene);
      const oldType = activeTypeRef.current;
      playingSceneRef.current = scene;

      const container = containerRef.current;

      // Stop old player when switching types to prevent audio bleed
      // (hideAllSlots only sets display:none — CSS hiding does NOT stop audio)
      if (newType !== oldType && oldType && poolRef.current[oldType]?.player) {
        try {
          poolRef.current[oldType].player.pause();
          poolRef.current[oldType].player.mute();
        } catch {}
      }

      if (newType === oldType && poolRef.current[newType]?.player?.isReady()) {
        // Same type — reuse player
        poolRef.current[newType].player.load(scene);
        poolRef.current[newType].player.play();
        if (hasInteractedRef.current) {
          poolRef.current[newType].player.unmute();
        } else {
          poolRef.current[newType].player.mute();
        }
      } else if (preWarmPoolRef.current[newType]?.player?.isReady()) {
        // Pre-warm player available — promote to main pool
        const preWarm = preWarmPoolRef.current[newType];
        hideAllSlots(container);
        // Move slot from hidden pre-warm container to main container
        container.appendChild(preWarm.slot);
        showSlot(preWarm.slot);
        // Promote to main pool
        poolRef.current[newType] = preWarm;
        delete preWarmPoolRef.current[newType];
        preWarm.player.load(scene);
        if (hasInteractedRef.current) {
          preWarm.player.unmute();
        } else {
          preWarm.player.mute();
        }
        preWarm.player.play();
        activeTypeRef.current = newType;
      } else if (poolRef.current[newType]?.player) {
        // Different type, but pool has it — show/hide swap
        hideAllSlots(container);
        showSlot(poolRef.current[newType].slot);
        poolRef.current[newType].player.load(scene);
        if (hasInteractedRef.current) {
          poolRef.current[newType].player.unmute();
        } else {
          poolRef.current[newType].player.mute();
        }
        poolRef.current[newType].player.play();
        activeTypeRef.current = newType;
      } else {
        // New type — create player, add to pool
        hideAllSlots(container);
        const slot = getOrCreateSlot(container, newType);
        showSlot(slot);

        const player = createPlayer(newType);
        poolRef.current[newType] = { player, slot };
        activeTypeRef.current = newType;

        player.create(slot, scene, {
          muted: !hasInteractedRef.current,
          onReady() {
            if (hasInteractedRef.current) player.unmute();
            player.play();
          },
          onError() { onBlastRef.current?.(); },
          onEnded() {
            if (discoveryModeRef.current) onAdvanceDiscoveryRef.current?.();
            else onBlastRef.current?.();
          },
        });
      }

      const timer = setTimeout(() => {
        setDisplayScene(scene);
        setTransitioning(false);
      }, 900);
      return () => clearTimeout(timer);
    } else {
      setDisplayScene(scene);
    }
    prevIdRef.current = scene.id;
  }, [scene]);

  // ─── Pre-warm next scene ───
  useEffect(() => {
    if (!nextScene || nextScene.id === preWarmSceneIdRef.current) return;
    if (nextScene.id === playingSceneRef.current?.id) return;

    preWarmSceneIdRef.current = nextScene.id;
    const type = getSceneType(nextScene);

    // Reuse existing pre-warm player of same type
    if (preWarmPoolRef.current[type]?.player?.isReady()) {
      preWarmPoolRef.current[type].player.load(nextScene);
      preWarmPoolRef.current[type].player.mute();
      setTimeout(() => {
        try { preWarmPoolRef.current[type]?.player?.pause(); } catch {}
      }, 3000);
      return;
    }

    // Create new pre-warm player
    const container = preWarmContainerRef.current;
    if (!container) return;
    const slot = getOrCreateSlot(container, type);

    const player = createPlayer(type);
    preWarmPoolRef.current[type] = { player, slot };

    player.create(slot, nextScene, {
      muted: true,
      onReady() {
        player.mute();
        player.play();
        setTimeout(() => {
          try { player.pause(); } catch {}
        }, 3000);
      },
      onError() { /* pre-warm failure is silent */ },
      onEnded() { /* ignore */ },
    });
  }, [nextScene?.id]);

  // ─── Clean up all pooled players on unmount ───
  useEffect(() => {
    return () => {
      for (const entry of Object.values(poolRef.current)) {
        try { entry.player.destroy(); } catch {}
      }
      poolRef.current = {};
      for (const entry of Object.values(preWarmPoolRef.current)) {
        try { entry.player.destroy(); } catch {}
      }
      preWarmPoolRef.current = {};
    };
  }, []);

  // ─── Unmute active player when user first interacts ───
  useEffect(() => {
    if (!hasInteracted) return;
    const player = getActivePlayer();
    if (!player) return;
    try {
      player.unmute();
      player.setVolume(100);
    } catch {}
  }, [hasInteracted]);

  if (!displayScene) return null;

  return (
    <div className="scene-player">
      {/* Hidden pre-warm player — loads next video in background */}
      <div
        ref={preWarmContainerRef}
        style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
      />
      <div className="crt-tv">
        <div className="tv-body">
          <div className="tv-bezel">
            <div className="tv-screen">
              <div ref={containerRef} className="player-container" />
              {transitioning && (
                <div className="tv-transition">
                  <div className="tv-static" />
                  <div className="tv-color-bars">
                    <div style={{ background: "#fff" }} />
                    <div style={{ background: "#ff0" }} />
                    <div style={{ background: "#0ff" }} />
                    <div style={{ background: "#0f0" }} />
                    <div style={{ background: "#f0f" }} />
                    <div style={{ background: "#f00" }} />
                    <div style={{ background: "#00f" }} />
                  </div>
                  <div className="tv-vhold" />
                  <div className="tv-channel-num">
                    CH {channelNumRef.current}
                  </div>
                </div>
              )}

              {/* Discovery scanning overlay */}
              {discoveryMode && isScanning && (
                <div className="ai-static-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-static-text">SCANNING...</div>
                </div>
              )}
              {discoveryMode && isBuffering && (
                <div className="ai-static-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-static-text">TUNING...</div>
                </div>
              )}

              {/* Error overlays */}
              {discoveryMode && isDriedUp && discoveryError === "RATE_LIMITED" && (
                <div className="ai-error-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-error-text">
                    {hasKey ? "RATE LIMITED — TRY LATER" : "SIGNAL EXHAUSTED — ADD API KEY FOR UNLIMITED"}
                  </div>
                </div>
              )}
              {discoveryMode && discoveryError === "SIGNAL_LOST" && (
                <div className="ai-error-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-error-text">SIGNAL LOST — RETRYING...</div>
                </div>
              )}
              {discoveryMode && discoveryError === "INVALID_KEY" && (
                <div className="ai-error-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-error-text">API KEY INVALID — RECONNECT</div>
                </div>
              )}
            </div>
          </div>

          <div className="tv-info-bar">
            <div className="tv-info-text">
              <blockquote className="scene-quote">
                {discoveryMode && <span className="ai-badge">DISCOVERY</span>}
                "{displayScene.quote}"
              </blockquote>
              <p className="scene-description">{displayScene.description}</p>
              <div className="tv-info-meta">
                <div className="scene-tags">
                  {displayScene.vibes.map((v) => {
                    const filter = getFilterByKey(v);
                    return filter ? (
                      <span key={v} className="tag-pill" style={{ color: filter.color, borderColor: filter.color }}>
                        {filter.label}
                      </span>
                    ) : null;
                  })}
                  {(() => {
                    const eraFilter = getFilterByKey(displayScene.era);
                    return eraFilter ? (
                      <span className="tag-pill" style={{ color: eraFilter.color, borderColor: eraFilter.color }}>
                        {eraFilter.label}
                      </span>
                    ) : null;
                  })()}
                </div>
                <span className="source-tag">
                  {displayScene.source.title} ({displayScene.source.year})
                </span>
              </div>
            </div>
            <div className="tv-info-actions">
              {discoveryMode ? (
                <>
                  {isScanning ? (
                    <button className="ai-pick-btn ai-pick-btn-loading" disabled>
                      ⟳ Scanning...
                    </button>
                  ) : isBuffering ? (
                    <button className="ai-pick-btn ai-pick-btn-loading" disabled>
                      ⟳ Tuning...
                    </button>
                  ) : null}
                  <button className="ai-exit-btn" onClick={onExitDiscovery}>
                    ✕ Exit
                  </button>
                </>
              ) : (
                <>
                  <button className="tv-blast-btn" onClick={onBlast}>
                    ⚡ Blast Me
                  </button>
                  {aiEnabled && (
                    <button className="ai-pick-btn" onClick={handleDiscoveryClick}>
                      📡 Discovery
                    </button>
                  )}
                  {aiEnabled && hasKey && !showKeyInput && (
                    <button
                      className="ai-key-btn"
                      onClick={(e) => { e.stopPropagation(); setShowKeyPopover((p) => !p); }}
                      title="Manage API key"
                    >
                      🔑
                    </button>
                  )}
                </>
              )}
              <button
                className={`fav-btn ${isFavorite ? "fav-active" : ""}`}
                onClick={() => onToggleFavorite(displayScene.id)}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                {isFavorite ? "♥" : "♡"}
              </button>
              {discoveryMode && promoteEnabled && (
                <button
                  className="promote-btn"
                  onClick={() => onPromote?.(scene)}
                  title="Submit for promotion"
                >
                  ⬆️
                </button>
              )}
            </div>

            {discoveryMode && rateMeta?.tier === "free" && rateMeta.remaining != null && (
              <div className="rate-limit-badge">
                {rateMeta.remaining} discoveries left today
              </div>
            )}

            {/* Inline API key input */}
            {showKeyInput && !hasKey && (
              <div className="ai-key-input">
                <div className="ai-key-input-row">
                  <input
                    ref={keyInputRef}
                    type="password"
                    className={`ai-key-field ${keyStatus === "invalid" || keyStatus === "error" ? "ai-key-field-error" : ""}`}
                    value={keyInputValue}
                    placeholder="Paste Anthropic API key..."
                    onChange={(e) => setKeyInputValue(e.target.value)}
                    onPaste={handleKeyPaste}
                    onKeyDown={handleKeyInputKeyDown}
                    disabled={keyStatus === "validating"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="ai-key-connect-btn"
                    onClick={() => handleKeySubmit(keyInputValue)}
                    disabled={keyStatus === "validating" || !keyInputValue.trim()}
                  >
                    {keyStatus === "validating" ? "⟳" : "Connect"}
                  </button>
                  <button
                    className="ai-key-dismiss-btn"
                    onClick={() => { setShowKeyInput(false); setKeyInputValue(""); }}
                  >
                    ✕
                  </button>
                </div>
                <div className="ai-key-hint">
                  {keyStatus === "invalid" && <span className="ai-key-error">Invalid key — try again</span>}
                  {keyStatus === "error" && <span className="ai-key-error">Connection error — try again</span>}
                  {keyStatus !== "invalid" && keyStatus !== "error" && (
                    <span>Key stored locally in your browser. Never sent to us.</span>
                  )}
                </div>
              </div>
            )}

            {/* Key management popover */}
            {showKeyPopover && hasKey && (
              <div className="ai-key-popover" onClick={(e) => e.stopPropagation()}>
                <span className="ai-key-popover-key">
                  {"•".repeat(8)}sk-...
                </span>
                <button className="ai-key-popover-disconnect" onClick={() => { onClearKey?.(); setShowKeyPopover(false); }}>
                  Disconnect
                </button>
              </div>
            )}
          </div>

          <div className="tv-controls">
            <span className="tv-brand">Channel Zero</span>
            <div className="tv-knobs">
              <div className="tv-led" />
              <div className="tv-knob" />
              <div className="tv-knob" />
            </div>
          </div>
        </div>
        <div className="tv-stand">
          <div className="tv-leg" />
          <div className="tv-leg" />
        </div>
      </div>
    </div>
  );
}
