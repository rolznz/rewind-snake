# Plan: Enhanced Mode — Apples, Oranges & Temporary Walls

## Changes Overview

Two files: `index.html` (minor CSS additions) and `game.js` (major logic changes).

---

## File: `index.html`

### CSS additions (~15 lines)
```css
/* Power-up indicator flash */
#powerup-flash {
  position: fixed; top: 80px; left: 50%; transform: translateX(-50%);
  padding: 8px 20px; border-radius: 8px; font-size: 1.2rem;
  color: #fff; z-index: 300; pointer-events: none;
  opacity: 0; transition: opacity 0.3s;
}
#powerup-flash.show { opacity: 1; }
```

### HTML additions
- Add `<div id="powerup-flash"></div>` below the score display (for brief power-up notifications)

---

## File: `game.js`

### State variables to add
```js
// Food types
const FOOD_APPLE  = 0;  // common, +1 score, +1 segment
const FOOD_ORANGE = 1;  // rare, +10 score, +10 segments (gradual)

// Wall state
let walls = []; // { x1, y1, x2, y2, spawnTime }
const WALL_DURATION_MS = 60000; // 1 minute
let wallSpawnChance = 0.03;     // starts at 3%
let orangeChance = 0.05;        // starts at 5%

// Orange growth — segments added one per frame
let growQueue = 0; // when >0, skip pop() for this many frames

// Flash notification
let flashTimeout;
const $flash = document.getElementById('powerup-flash');
```

### Core logic changes

#### 1. Food rendering in `draw()`
```js
function drawFood() {
  // Draw apple (red circle) or orange (orange circle with green stem)
  if (food.type === FOOD_ORANGE) {
    ctx.fillStyle = '#f5a623';  // orange
    ctx.beginPath();
    ctx.arc(food.x * TILE + TILE/2, food.y * TILE + TILE/2, TILE/2 - 2, 0, Math.PI*2);
    ctx.fill();
    // Small green stem
    ctx.fillStyle = '#4ecca3';
    ctx.fillRect(food.x * TILE + TILE/2 - 1, food.y * TILE + 3, 2, 5);
  } else {
    ctx.fillStyle = '#e94560';  // red
    ctx.beginPath();
    ctx.arc(food.x * TILE + TILE/2, food.y * TILE + TILE/2, TILE/2 - 2, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowColor = '#e94560';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
```

#### 2. Wall rendering in `draw()`
- For each active wall, draw two dark brick-like rectangles
- Pulse slightly based on time since spawn (faint glow)
- Add a subtle timer indicator (small line or color shift)

#### 3. Collision detection in `update()`
- After moving head, check:
  - Wall bounds (unchanged)
  - Self-collision (unchanged)
  - **Wall segment collision** — check if head position overlaps any wall segment
    - `walls.forEach(wall => { if (head.x >= wall.x1 && head.x <= wall.x2 && ...) return wallHit(); })`
    - Walls are 2-segment lines (horizontal or vertical, randomly oriented)

#### 4. Food spawning — weighted by score
```js
function getOrangeChance(score) {
  return Math.min(0.40, 0.05 + score * 0.015); // 5% → 40% over 25 points
}
function getWallSpawnChance(score) {
  return Math.min(0.20, 0.03 + score * 0.006); // 3% → 20% over 25 points
}
```

#### 5. Orange growth mechanic
When orange is eaten:
- `score += 10`
- `growQueue += 10` (10 extra frames where tail is not popped)
- Snake visually grows one segment per frame for 10 frames, no "jump"

In `update()`:
```js
if (growQueue > 0) {
  growQueue--;
  // skip pop() — tail stays, body extends
} else {
  snake.pop(); // normal shrink
}
```

`placeFood()` flow:
1. Always ensure one food item exists on a free cell
2. If food is placed (not just re-rolled), check wall expiry (remove old walls)
3. When food eaten (in `update()`), after scoring:
   - Roll `wallSpawnChance` — if success, spawn a wall
   - Roll `orangeChance` — if success, spawn orange; else spawn apple

#### 6. Wall spawning with safety zone
Walls **cannot** spawn within a 6×6 area of the snake head. Prevents instant-death spawns.

