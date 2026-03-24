# AI Feature UX Overhaul — Design Spec

## Problem

The current AI discovery feature ("Pirate Tuner") is confusing and unintuitive:
- API key entry is hidden behind a TV flip animation (ServicePanel)
- The Channel Dial is a separate component positioned off-canvas, hidden on mobile
- Terminology ("PIRATE ZONE", "DECODER", "SIGNAL LOST") is thematic but unclear
- During AI mode, the only exit is clicking "📡 SCANNING..." which reads as a status, not a button
- Users must discover a tiny wrench icon, flip the TV, enter a key, flip back, then find and click the pirate zone — 6 steps for one action

## Solution

Replace the entire AI interaction with a single "AI Pick" button in the info bar next to "Blast Me". Inline the API key entry. Remove ChannelDial, ServicePanel, and TV flip.

## UI States

### State 1: Default (No API Key)

The info bar actions show two buttons side-by-side:

```
[ ⚡ Blast Me ] [ ✨ AI Pick ] [♡]
```

- "AI Pick" has a purple gradient background (`#6c3ce0` → `#8b5cf6`)
- Both buttons are always visible, on all screen sizes
- No indication that an API key is needed until the user clicks "AI Pick"

### State 2: Key Input (First Click Without Key)

Clicking "AI Pick" without a stored API key reveals an inline input below the buttons:

```
[ ⚡ Blast Me ] [ ✨ AI Pick ] [♡]
┌─────────────────────────────────────────────────┐
│ [Paste Anthropic API key...     ] [Connect] [✕] │
│ Key stored locally. Never sent to us.           │
└─────────────────────────────────────────────────┘
```

- Input slides down with a brief CSS transition (`max-height` + `opacity`)
- Input auto-focuses for immediate paste
- Paste auto-submits (same as current ServicePanel behavior)
- Enter key submits
- "Connect" button for explicit submit
- Small "✕" dismiss button closes the input without submitting
- Clicking "AI Pick" again also toggles the input closed
- Privacy note in small muted text below input
- Purple border on the input container (`#6c3ce0`)
- On successful validation: input disappears, AI discovery triggers immediately (no extra click)
- On invalid key: red border, error text "Invalid key — try again", input stays open
- On network error during validation: red border, "Connection error — try again"
- On validation in progress: "Connect" button shows spinner, input disabled

### State 3: AI Scanning (Loading)

```
[ ✕ Cancel ] [ ⟳ Scanning... ] [♡]
```

