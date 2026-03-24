# AI Feature UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the confusing Channel Dial + Service Panel + TV flip AI feature with a single inline "AI Pick" button and key input in the info bar.

**Architecture:** Remove 3 components (ChannelDial, ServicePanel, TV flip wrapper). Add AI button states and inline key input directly to ScenePlayer's info bar. Modify useApiKey and useAiDiscovery hooks to support new error differentiation and buffer-waiting state.

**Tech Stack:** React 18, Vite, CSS-in-JS (template literal in App.jsx), no TypeScript

**Spec:** `docs/superpowers/specs/2026-03-23-ai-ux-overhaul-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/hooks/useApiKey.js` | Add `"error"` status for network failures |
| Modify | `src/hooks/useAiDiscovery.js` | Add `dialWaiting` state for buffer-empty |
| Modify | `src/components/ScenePlayer.jsx` | New button group, inline key input, AI badge |
| Modify | `src/App.jsx` (JS) | Remove flip/dial/service, wire new AI props |
| Modify | `src/App.jsx` (CSS) | Remove ~500 lines dial/service/flip CSS, add ~80 lines new AI CSS |
| Delete | `src/components/ChannelDial.jsx` | Removed entirely |
| Delete | `src/components/ServicePanel.jsx` | Removed entirely |

---

### Task 1: Update useApiKey — distinguish network errors from invalid keys

**Files:**
- Modify: `src/hooks/useApiKey.js`

- [ ] **Step 1: Add network error differentiation**

In `useApiKey.js`, the catch block on line 49 currently sets `"invalid"` for all errors. Change the `setApiKey` callback to distinguish API-returned invalid from network failures:

```js
// Inside the try block (lines 33-48), replace the catch:
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
      });
      const data = await res.json();

      if (data.valid) {
        try { localStorage.setItem(STORAGE_KEY, key); } catch {}
        setKeyStatus("connected");
      } else {
        setKeyStatus("invalid");
      }
    } catch {
      // Network error (offline, server unreachable) — distinct from invalid key
      setKeyStatus("error");
    }
```

The status type comment on line 20 should update to: `// "empty" | "validating" | "connected" | "invalid" | "error"`

- [ ] **Step 2: Verify no regressions**

Run: `npm run build`
Expected: Build succeeds (status `"error"` is just a string, no type checking)

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useApiKey.js
git commit -m "feat: distinguish network errors from invalid keys in useApiKey"
```

---

### Task 2: Update useAiDiscovery — add dialWaiting state

**Files:**
- Modify: `src/hooks/useAiDiscovery.js`

- [ ] **Step 1: Add dialWaiting state**

Add a new state variable after `dialStreamDone` (line 47):

```js
const [dialWaiting, setDialWaiting] = useState(false);
```

- [ ] **Step 2: Set dialWaiting in advanceAi**

In the `advanceAi` callback (~line 131), when buffer is empty but stream isn't done, set waiting:

```js
const advanceAi = useCallback(() => {
    if (aiMode === "dial") {
      const nextIdx = dialIndex + 1;
      if (nextIdx < dialResults.length) {
        setDialIndex(nextIdx);
        setDialWaiting(false);
        return false;
      } else if (dialStreamDone) {
        exitAiMode();
        return true;
      }
      // Buffer empty, stream still running — signal waiting state
      setDialWaiting(true);
      return false;
    }
    return false;
  }, [aiMode, dialIndex, dialResults.length, dialStreamDone]);