```js
function spawnWall() {
  const head = snake[0];
  const attempts = 100;
  for (let i = 0; i < attempts; i++) {
    const orientation = Math.random() < 0.5 ? 'h' : 'v';
    const x1 = Math.floor(Math.random() * (COLS - (orientation === 'h' ? 1 : 0)));
    const y1 = Math.floor(Math.random() * (ROWS - (orientation === 'v' ? 1 : 0)));
    const x2 = orientation === 'h' ? x1 + 1 : x1;
    const y2 = orientation === 'v' ? y1 + 1 : y1;
    // Safety zone: 6×6 area around snake head
    if (Math.abs(x1 - head.x) > 6 && Math.abs(y1 - head.y) > 6) {
      if (!isOccupied(x1, y1) && !isOccupied(x2, y2)) {
        walls.push({ x1, y1, x2, y2, spawnTime: Date.now() });
        showFlash('⚠️ Wall appeared!', '#f5a623');
        return;
      }
    }
  }
}
```

#### 7. Wall expiry
In `update()`, before movement:
```js
const now = Date.now();
walls = walls.filter(w => now - w.spawnTime < WALL_DURATION_MS);
```

#### 8. Score display
Change `#score` text to show mode tag:
```
Score: 12  |  Enhanced
```

---

### `update()` flow summary (Enhanced mode)

```
1. Check wall expirations → filter out old walls
2. Move snake
3. Check wall bounds (unchanged)
4. Check self-collision (unchanged)
5. Check wall segment collision (NEW) → if hit, game over
6. If food eaten:
   a. score += food.type === FOOD_ORANGE ? 10 : 1
   b. Update score display (with mode tag)
   c. Flash notification (🍎 Apple or 🍊 Orange +10)
   d. If orange: growQueue += 10 (adds 1 segment per frame)
   e. Roll for wall spawn → spawnWall() if roll succeeds
   f. Roll for orange chance → spawn orange or apple
7. If growQueue > 0: growQueue-- (skip pop, body extends)
   Else: snake.pop()
8. Draw everything
```

---

### Edge cases to handle

1. **Wall on food** — when spawning walls, exclude food position
2. **Wall on snake** — exclude snake positions
3. **No valid wall position** — after 100 attempts, abort (grid too full)
4. **No valid food position** — existing logic already handles via `do-while` loop
5. **Flash overlapping notifications** — use `clearTimeout` on existing flash before showing new one
6. **Game over with active walls** — walls persist, reset on restart
7. **Undo/rewind with walls** — add `walls` to history snapshots

### History snapshots (for rewind)
```js
function saveState() {
  history.push({
    snake: snake.map(s => ({ ...s })),
    food: { ...food },
    walls: walls.map(w => ({ ...w })), // deep-copy walls
  });
}
```

When restoring:
```js
function resumeGame(n) {
  // ... existing restore logic ...
  walls = prevState.walls.map(w => ({ ...w })); // restore walls too
}
```

---

## Implementation order

| Step | Task | Difficulty |
|------|------|-----------|
| 1 | Add state variables + flash div | Easy |
| 2 | Add `FOOD_APPLE`/`FOOD_ORANGE` constants + food rendering | Easy |
| 3 | Update `placeFood()` with weighted spawn logic | Medium |
| 4 | Add `spawnWall()` + `isOccupied()` helper | Medium |
| 5 | Add wall rendering + expiry logic | Medium |
| 6 | Add wall collision detection in `update()` | Medium |
| 7 | Add history snapshots for walls (for rewind) | Easy |
| 8 | Add difficulty scaling + score display tag | Easy |
| 9 | Add orange growth mechanic (growQueue) | Medium |
| 10 | Polish: flash notifications, wall pulse animation | Medium |

---

## Scope

- **Enhanced mode only** — no mode selector, no other food types, no speed scaling
- Apples are the default (🔴), oranges are rare (🟠)
- Probability scales linearly with score: 5%→40% for oranges, 3%→20% for walls
- **Oranges give +10 score** — 10 new segments added one per frame (no jump)
- Walls are 2-segment lines, randomly oriented, lasting 1 minute
- **Wall safety zone**: walls cannot spawn within 6×6 area of snake head
- Walls cause game over on collision (same as current wall collision)
- Rewind/undo also restores wall state from snapshots

---

**Total added lines:** ~150-200 lines in `game.js`, ~20 in `index.html`

**What stays the same:**
- Input handling
- Snake movement
- Payment/rewind flow
- Game loop structure
