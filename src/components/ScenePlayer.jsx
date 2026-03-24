import { useState, useEffect, useRef } from "react";
import { getFilterByKey } from "../data/filters.js";

// ─── YouTube IFrame API loader (singleton) ───
let ytApiReady = null;
function loadYTApi() {
  if (ytApiReady) return ytApiReady;
  ytApiReady = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return ytApiReady;
}

export function ScenePlayer({
  scene, nextScene, isFavorite, onToggleFavorite, hasInteracted,
  onBlast, onAiPick, onAiNext, onExitAi,
  aiMode, aiLoading, aiWaiting, aiError,
  hasKey, keyStatus, onSubmitKey, onClearKey,
}) {
  const [transitioning, setTransitioning] = useState(false);
  const [displayScene, setDisplayScene] = useState(scene);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInputValue, setKeyInputValue] = useState("");
  const [showKeyPopover, setShowKeyPopover] = useState(false);
  const keyInputRef = useRef(null);
  const prevIdRef = useRef(null);
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const playerReadyRef = useRef(false);

  // Pre-warm refs
  const preWarmPlayerRef = useRef(null);
  const preWarmContainerRef = useRef(null);
  const preWarmReadyRef = useRef(false);
  const preWarmSceneIdRef = useRef(null);

  // Keep latest values in refs to avoid stale closures in YT callbacks
  const hasInteractedRef = useRef(hasInteracted);
  hasInteractedRef.current = hasInteracted;
  const onBlastRef = useRef(onBlast);
  onBlastRef.current = onBlast;
  const onAiNextRef = useRef(onAiNext);
  onAiNextRef.current = onAiNext;
  const aiModeRef = useRef(aiMode);
  aiModeRef.current = aiMode;
  // Track the scene actually loaded in the player (not the display scene)
  const playingSceneRef = useRef(scene);
  const channelNumRef = useRef(null);

  // ─── Helpers ───
  function applyQuality(player) {
    try {
      const levels = player.getAvailableQualityLevels?.();
      if (levels?.length) player.setPlaybackQuality(levels[0]);
    } catch {}
  }

  function applyVolume(player) {
    if (hasInteractedRef.current) {
      try {
        player.unMute();
        player.setVolume(100);
      } catch {}
    }
  }

  // ─── AI Key Input Handlers ───
  function handleAiPickClick() {
    if (!hasKey) {
      setShowKeyInput((prev) => !prev);
      return;
    }
    onAiPick?.();
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
      onAiPick?.();
    }
    prevKeyStatus.current = keyStatus;
  }, [keyStatus, onAiPick]);

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

  // ─── Create main player once on mount, reuse via loadVideoById ───
  useEffect(() => {
    if (!scene) return;

    // Player already exists — handled by the scene-change effect
    if (playerRef.current) return;

    let cancelled = false;

    loadYTApi().then(() => {
      if (cancelled || playerRef.current) return;

      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = "";
      const div = document.createElement("div");
      container.appendChild(div);

      playingSceneRef.current = scene;

      playerRef.current = new window.YT.Player(div, {
        width: "100%",
        height: "100%",
        videoId: scene.videoId,
        playerVars: {
          start: scene.start,
          end: scene.end,
          autoplay: 1,
          mute: hasInteractedRef.current ? 0 : 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          vq: "hd2160",
          enablejsapi: 1,
        },
        events: {
          onReady(event) {
            if (cancelled) return;
            playerReadyRef.current = true;
            const player = event.target;
            applyQuality(player);
            applyVolume(player);
            player.playVideo();
          },
          onError(event) {
            if (cancelled) return;
            const code = event.data;
            // 100=not found, 101/150=not embeddable → skip to next
            if (code === 100 || code === 101 || code === 150) {
              onBlastRef.current?.();
            }
          },
          onStateChange(event) {
            if (cancelled) return;
            const player = event.target;

            // On play — max quality, max volume, unmute
            if (event.data === 1) {
              applyQuality(player);
              applyVolume(player);
            }

            // State 0 = ended — auto-advance, guard against spurious ends
            if (event.data === 0) {
              const ds = playingSceneRef.current;
              try {
                const currentTime = player.getCurrentTime?.();
                if (!Number.isFinite(currentTime)) return;
                if (ds?.end) {
                  const clipDuration = ds.end - (ds.start || 0);
                  const threshold = Math.min(5, clipDuration / 2);
                  if (currentTime < ds.end - threshold) {
                    player.seekTo(ds.start || 0);
                    player.playVideo();
                    return;
                  }
                }
                if (aiModeRef.current) {
                  onAiNextRef.current?.();
                } else {
                  onBlastRef.current?.();
                }
              } catch {}
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [!!scene]); // Only run once when scene first becomes available

  // ─── Scene change: transition + load video in parallel ───
  useEffect(() => {
    if (!scene) return;

    if (prevIdRef.current && prevIdRef.current !== scene.id) {
      channelNumRef.current = Math.floor(Math.random() * 60) + 2;
      setTransitioning(true);

      // 🔥 Optimization #1 + #3: Reuse player + load DURING transition
      if (playerRef.current && playerReadyRef.current) {
        playingSceneRef.current = scene;
        try {
          playerRef.current.loadVideoById({
            videoId: scene.videoId,
            startSeconds: scene.start,
            endSeconds: scene.end,
          });
          if (hasInteractedRef.current) {
            playerRef.current.unMute();
            playerRef.current.setVolume(100);
          } else {
            playerRef.current.mute();
          }
        } catch {}
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

  // ─── Pre-warm next scene in hidden player ───
  useEffect(() => {
    if (!nextScene || nextScene.id === preWarmSceneIdRef.current) return;
    // Don't pre-warm the scene that's currently playing
    if (nextScene.id === playingSceneRef.current?.id) return;

    preWarmSceneIdRef.current = nextScene.id;

    loadYTApi().then(() => {
      // Reuse existing pre-warm player
      if (preWarmPlayerRef.current && preWarmReadyRef.current) {
        try {
          preWarmPlayerRef.current.loadVideoById({
            videoId: nextScene.videoId,
            startSeconds: nextScene.start,
            endSeconds: nextScene.end,
          });
          preWarmPlayerRef.current.mute();
          // Pause after buffering a few seconds of video data
          setTimeout(() => {
            try { preWarmPlayerRef.current?.pauseVideo(); } catch {}
          }, 3000);
        } catch {}
        return;
      }

      // Create pre-warm player for the first time
      const container = preWarmContainerRef.current;
      if (!container) return;
      container.innerHTML = "";
      const div = document.createElement("div");
      container.appendChild(div);

      preWarmPlayerRef.current = new window.YT.Player(div, {
        width: "1",
        height: "1",
        videoId: nextScene.videoId,
        playerVars: {
          start: nextScene.start,
          end: nextScene.end,
          autoplay: 1,
          mute: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady(event) {
            preWarmReadyRef.current = true;
            event.target.mute();
            event.target.playVideo();
            // Pause after buffering enough data
            setTimeout(() => {
              try { event.target.pauseVideo(); } catch {}
            }, 3000);
          },
        },
      });
    });
  }, [nextScene?.id]);

  // ─── Clean up both players on unmount ───
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
      if (preWarmPlayerRef.current) {
        try { preWarmPlayerRef.current.destroy(); } catch {}
        preWarmPlayerRef.current = null;
      }
    };
  }, []);

  // ─── Unmute + max volume the instant the user first interacts ───
  useEffect(() => {
    if (!hasInteracted || !playerRef.current) return;
    try {
      playerRef.current.unMute();
      playerRef.current.setVolume(100);
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
              <div ref={containerRef} className="yt-player-container" />
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

              {/* AI scanning static — heavy persistent static for dial mode */}
              {aiMode === "dial" && aiLoading && (
                <div className="ai-static-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-static-text">SCANNING...</div>
                </div>
              )}

              {/* Error overlays */}
              {aiError === "SIGNAL_LOST" && (
                <div className="ai-error-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-error-text">COULDN'T FIND CLIPS — TRY AGAIN</div>
                </div>
              )}
              {aiError === "DEAD_AIR" && (
                <div className="ai-error-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-error-text">NO CLIPS FOUND — TRY AGAIN</div>
                </div>
              )}
              {aiError === "INVALID_KEY" && (
                <div className="ai-error-overlay">
                  <div className="ai-static-snow" />
                  <div className="ai-error-text">API KEY EXPIRED — RECONNECT</div>
                </div>
              )}
            </div>
          </div>

          <div className="tv-info-bar">
            <div className="tv-info-text">
              <blockquote className="scene-quote">
                {aiMode && <span className="ai-badge">AI PICK</span>}
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
              {aiMode ? (
                <>
                  {aiLoading ? (
                    /* State 3: Scanning — disabled status + Cancel button */
                    <>
                      <button className="ai-pick-btn ai-pick-btn-loading" disabled>
                        ⟳ Scanning...
                      </button>
                      <button className="ai-exit-btn" onClick={onExitAi}>
                        ✕ Cancel
                      </button>
                    </>
                  ) : (
                    /* State 4: Playing AI clip — Next + Exit buttons */
                    <>
                      <button
                        className="ai-pick-btn"
                        onClick={onAiNext}
                        disabled={aiWaiting}
                      >
                        {aiWaiting ? "⟳ Loading..." : "⚡ Next AI Clip"}
                      </button>
                      <button className="ai-exit-btn" onClick={onExitAi}>
                        ✕ Exit AI
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <button className="tv-blast-btn" onClick={onBlast}>
                    ⚡ Blast Me
                  </button>
                  <button className="ai-pick-btn" onClick={handleAiPickClick}>
                    ✨ AI Pick
                  </button>
                  {hasKey && !showKeyInput && (
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
            </div>

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