```

- [ ] **Step 3: Clear dialWaiting when new clip arrives**

In the `spinDial` callback's `onEvent` handler (~line 106), clear waiting when a new scene comes in and the user is waiting:

```js
onEvent(data) {
  if (data.scene) {
    accumulated.push(data.scene);
    setDialResults([...accumulated]);
    if (accumulated.length === 1) setDialLoading(false);
    setDialWaiting(false);
  }
},
```

- [ ] **Step 4: Reset dialWaiting in spinDial init and exitAiMode**

In `spinDial` init (~line 93), add `setDialWaiting(false);`

In `exitAiMode` (~line 72), add `setDialWaiting(false);`

- [ ] **Step 5: Export dialWaiting**

Add `dialWaiting` to the return object (~line 147):

```js
return {
    aiMode, currentAiScene,
    dialResults, dialIndex,
    dialLoading, dialStreamDone,
    dialWaiting,
    aiError,
    spinDial, advanceAi, exitAiMode,
  };
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useAiDiscovery.js
git commit -m "feat: add dialWaiting state for buffer-exhausted UI"
```

---

### Task 3: Modify ScenePlayer — new button group, inline key input, AI badge

This is the core UI task. ScenePlayer's info bar gets a complete overhaul of its action buttons.

**Files:**
- Modify: `src/components/ScenePlayer.jsx`

- [ ] **Step 1: Update ScenePlayer props**

Change the prop signature (line 21) to:

```js
export function ScenePlayer({
  scene, nextScene, isFavorite, onToggleFavorite, hasInteracted,
  onBlast, onAiPick, onAiNext, onExitAi,
  aiMode, aiLoading, aiWaiting, aiError,
  hasKey, keyStatus, onSubmitKey, onClearKey,
}) {
```

- [ ] **Step 2: Add key input state**

After the existing `useState` declarations (~line 22), add:

```js
const [showKeyInput, setShowKeyInput] = useState(false);
const [keyInputValue, setKeyInputValue] = useState("");
const [showKeyPopover, setShowKeyPopover] = useState(false);
const keyInputRef = useRef(null);
```

- [ ] **Step 3: Add key input handlers**

After the helper functions (~line 60), add:

```js
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
```

- [ ] **Step 4: Add AI badge to scene info**

In the JSX, find the `scene-quote` blockquote (~line 331). Add an AI badge before the quote when in AI mode:

```jsx
<div className="tv-info-text">
  <blockquote className="scene-quote">
    {aiMode && <span className="ai-badge">AI PICK</span>}
    "{displayScene.quote}"
  </blockquote>
  <p className="scene-description">{displayScene.description}</p>
```

- [ ] **Step 5: Replace the button group**

Replace the entire `tv-info-actions` div (~lines 357-371) with the new state-dependent buttons:

```jsx
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
```

- [ ] **Step 6: Add inline key input below the actions**

After the `tv-info-actions` div, add the collapsible key input:

```jsx
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
      {"•".repeat(8)}{onClearKey && "sk-..."}
    </span>
    <button className="ai-key-popover-disconnect" onClick={() => { onClearKey?.(); setShowKeyPopover(false); }}>
      Disconnect
    </button>
  </div>
)}
```

- [ ] **Step 7: Update error overlay text**

Find the error overlays in the JSX (~lines 314-325). Update the display text:

```jsx
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
```

- [ ] **Step 8: Verify build**

Run: `npm run build`
Expected: Build succeeds (new props not yet wired from App.jsx — that's Task 5)

- [ ] **Step 9: Commit**

```bash
git add src/components/ScenePlayer.jsx
git commit -m "feat: new AI Pick button, inline key input, and AI badge in ScenePlayer"
```

---

### Task 4: Update App.jsx — remove flip/dial/service, wire new props, delete old components

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Remove imports**

Delete lines 13-14:
```js
import { ServicePanel } from "./components/ServicePanel.jsx";
import { ChannelDial } from "./components/ChannelDial.jsx";
```

- [ ] **Step 2: Remove state and callbacks**

Remove `showServicePanel` state (line 1594):
```js
const [showServicePanel, setShowServicePanel] = useState(false);
```

Remove `handleDialSpin` callback (lines 1678-1685):
```js
  const handleDialSpin = useCallback(() => {
    if (!hasKey) {
      setShowServicePanel(true);
      return;
    }
    spinDial();
  }, [hasKey, spinDial]);
```

- [ ] **Step 3: Update useAiDiscovery destructure**

Add `dialWaiting` to the destructure (~line 1596):

```js
const {
    aiMode, currentAiScene,
    dialLoading, dialStreamDone,
    dialWaiting,
    aiError,
    spinDial, advanceAi, exitAiMode,
  } = useAiDiscovery(apiKey, history, favoriteIds, activeFilters);
```

- [ ] **Step 4: Replace TV flip wrapper with simple ScenePlayer**

Replace the entire tv-flip-container block (lines 1733-1776) with:

```jsx
<ScenePlayer
  scene={aiMode ? currentAiScene : current}
  nextScene={aiMode ? null : nextUp}
  isFavorite={
    (aiMode ? currentAiScene : current)
      ? isFavorite((aiMode ? currentAiScene : current).id)
      : false
  }
  onToggleFavorite={handleToggleFavorite}
  hasInteracted={hasInteracted}
  onBlast={handleBlast}
  onAiPick={spinDial}
  onAiNext={handleAiEnd}
  onExitAi={handleExitAi}
  aiMode={aiMode}
  aiLoading={dialLoading}
  aiWaiting={dialWaiting}
  aiError={aiError}
  hasKey={hasKey}
  keyStatus={keyStatus}
  onSubmitKey={setApiKey}
  onClearKey={clearApiKey}
