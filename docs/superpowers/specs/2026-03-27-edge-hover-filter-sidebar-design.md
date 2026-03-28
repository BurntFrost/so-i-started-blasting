# Edge-Hover Filter Sidebar

**Date**: 2026-03-27
**Status**: Approved

## Summary

Replace the click-only filter sidebar with an edge-hover triggered panel. When the user's mouse approaches within 60px of the left or right screen edge, the filter sidebar slides in from that side. The sidebar supports two modes: peek (auto-closes on mouse-away) and pinned (stays open after interaction).

## Behavior

### Trigger

- A `mousemove` listener on `window` checks if `clientX < 60` (left edge) or `clientX > window.innerWidth - 60` (right edge).
- A 300ms hover delay prevents accidental triggers — the mouse must remain in the zone for 300ms before the sidebar opens.
- If the sidebar is already open (from either edge or button), edge detection is paused.

### Sidebar Side

- Left edge hover opens the sidebar anchored to the left.
- Right edge hover opens the sidebar anchored to the right.
- The header button (🎛 Filters) always opens from the right, matching current behavior.

### Dismissal Modes

**Peek mode** (edge-hover triggered):
- Sidebar opens without overlay (semi-transparent content behind).
- When the mouse leaves the sidebar area back toward center, the sidebar closes after a 200ms grace period (prevents flicker when mouse briefly exits).
- No overlay click needed — it just slides away.

**Pinned mode** (activated by interaction):
- If the user clicks any filter pill while in peek mode, the sidebar pins open.
- Pinned mode adds the dark overlay (same as current behavior).
- Closes only via: Escape key, overlay click, or close button.
- The header button always opens in pinned mode.

### Mobile

- Edge-hover is disabled entirely (no `mousemove` on touch devices).
- The header 🎛 Filters button remains the only way to open filters on mobile.
- Behavior is identical to current implementation on mobile.

## Components

### App.jsx — State Changes

New state variables:
- `filterSide`: `"left"` | `"right"` | `null` — which side the sidebar is on (null = closed)
- `filterPinned`: `boolean` — whether the sidebar is in pinned mode

Replace `showFilters` boolean with `filterSide !== null` check.

New `useEffect` for edge detection:
- Attach `mousemove` on `window`.
- Track a timeout ref for the 300ms hover delay.
- When mouse enters the 60px zone: start delay timer.
- When mouse exits the zone (before delay fires): clear timer.
- When delay fires: set `filterSide` to `"left"` or `"right"`, `filterPinned` to `false`.
- Skip detection on touch devices (`'ontouchstart' in window` or `navigator.maxTouchPoints > 0`).
- Skip detection when sidebar already open.

Header button handler:
- Sets `filterSide` to `"right"` and `filterPinned` to `true` (same as current behavior).

### FilterBar.jsx — Props Changes

New props:
- `side`: `"left"` | `"right"` — which edge to anchor to.
- `pinned`: `boolean` — whether overlay is shown and mouse-leave is ignored.
- `onMouseLeave`: callback for peek-mode dismissal.
- `onPin`: callback when user interacts (clicks a filter), transitions to pinned mode.

Changes:
- Wrap the sidebar `<div>` with `onMouseLeave` handler (only active when `!pinned`).
- `onToggle` calls `onPin` before toggling the filter (pins on first interaction).
- Overlay only renders when `pinned` is true.
- CSS class switches between `filter-sidebar-left` and `filter-sidebar-right` based on `side` prop.

### CSS in App.jsx

New classes:
- `.filter-sidebar-left`: mirrors `.filter-sidebar` but anchored to `left: 0` with `border-right` instead of `border-left`, and uses `slide-in-left` animation.
- `.filter-sidebar-right`: rename of current `.filter-sidebar` (right-anchored, unchanged).

New keyframes:
- `@keyframes slide-in-left`: mirrors `slide-in` but from `translateX(-100%)`.

Peek mode modifier:
- `.filter-sidebar.peek`: no overlay, slightly reduced opacity on the sidebar background (optional, for a ghostly peek feel).

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Sidebar open on right, mouse hits left edge | Ignored — sidebar must be closed first |
| Mouse leaves browser window entirely | Treated as mouse-away — closes if in peek mode |
| User scrolls with scrollbar (right edge) | 60px zone doesn't overlap standard scrollbars (~15px) |
| Rapid mouse movement through edge zone | 300ms delay prevents opening |
| Filter button clicked while peek-mode open | Transitions to pinned mode |
| Window resize while sidebar open | Sidebar stays open, edge detection recalculates on next move |

## What Does Not Change

- Filter pill layout, counts, groups, clear-all functionality
- History panel (📼) — button-only
- Favorites panel (♥) — button-only
- Mobile interaction — button-only, identical to current
- Keyboard shortcut (Escape to close) — works in both modes