- "AI Pick" button shows a spinning icon + "Scanning..." text (disabled, not clickable — avoids the same "status that looks like a button" problem we're fixing)
- Purple glow/pulse on the button
- "Blast Me" is replaced with "✕ Cancel" (muted style) which exits AI mode — clear affordance
- TV screen shows the existing static/snow overlay with "SCANNING..." text (keep this — it's good)
- Once first clip arrives: loading state ends, transitions to State 4

### State 4: Playing AI Clip

```
[AI PICK] "Never gonna give you up"
Rick Astley's iconic music video

[ ⚡ Next AI Clip ] [ ✕ Exit AI ] [♡]
```

- Small purple "AI PICK" badge appears before the quote text to distinguish AI clips from curated ones
- Primary button becomes "⚡ Next AI Clip" (purple gradient, replaces "Blast Me")
- Secondary button "✕ Exit AI" (muted/outline style) explicitly exits AI mode
- Favorite button still works on AI-discovered clips
- Tags/era/source display normally — AI clips from `/api/dial` return the same schema as curated scenes (`vibes[]`, `era`, `source{title, year}`). If any field is missing, render gracefully (empty tags, no source line).

### State 4b: Buffer Exhausted, Stream Still Open

If user clicks "Next AI Clip" but all buffered clips are played and the stream is still producing:
- "Next AI Clip" button shows a small inline spinner: "⟳ Loading..."
- TV screen shows static overlay (same as State 3 but without the large "SCANNING..." text)
- Once next clip arrives from stream, it plays immediately
- If stream ends with no more clips, transition to State 5

### State 5: AI Stream Exhausted

When all AI clips have been played and the stream is done:
- Automatically exits AI mode
- Returns to curated scene (same as current behavior)
- Buttons revert to State 1

### State 6: Errors

**Invalid key (during inline input):**
- Red border on input, error text below: "Invalid key — try again"
- Input stays open for retry

**Network error (during inline input validation):**
- Red border on input, error text: "Connection error — try again"
- Input stays open for retry

**INVALID_KEY (mid-stream — key revoked after initial validation):**
- Static overlay with error text: "API key expired — reconnect"
- Auto-clear after 3 seconds
- Reset key status to "empty" (clear from localStorage)
- Show inline key input (State 2) so user can re-enter a key

**Stream error (SIGNAL_LOST):**
- Static overlay with error text: "Couldn't find clips — try again"
- Auto-clear after 3 seconds, return to curated mode

**No results (DEAD_AIR):**
- Static overlay with error text: "No clips found — try again"
- Auto-clear after 3 seconds, return to curated mode

### State 7: Key Management

Users who already have a key stored need a way to disconnect/change it:
- Small 🔑 icon button appears next to "AI Pick" only when a key is stored and AI mode is **not** active (hidden during States 3, 4, 4b)
- Clicking it opens a popover below the button: `[••••sk-1234] [Disconnect]`
- Clicking "Disconnect" clears the key, closes popover, resets to State 1
- Popover dismisses on click-outside or Escape key
- On mobile: same behavior, popover is full-width within the info bar

## Components to Remove

| Component | File | Lines |
|-----------|------|-------|
| ChannelDial | `src/components/ChannelDial.jsx` | ~55 |
| ServicePanel | `src/components/ServicePanel.jsx` | ~130 |
| TV flip logic | `src/App.jsx` (state + JSX) | ~30 |
| Dial CSS | `src/App.jsx` (styles) | ~150 |
| Service panel CSS | `src/App.jsx` (styles) | ~150 |
| TV flip CSS | `src/App.jsx` (styles) | ~40 |
| `handleDialSpin` callback | `src/App.jsx` | ~8 |
| `showServicePanel`/`flipped` state | `src/App.jsx` | ~5 |
| ChannelDial/ServicePanel imports | `src/App.jsx` | ~2 |

**Estimated removal: ~570 lines**

## Components to Modify

### ScenePlayer.jsx
- Add `hasKey` and `onRequestKey` props
- Add `aiMode` badge rendering ("AI PICK" label)
- Replace single blast button with state-dependent button group:
  - Normal mode: `[Blast Me] [AI Pick]`
  - AI loading: `[Cancel] [Scanning... (disabled)]`
  - AI playing: `[Next AI Clip] [Exit AI]`
- Add inline key input component (can be a small internal component or extracted)

### App.jsx
- Remove `flipped` state, `ChannelDial` import/JSX, `ServicePanel` import/JSX
- Remove TV flip wrapper divs and 3D transform logic
- Add `showKeyInput` state for inline key entry visibility
- Wire `handleAiPick`: if no key → show input; if key → `spinDial()`
- Remove all dial/service-panel/flip CSS blocks

### useApiKey.js
- Add `"error"` status for network failures (distinct from `"invalid"` for bad keys)
- Catch block: if `res.ok === false` → `"invalid"`, if fetch throws → `"error"`
- Expose status so inline input can show the right error message

### useAiDiscovery.js
- Add `dialWaiting` state: set to `true` when `advanceAi()` is called but buffer is empty and stream isn't done
- Reset `dialWaiting` to `false` when next clip arrives from stream (in `onEvent`)
- Expose `dialWaiting` so UI can show the State 4b spinner on the "Next AI Clip" button

## New CSS

Minimal additions to App.jsx styles:

- `.ai-pick-btn` — purple gradient button style
- `.ai-pick-btn-loading` — pulse animation during scanning
- `.ai-key-input` — inline key input container with slide-down transition
- `.ai-badge` — small purple pill badge for "AI PICK" label on clips
- `.ai-exit-btn` — muted outline button for "Exit AI"
- `.ai-key-popover` — small popover for key management

Estimated addition: ~80 lines of CSS.

## Behavior Details

### First-time flow
1. User sees "✨ AI Pick" button → clicks it
2. Inline key input slides down → user pastes key
3. Key validates → input disappears → AI scanning starts immediately
4. First clip loads → user watches AI clips
5. User clicks "Exit AI" or clips run out → back to curated

**Total: 2 intentional clicks** (AI Pick → paste key). Down from 6.

### Returning user flow
1. User clicks "✨ AI Pick"
2. AI scanning starts immediately (key already in localStorage)
3. Clips play

**Total: 1 click.**

### Mobile
- Buttons use `flex-wrap: wrap` — they wrap to a second row on narrow screens rather than overflowing
- In AI playing mode (3 elements: Next AI Clip, Exit AI, heart), "Exit AI" and heart sit on the second row
- No hidden elements — everything works at any width
- Key input is full-width on mobile
- Key management popover is full-width within the info bar on mobile


## Out of Scope
- Changing the AI backend (prompts, streaming, model)
- Changing how clips are displayed in the player
- Modifying favorites/history behavior
- Any new AI features