/>
```

**Important:** `onBlast` is now always `handleBlast`. However, the YT player's auto-advance (when a clip ends naturally) also calls `onBlastRef.current`. In ScenePlayer, update the `onStateChange` ended handler (~line 138) to call `onAiNext` when in AI mode:

In ScenePlayer.jsx, add a ref for `onAiNext`:
```js
const onAiNextRef = useRef(onAiNext);
onAiNextRef.current = onAiNext;
const aiModeRef = useRef(aiMode);
aiModeRef.current = aiMode;
```

Then in the `onStateChange` ended handler, replace `onBlastRef.current?.()` with:
```js
if (aiModeRef.current) {
  onAiNextRef.current?.();
} else {
  onBlastRef.current?.();
}
```

- [ ] **Step 5: Delete old component files**

```bash
rm -f src/components/ChannelDial.jsx src/components/ServicePanel.jsx
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add -u src/components/ChannelDial.jsx src/components/ServicePanel.jsx
git add src/App.jsx
git commit -m "refactor: remove TV flip, dial, service panel — wire new AI props to ScenePlayer"
```

---

### Task 5: Update App.jsx CSS — remove old, add new

**Note:** Do this immediately after Task 4 in the same session — Tasks 4 and 5 both modify App.jsx.

This task handles the CSS template literal in App.jsx.

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Remove 3D TV Flip CSS**

Delete the entire block from `/* ═══ 3D TV Flip Container ═══ */` (line 958) through the end of `.tv-back` (line 1002). This is approximately lines 958-1002.

- [ ] **Step 2: Remove Service Panel CSS**

Delete the entire block from `/* ═══ Service Panel ═══ */` (line 1004) through `.service-back-btn:hover` (approximately line 1214).

- [ ] **Step 3: Remove TV flip trigger CSS**

Delete `.tv-flip-trigger` and `.tv-flip-trigger:hover` (approximately lines 1216-1240).

- [ ] **Step 4: Remove Channel Dial CSS**

Delete the entire block from `/* ═══ Channel Dial ═══ */` (line 1242) through the `@media (max-width: 700px) { .channel-dial { display: none; } }` (approximately line 1467).

- [ ] **Step 5: Add new AI button CSS**

Insert new CSS in place of the removed blocks (before `/* ═══ AI Overlay States ═══ */`):

```css
  /* ═══ AI Pick Button & Key Input ═══ */
  .ai-pick-btn {
    background: linear-gradient(135deg, #6c3ce0, #8b5cf6) !important;
    color: white !important;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-weight: bold;
    font-size: 0.85rem;
    cursor: pointer;
    transition: box-shadow 0.2s, opacity 0.2s;
  }
  .ai-pick-btn:hover {
    box-shadow: 0 0 16px rgba(139, 92, 246, 0.5);
  }
  .ai-pick-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }
  .ai-pick-btn:disabled:hover {
    box-shadow: none;
  }
  .ai-pick-btn-loading {
    animation: ai-btn-pulse 1.5s ease-in-out infinite;
  }

  @keyframes ai-btn-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(139, 92, 246, 0.4); }
    50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.7); }
  }

  .ai-exit-btn {
    background: transparent;
    color: var(--text-1);
    border: 1px solid var(--text-2);
    padding: 10px 16px;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
  }
  .ai-exit-btn:hover {
    border-color: var(--text-0);
    color: var(--text-0);
  }

  .ai-key-btn {
    background: none;
    border: 1px solid var(--border);
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: border-color 0.2s;
  }
  .ai-key-btn:hover {
    border-color: var(--text-2);
  }

  .ai-badge {
    display: inline-block;
    background: #6c3ce0;
    color: white;
    font-size: 0.6rem;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    margin-right: 6px;
    vertical-align: middle;
    letter-spacing: 0.05em;
  }

  /* Inline key input */
  .ai-key-input {
    margin-top: 10px;
    padding: 10px;
    background: rgba(108, 60, 224, 0.05);
    border: 1px solid rgba(108, 60, 224, 0.3);
    border-radius: 6px;
    animation: ai-key-slide 0.2s ease-out;
  }
  @keyframes ai-key-slide {
    from { opacity: 0; max-height: 0; margin-top: 0; }
    to { opacity: 1; max-height: 100px; margin-top: 10px; }
  }
  .ai-key-input-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .ai-key-field {
    flex: 1;
    background: transparent;
    border: 1px solid var(--text-2);
    color: var(--text-0);
    padding: 8px 10px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.8rem;
    outline: none;
    transition: border-color 0.2s;
  }
  .ai-key-field:focus {
    border-color: #6c3ce0;
  }
  .ai-key-field-error {
    border-color: var(--neon-red) !important;
  }
  .ai-key-field::placeholder {
    color: var(--text-2);
  }
  .ai-key-connect-btn {
    background: #6c3ce0;
    color: white;
    border: none;
    padding: 8px 14px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: bold;
    cursor: pointer;
    white-space: nowrap;
  }
  .ai-key-connect-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ai-key-dismiss-btn {
    background: none;
    border: none;
    color: var(--text-2);
    cursor: pointer;
    font-size: 0.9rem;
    padding: 4px 8px;
  }
  .ai-key-dismiss-btn:hover {
    color: var(--text-0);
  }
  .ai-key-hint {
    font-size: 0.65rem;
    color: var(--text-2);
    margin-top: 6px;
  }
  .ai-key-error {
    color: var(--neon-red);
  }

  /* Key management popover */
  .ai-key-popover {
    position: absolute;
    right: 0;
    margin-top: 6px;
    background: var(--bg-1);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    z-index: 20;
    white-space: nowrap;
  }
  .ai-key-popover-key {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-2);
  }
  .ai-key-popover-disconnect {
    background: none;
    border: 1px solid var(--neon-red);
    color: var(--neon-red);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.7rem;
    cursor: pointer;
  }
  .ai-key-popover-disconnect:hover {
    background: rgba(255, 23, 68, 0.1);
  }

  /* Ensure info-actions can position popover */
  .tv-info-actions {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "style: replace dial/service/flip CSS with new AI button and key input styles"
```

---

### Task 6: Handle INVALID_KEY error in useAiDiscovery

**Files:**
- Modify: `src/hooks/useAiDiscovery.js`
- Modify: `src/components/ScenePlayer.jsx`

- [ ] **Step 1: Add INVALID_KEY handling in error auto-clear**

In `useAiDiscovery.js`, the error auto-clear effect (~line 78) already calls `exitAiMode()` after 3 seconds. The `INVALID_KEY` error from the stream will trigger this automatically. No change needed in the hook.

However, in `ScenePlayer.jsx`, when INVALID_KEY error auto-clears, we want to show the key input. Add an effect:

```js
// Show key input when INVALID_KEY error occurs
useEffect(() => {
  if (aiError === "INVALID_KEY") {
    // The error overlay shows for 3s, then aiMode exits.
    // After exit, show key input for re-entry.
    const timer = setTimeout(() => {
      setShowKeyInput(true);
    }, 3100); // slightly after the 3s auto-clear
    return () => clearTimeout(timer);
  }
}, [aiError]);
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAiDiscovery.js src/components/ScenePlayer.jsx
git commit -m "feat: handle INVALID_KEY error — show key input after expiry overlay"
```

---

### Task 7: Update CLAUDE.md architecture docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update architecture tree**

Remove `ChannelDial.jsx` and `ServicePanel.jsx` from the components list. Update descriptions:
- ScenePlayer: add "AI Pick button, inline key input"
- Remove any mention of "service panel" or "channel dial"
- Remove "3D flip CSS" from the App.jsx description

- [ ] **Step 2: Update localStorage keys**

No changes needed — `sisb-api-key` and `sisb-ai-discoveries` remain.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update architecture for AI UX overhaul — remove dial/service refs"
```

---

### Task 8: Visual verification

- [ ] **Step 1: Start dev server**

```bash
npx vercel dev
```

- [ ] **Step 2: Verify State 1 — default buttons visible**

Open browser. Click "Start Blasting". Confirm both "⚡ Blast Me" and "✨ AI Pick" buttons visible in info bar.

- [ ] **Step 3: Verify State 2 — key input**

Click "✨ AI Pick" without a key. Confirm inline input slides down. Confirm dismiss (✕) closes it. Confirm clicking "AI Pick" again also toggles it.

- [ ] **Step 4: Verify State 3/4 — AI scanning and playback**

Enter a valid API key. Confirm input disappears, scanning begins, clips play. Confirm "Next AI Clip" and "Exit AI" buttons appear.

- [ ] **Step 5: Verify no dial or flip remnants**

Confirm no rotary dial on the side of the TV. Confirm no wrench button. Confirm no TV flip animation.

- [ ] **Step 6: Verify mobile**

Resize to <500px. Confirm buttons wrap properly. Confirm key input is full-width.

- [ ] **Step 7: Final build check**

Run: `npm run build`
Expected: Clean build, no warnings
