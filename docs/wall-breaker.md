# 🔥 Wall Breaker — Feature Plan

> **Status:** Planned
> **Mode:** Enhanced only
> **Trigger:** Press `X` during gameplay

---

## Concept

In **Enhanced Mode**, the player can activate **Wall Breaker** — a temporary power-up that lets the snake smash through walls for a brief moment. Activating costs **length and score**, and the effect lasts only **1 second** (~10 game steps).

Visual feedback: the snake glows **fiery orange/red** with a pulsing flame aura while the ability is active.

---

## Gameplay Flow

```
Player presses X during gameplay
  ↓
Is enhanced mode active?     → No: show toast "Wall Breaker only in Enhanced Mode"
  ↓ Yes
Does player have ≥ 5 segments?  → No: show toast "Need at least 5 segments"
  ↓ Yes
Is Wall Breaker already active? → Yes: show toast "Already active!"
  ↓ No
Activate Wall Breaker:
  - Deduct 3 segments (tail end of snake)
  - Deduct 15 points
  - Start 1-second timer (1000ms)
  - Change snake colors (see Visuals)
  - Start flame animation loop
  - Show toast: "🔥 Wall Breaker! 1s"
  ↓
During the 1-second window:
  - Snake can pass through walls (collision disabled)
  - Walls the snake passes through explode (see below)
  - Snake retains fiery colors + flame animation
  ↓
Timer expires:
  - Flame animation fades out
  - Snake colors revert
  - Toast: "Wall Breaker depleted"
```

---

## Activation Cost

| Resource | Cost | Rationale |
|----------|------|-----------|
| Snake length | **-3 segments** | Must have at least 5 segments to activate (leaves player with 2 minimum) |
| Score | **-15 points** | Prevents spam; must have meaningful score to justify |

> **Guardrails:** Cost scales with difficulty — consider increasing to -4 segments / -20 score when score > 100.

---

## Visual Effects

### Snake Color Changes

| State | Head | Body |
|-------|------|------|
| **Idle** (default) | `#2eb84e` (green) | Gradient green `rgb(30, g, 100)` |
| **Active** | `#ff4500` (orange-red) | Gradient fiery `rgb(255, g, 20)` with pulsing `g` |
| **Cooldown/Expired** | Flash white for 100ms, then revert | Flash white for 100ms, then revert |

### Flame Particle Animation

- **Emission:** 2-3 particles per frame from the snake's tail
- **Appearance:** Small circles (3-5px) in shades of orange/yellow/red
- **Behavior:** Drift downward + slight random X drift, fade out over ~400ms
- **Particle pool:** Pre-allocate array (max ~60 particles on-screen at once)
- **Rendering:** Drawn on top of the snake, semi-transparent

```javascript
// Particle object
{
  x: number,    // tail position
  y: number,
  vx: number,   // horizontal drift (-0.5 to 0.5)
  vy: number,   // upward drift (-0.5 to -1.5)
  life: number, // 0 to 1 (fade)
  size: number, // 3 to 5
  color: string // #ff6600, #ffaa00, or #ff2200
}
```

### Wall Explosion Effect

When the snake (during Wall Breaker) passes through a wall segment:

1. **Immediate:** Remove the wall segment from `walls` array
2. **Visual:** 5-8 sparks fly outward from the hit segment in all directions
3. **Spark animation:** Small bright yellow/white particles that fade over ~300ms
4. **Sound (optional):** Could add a "crack" sound later — not in v1

---

## State Machine

```
┌──────────────────────────────────────┐
│            IDLE (default)             │
│  - Normal snake colors                │
│  - No flame particles                 │
│  - Wall collision kills snake         │
│                                       │
│  Press X → Activate                   │
├──────────────────────────────────────┤
│         ACTIVE (1 second)             │
│  - Fiery colors + pulsing             │
│  - Flame particles from tail          │
│  - Can pass through walls             │
│  - Walls explode on contact           │
│  - Spark particles on explosion       │
│                                       │
│  Timer expires → Deactivate           │
├──────────────────────────────────────┤
│        DEACTIVATING (0.1s flash)      │
│  - White flash on snake               │
│  - Colors revert to normal            │
│  - No more flame/sparks               │
│  - Wall collision kills again         │
│                                       │
│  Flash ends → IDLE                    │
└──────────────────────────────────────┘
```

---

## Implementation Plan

### Files to Modify

| File | Changes |
|------|---------|
| `game.js` | New state vars, collision logic, drawing, timer, particle system |
| `index.html` | Minimal — CSS for flame/spark particles already handled by canvas |

### New State Variables

