# Mobile Support Plan

## Current State

- No touch input handling exists at all
- Canvas is hardcoded to 500×500px (`COLS * TILE = 25 × 20`) — overflows mobile screens
- `body { height: 100vh; }` prevents scrolling on short screens; welcome page overflows
- Replay canvas in highscore modal is also hardcoded to 500×500px
- No PWA support (no manifest, no service worker)
- No viewport meta beyond the basic one

## Problems

| # | Issue | Where |
|---|-------|-------|
| 1 | Canvas fixed at 500×500px overflows both width and height on most phones | `game.js` line 7-8, `highscore.js` line 466-467 |
| 2 | `body { height: 100vh }` locks viewport; welcome page overflows and can't scroll | `index.html` CSS |
| 3 | No touch event handling — game is unplayable on touchscreens | `game.js` (only keyboard listeners) |
| 4 | Replay canvas overflows the modal on mobile | `highscore.js` replay overlay |
| 5 | No `touch-action: none` — page scrolls while swiping to control snake | Global |
| 6 | `#powerup-flash` uses `top: 80px` which may overlap on small screens | `index.html` CSS |
| 7 | Hardcoded `font-size: 8rem` on countdown number overflows on narrow screens | `index.html` CSS |
| 8 | No service worker — not installable, no offline support | N/A |
| 9 | No PWA manifest — not installable as an app | N/A |
| 10 | `position: fixed` on all modals/welcome can cause issues on mobile browsers with dynamic toolbars | Global |

## Proposed Solutions

### 1. Responsive canvas sizing

Make the canvas scale to fit available screen space. The grid stays 25×25 cells, but `TILE` is computed dynamically:

```js
const GRID = 25;

function resizeCanvas(canvas) {
  const maxW = Math.min(window.innerWidth - 20, window.innerHeight * 0.55);
  const tileSize = Math.floor(maxW / GRID);
  canvas.width = tileSize * GRID;
  canvas.height = tileSize * GRID;
  return tileSize;
}
```

- **Game canvas**: call on init and on `window.resize`
- **Replay canvas**: call in `showReplayOverlay`, using modal width instead of full screen

Tile-based rendering must multiply all positions by the actual tile size.

### 2. Fix viewport overflow

```css
body {
  height: 100vh;       /* keep centered layout */
  overflow-y: auto;    /* allow scroll on short screens */
  -webkit-overflow-scrolling: touch;
}
#welcome {
  overflow-y: auto;    /* allow card list to scroll */
  max-height: 100vh;
}
```

### 3. Touch controls (swipe to change direction)

Use `touchstart` / `touchmove` / `touchend` on the canvas:

```js
let touchStartX, touchStartY;
const SWIPE_THRESHOLD = 30; // px minimum before registering direction

canvas.addEventListener('touchstart', function (e) {
  e.preventDefault();
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchmove', function (e) {
  e.preventDefault(); // prevent scroll
}, { passive: false });

canvas.addEventListener('touchend', function (e) {
  e.preventDefault();
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    setDirection(dx > 0 ? 'RIGHT' : 'LEFT');
  } else {
    setDirection(dy > 0 ? 'DOWN' : 'UP');
  }
});
```

- Direction is set on `touchend` (not during move), so a flick changes direction once
- Prevents page scroll during swipes

### 4. Long-tap Wall Breaker

Hold for ~500ms to activate Wall Breaker (only in Enhanced mode):

```js
let wallBreakerTimer = null;

canvas.addEventListener('touchstart', function (e) {
  // ... existing swipe handling ...
  wallBreakerTimer = setTimeout(function () {
    activateWallBreaker();
    wallBreakerTimer = null;
  }, 500);
});

canvas.addEventListener('touchmove', function () {
  clearTimeout(wallBreakerTimer); // cancel if moving
});

canvas.addEventListener('touchend', function () {
  clearTimeout(wallBreakerTimer);
});
```

- `touchmove` cancels the long-press (user was swiping, not holding)
- Only activates if game is running and in Enhanced mode

### 5. `touch-action: none` on game area

```css
#game {
  touch-action: none; /* disable browser zoom/pan on canvas */
}
#gameUI {
  touch-action: manipulation; /* allow button taps */
}
```

### 6. PWA support

Minimal setup:

- **`manifest.json`** — app name, icons, theme color, display mode (`standalone`)
- **Service Worker** — cache the three assets (`index.html`, `game.js`, `highscore.js`) for offline play
- Link manifest from `<head>`
- Register service worker from `index.html`

```json
{
  "name": "Rewind Snake",
  "short_name": "Snake",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### 7. Replay canvas responsive sizing

In `showReplayOverlay`, compute tile size from available space:

```js
var maxW = Math.min(600, window.innerWidth * 0.9);
var tileSize = Math.floor(maxW / 25);
canvas.width = tileSize * 25;
canvas.height = tileSize * 25;
// ... then use tileSize instead of TILE constant in rendering
```

## Implementation Checklist

### Phase 1: Layout fixes
- [ ] Fix `body` / `#welcome` overflow so welcome page scrolls on short screens
- [ ] Add `touch-action: none` to canvas and `manipulation` to game UI area
- [ ] Fix `#powerup-flash` top position for small screens (use relative or `top: 4vh`)
- [ ] Reduce countdown font-size on narrow screens (use `@media` or JS)

### Phase 2: Responsive canvas
- [ ] Replace hardcoded `canvas.width = COLS * TILE` with dynamic sizing in `game.js`
- [ ] Replace hardcoded replay canvas sizing in `highscore.js`
- [ ] Make rendering use the dynamic tile size (all `x * TILE` → `x * tileSize`)
- [ ] Handle `window.resize` to recompute tile size (debounced)

### Phase 3: Touch controls
- [ ] Implement swipe detection on canvas for direction change
- [ ] Implement long-tap detection for Wall Breaker (Enhanced mode only)
- [ ] Prevent page scroll during touch on canvas (`touch-action: none` + `preventDefault`)
- [ ] Ensure swipe doesn't trigger accidental direction changes (threshold + dead zone)

### Phase 4: PWA
- [ ] Create `manifest.json` with name, icons, colors, display mode
- [ ] Create `sw.js` service worker caching the three JS/HTML files
- [ ] Register SW and link manifest from `index.html`
- [ ] Generate simple 192×192 and 512×512 PNG icons (or use emoji as icons)

### Phase 5: Testing
- [ ] Test on iPhone (Safari) — check viewport, scroll, touch controls
- [ ] Test on Android (Chrome) — check viewport, scroll, touch controls
- [ ] Test install-as-app flow (Add to Home Screen)
- [ ] Test offline play (service worker caching)
- [ ] Test replay canvas sizing on narrow screens