```javascript
// Wall Breaker state
let wallBreakerActive = false;    // is currently active?
let wallBreakerTimer = 0;         // ms remaining
let wallBreakerCooldown = false;  // just deactivated, during white flash
const WALL_BREAKER_DURATION = 1000;  // 1 second
const WALL_BREAKER_COOLDOWN = 100; // 0.1s white flash

// Particles
let wallBreakerFlames = [];  // flame particles from tail
let explosionSparks = [];    // sparks from exploded walls

// Costs
const WALL_BREAKER_SEG_COST = 3;
const WALL_BREAKER_SCORE_COST = 15;
const MIN_SEGMENTS_FOR_BREAKER = 5;
```

### Key Changes

#### 1. `update()` — Collision Logic

```javascript
// Replace existing wall collision check:
if (isEnhanced) {
  for (const w of walls) {
    if ((head.x === w.x1 && head.y === w.y1) || 
        (head.x === w.x2 && head.y === w.y2)) {
      if (wallBreakerActive) {
        // Wall explodes — remove it
        walls = walls.filter(wall => {
          const hit = (head.x === wall.x1 && head.y === wall.y1) ||
                      (head.x === wall.x2 && head.y === wall.y2);
          if (hit) {
            spawnExplosionSparks(w.x1, w.y1);
            spawnExplosionSparks(w.x2, w.y2);
          }
          return !hit;
        });
        // No gameOver — continue moving
      } else {
        return gameOver();
      }
    }
  }
}
```

#### 2. `update()` — Wall Breaker Timer

```javascript
// After the timer check, add:
if (wallBreakerActive) {
  // Count down using game ticks (100ms each)
  wallBreakerTimer -= 100;
  if (wallBreakerTimer <= 0) {
    deactivateWallBreaker();
  }
}
```

#### 3. `update()` — Flame Particles

```javascript
// Emit particles from tail every few frames during active state
if (wallBreakerActive && Math.random() < 0.6) {
  const tail = snake[snake.length - 1];
  wallBreakerFlames.push({
    x: tail.x * TILE + TILE / 2,
    y: tail.y * TILE + TILE / 2,
    vx: (Math.random() - 0.5) * 1.5,
    vy: -(Math.random() * 1.5 + 0.5),
    life: 1,
    size: Math.random() * 3 + 3,
    color: ['#ff6600', '#ffaa00', '#ff2200'][Math.floor(Math.random() * 3)]
  });
}
```

#### 4. `draw()` — Fiery Snake

```javascript
function getSnakeColor(isHead, ratio) {
  if (wallBreakerActive) {
    const pulse = Math.sin(Date.now() / 150) * 40 + 180; // pulsing green channel
    const base = isHead ? { r: 255, g: pulse + 40, b: 0 }
                        : { r: 255, g: Math.round(pulse), b: 20 };
    return `rgb(${base.r}, ${base.g}, ${base.b})`;
  }
  // ... existing gradient logic
}
```

#### 5. `draw()` — Draw Particles

```javascript
function drawParticles() {
  // Flame particles (from tail)
  for (const p of wallBreakerFlames) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  // Explosion sparks
  for (const s of explosionSparks) {
    ctx.globalAlpha = s.life;
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}
```

#### 6. Keyboard Handler

```javascript
document.addEventListener('keydown', e => {
  // ... existing code ...
  if (e.key.toLowerCase() === 'x' && alive && isEnhanced && !$popup.classList.contains('show')) {
    activateWallBreaker();
  }
});
```

#### 7. Helper Functions

```javascript
function activateWallBreaker() {
  if (wallBreakerActive || wallBreakerCooldown) {
    showToast('Wall Breaker ' + (wallBreakerActive ? 'already active!' : 'on cooldown!'));
    return;
  }
  if (snake.length < MIN_SEGMENTS_FOR_BREAKER) {
    showToast('Need at least ' + MIN_SEGMENTS_FOR_BREAKER + ' segments');
    return;
  }
  if (score < WALL_BREAKER_SCORE_COST) {
    showToast('Need at least ' + WALL_BREAKER_SCORE_COST + ' points');
    return;
  }

  // Deduct cost
  for (let i = 0; i < WALL_BREAKER_SEG_COST; i++) {
    snake.pop();
  }
  score -= WALL_BREAKER_SCORE_COST;
  $score.textContent = 'Score: ' + score + '  |  Enhanced';

  // Activate
  wallBreakerActive = true;
  wallBreakerTimer = WALL_BREAKER_DURATION;
  wallBreakerFlames = [];
  showToast('🔥 Wall Breaker! 1s');
}

function deactivateWallBreaker() {
  wallBreakerActive = false;
  wallBreakerCooldown = true;
  wallBreakerFlames = [];

  // White flash
  $msg.textContent = 'Wall Breaker depleted';
  $msg.style.color = '#fff';
  $flash.textContent = '💥 Wall Breaker depleted';
  $flash.style.backgroundColor = '#ff4500';
  $flash.classList.add('show');
  setTimeout(() => {
    $msg.style.color = '';
    wallBreakerCooldown = false;
  }, WALL_BREAKER_COOLDOWN);
}

function spawnExplosionSparks(cx, cy) {
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    explosionSparks.push({
      x: cx * TILE + TILE / 2,
      y: cy * TILE + TILE / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: Math.random() * 3 + 1,
      color: ['#ffff00', '#ffaa00', '#ffffff'][Math.floor(Math.random() * 3)]
    });
  }
}

function updateParticles() {
  // Flame particles
  wallBreakerFlames = wallBreakerFlames.map(p => ({
    ...p,
    x: p.x + p.vx,
    y: p.y + p.vy,
    life: p.life - 0.03,
    size: p.size * 0.97
  })).filter(p => p.life > 0);

  // Explosion sparks
  explosionSparks = explosionSparks.map(s => ({
    ...s,
    x: s.x + s.vx,
    y: s.y + s.vy,
    vx: s.vx * 0.9,
    vy: s.vy * 0.9,
    life: s.life - 0.04
  })).filter(s => s.life > 0);
}
```

### Integration Points

| Location | Change |
|----------|--------|
| `startGame()` | Reset `wallBreakerActive`, `wallBreakerTimer`, `wallBreakerFlames`, `explosionSparks` |
| `update()` | Call `updateParticles()`, run wall breaker timer, handle wall explosion |
| `draw()` | Call `drawParticles()` after drawing snake, use fiery colors when active |
| `gameOver()` | Reset all wall breaker state |
| `resumeGame()` (undo rewind) | Reset all wall breaker state |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Activate with < 5 segments | Show toast, don't activate |
| Activate with < 15 score | Show toast, don't activate |
| Press X while already active | Show toast "Already active!", no double activation |
| Press X while in cooldown (white flash) | Show toast "On cooldown!", no reactivation |
| Wall Breaker ends during wall collision | Timer expires → deactivate → next frame kills snake normally |
| Player eats food during Wall Breaker | Food eaten normally; score added after Wall Breaker cost deducted |
| Walls spawn during Wall Breaker | Normal wall spawn; snake can pass through newly spawned walls too |
| Game over during Wall Breaker | State resets; no special behavior — death is death |
| Undo rewind while Wall Breaker active | Reset all wall breaker state (clean slate from restored state) |

---

## Optional Enhancements (Future)

| Idea | Priority | Notes |
|------|----------|-------|
| **Charge system** | Medium | Earn charges by eating oranges; X uses one charge instead of costing length |
| **Longer duration** | Low | 1s is short; could scale with score (e.g., 1s + 0.05s per 10 points) |
| **Sound effects** | Low | Explosion "crack", activation "whoosh" — add Web Audio API |
| **Screen shake** | Medium | Slight canvas transform shake when wall breaks |
| **Cooldown timer** | Low | 5-second cooldown after use instead of instant reset |
| **Charge indicator** | Medium | Show remaining charges in score line (e.g., "Score: 50 | 🔥×2 | Enhanced") |
| **Combo multiplier** | Low | Break 3+ walls in one activation = bonus score |
| **Boss walls** | Medium | Special walls that take multiple hits to break (requires 2 activations) |

---

## Testing Checklist

- [ ] Press X in normal mode → toast message, no effect
- [ ] Press X with < 5 segments → toast message, no effect
- [ ] Press X with < 15 score → toast message, no effect
- [ ] Press X while active → toast message, no double activation
- [ ] Press X while in cooldown → toast message, no reactivation
- [ ] Activate → snake turns fiery colors immediately
- [ ] Flame particles emit from tail during active period
- [ ] Snake passes through walls without dying
- [ ] Walls explode (segments removed, sparks emitted) when snake passes through
- [ ] After 1 second, colors revert (white flash transition)
- [ ] Score decreases by 15, 3 segments removed
- [ ] Snake can still eat food and grow during Wall Breaker
- [ ] Game over still works if snake hits self (not walls) during Wall Breaker
- [ ] Game over still works if snake hits boundaries during Wall Breaker
- [ ] Undo rewind resets Wall Breaker state
- [ ] Restart game resets all state
- [ ] UI stays clean — particles don't block food or snake
