# High Score Replays — Design Plan

> **Goal:** Let any user watch a step-by-step replay of a saved high score entry, reproducing the exact gameplay (including Wall Breaker activations, oranges eaten, walls spawned, and eventual game-over).

## Overview

When a player saves a high score, the full game state history (last 100 states) is stored in the database alongside the score entry. Any user can then open the leaderboard, click a ▶ replay button on any score row, and watch an animated playback that replays the game at the same speed (10 fps, 100 ms per frame).

## 1. Database Changes

### Schema

Add one column to the existing `high_scores` table:

```sql
ALTER TABLE high_scores
  ADD COLUMN state_history TEXT;  -- NULL or JSON array of state snapshots
```

Each snapshot is a JSON object:

```json
{
  "snake": [
    {"x": 6, "y": 12},
    {"x": 7, "y": 12},
    {"x": 8, "y": 12}
  ],
  "food": {"x": 10, "y": 5, "type": 0},
  "walls": [
    {"x1": 12, "y1": 8, "x2": 13, "y2": 8}
  ],
  "wallBreakerActive": false,
  "wallBreakerTimer": 0
}
```

**Per-entry size estimate:** ~50–60 KB for 100 steps (average snake ~50 segments). The entire leaderboard (20 scores) is ~1.2 MB. Trivial for SQLite.

> **Scaling note:** If the cap is increased to 500, expect ~250–300 KB per entry. At 1000 steps it could reach ~500 KB. The TEXT column supports up to 1 GB in SQLite, so there's no hard DB limit. If storage grows, compression (gzip) can be added later.

### Why `state_history` is stored raw (not delta-encoded)

- Simplicity: one JSON array, one column, no custom encoding
- Replays need exact frames; delta encoding complicates replay logic
- No compression needed yet (can add gzip later if storage becomes an issue)

### Hardcoded 100 limit — how to make it configurable later

The number `100` appears in three places. Each should be a named constant so it can be changed in one place:

| Place | What it controls | Configurable? |
|-------|------------------|---------------|
| `game.js`: `saveState()` | How many steps are kept in live game memory (for rewind + replay) | Yes — rename to `MAX_HISTORY = 100` |
| `game.js`: `saveState()` trim | Same as above | Yes — same constant |
| `server.js` validation | Max `stateHistory` array size accepted by API | Yes — rename to `MAX_STATE_HISTORY = 100` |

**Recommendation:** Define the constant in `game.js` as `const MAX_HISTORY = 100;` (used for both live rewind and replay capture). The API validation can mirror this value. To increase the cap later, just bump `MAX_HISTORY` and update the API constant. No schema change needed.

### Why store `wallBreakerActive` and `wallBreakerTimer`

The replay must match the original gameplay exactly. Wall Breaker changes:
- Snake length (segments deducted on activation, added back on deactivation)
- Snake body colors (pulsing orange/red)
- Flame particles from the tail
- Wall destruction (when crossing walls)

Storing these two fields per state snapshot lets the replay engine know the exact visual/behavioral state at each frame.

---

## 2. Backend Changes

### 2.1 `backend/database.js`

**`saveScore`** — Accept an optional `stateHistory` parameter:

```js
function saveScore({ name, score, steps, mode, createdAt, ipHash, stateHistory }) {
  // ... existing INSERT logic ...
  // stateHistory is already JSON-stringified by the caller
  const stmt = db.prepare(`
    INSERT INTO high_scores (name, score, steps, mode, state_history, created_at, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  // stateHistory can be NULL
  stmt.run(name, score, steps, mode, stateHistory || null, createdAt, ipHash);
}
```

**`getScoresByMode`** — Return `state_history` in each row (already available via `SELECT *`):

```js
function getScoresByMode(mode, limit = 20) {
  const stmt = db.prepare(
    'SELECT id, name, score, steps, mode, state_history, created_at ' +
    'FROM high_scores WHERE mode = ? ORDER BY score DESC, steps ASC LIMIT ?'
  );
  return stmt.all(mode, limit);
}
```

No separate replay endpoint needed — the existing `GET /api/scores` already returns all fields, and `state_history` will come through automatically.

### 2.2 `backend/server.js`

Add a constant at the top (mirrors `game.js`):
```js
const MAX_STATE_HISTORY = 100;  // keep in sync with game.js MAX_HISTORY
```

**POST /api/scores** — Accept optional `stateHistory` in the request body:

```js
app.post('/api/scores', scoreLimiter, (req, res) => {
  const { name, score, steps, mode, stateHistory } = req.body;

  // ... existing validation ...

  // Validate stateHistory if provided
  if (stateHistory !== undefined && stateHistory !== null) {
    if (!Array.isArray(stateHistory) || stateHistory.length < 1 || stateHistory.length > MAX_STATE_HISTORY) {
      return res.status(400).json({
        error: `stateHistory must be an array of 1-${MAX_STATE_HISTORY} state snapshots.`
      });
    }
  }

  // Save — stateHistory is stored as JSON TEXT
  const entry = saveScore({
    name: playerName,
    score,
    steps,
    mode,
    createdAt,
    ipHash,
    stateHistory: typeof stateHistory === 'string'
      ? stateHistory   // already JSON-stringified
      : JSON.stringify(stateHistory)
  });

  res.status(201).json(entry);
});
```

---

## 3. Frontend Changes

### 3.1 `game.js` — Expose state history + constants

Add a configurable constant at the top (next to `const TILE = 20`):
```js
const MAX_HISTORY = 100;  // max states kept (for rewind + replay capture)
```

Then change the existing `saveState()` trim from `> 100` to `> MAX_HISTORY`.

Expose a global getter for `highscore.js` to use:
```js
// Expose at end of game.js (after all other code):
window._snakeGameState = {
  getHistory: function () { return history; },  // raw state snapshots
  isEnhanced: isEnhanced,
  TILE: TILE,
  COLS: COLS,
  ROWS: ROWS
};
```

> **Note:** We deliberately do NOT extract a shared `draw()` function. The replay overlay re-implements the draw logic directly in `highscore.js` to avoid cross-module coupling. This means `game.js` only exposes state data, not rendering.

### 3.2 `highscore.js` — Capture history on save

**`HS.saveScore`** (in the frontend module) — Append `stateHistory` to the save payload:

```js
HS.saveScore = async function (mode, score, steps, name, stateHistory) {
  if (score < 1) return null;
  var body = {
    mode: mode,
    score: score,
    steps: steps,
    name: (typeof name === 'string' && name.trim().length > 0)
      ? name.trim().slice(0, MAX_NAME_LEN)
      : 'Player'
  };

  if (stateHistory && Array.isArray(stateHistory) && stateHistory.length > 0) {
    // Serialize: convert state objects (with arrays) to compact JSON
    body.stateHistory = JSON.stringify(stateHistory.map(function (s) {
      return {
        snake: s.snake,
        food: s.food,
        walls: s.walls,
        wallBreakerActive: s.wallBreakerActive,
        wallBreakerTimer: s.wallBreakerTimer
      };
    }));
  }

  // ... rest of fetch logic unchanged ...
};
```

**`HS.showGameOverUI`** — Pass the captured history when saving:

```js
HS.showGameOverUI = function (mode, score, steps) {
  var container = document.getElementById('highscoreSave');
  if (!container) return;
  var btn = document.getElementById('saveHighscoreBtn');
  if (!btn) return;

  container.style.display = 'block';
  btn.style.display = 'inline-block';

  btn.onclick = function () {
    // Capture history from the game
    var gameState = window._snakeGameState;
    var stateHistory = gameState ? gameState.getHistory() : [];
    showSaveModal(mode, score, steps, stateHistory);
  };
};
```

### 3.3 `highscore.js` — Replay button in leaderboard

In `renderScoresList()`, add a replay button icon (▶) to each row:

```js
var html = '<ol style="list-style:none;padding:0;">';
scores.forEach(function (s, i) {
  var rank = i + 1;
  var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
  var replayBtn = s.state_history
    ? '<button class="replay-btn" data-id="' + s.id + '" title="Replay this score">▶</button>'
    : '';
  html += '<li style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;' +
    'margin-bottom:6px;border-radius:8px;background:#1a1a2e;">' +
    '<span style="font-weight:bold;color:#e94560;min-width:30px;">' + medal + '</span>' +
    '<span style="flex:1;margin-left:8px;">' + escapeHTML(s.name) + '</span>' +
    '<span style="margin-left:12px;color:#4ecca3;font-weight:bold;">' + s.score + '</span>' +
    '<span style="margin-left:8px;color:#888;font-size:0.85rem;">' + s.steps + ' steps</span>' +
    replayBtn +
    '</li>';
});
html += '</ol>';
listEl.innerHTML = html;

// Attach replay button click handlers
overlay.querySelectorAll('.replay-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var scoreId = parseInt(btn.dataset.id, 10);
    startReplay(scoreId);
  });
});
```

### 3.4 `highscore.js` — Replay viewer modal

Create a new replay modal (`#replayOverlay`) that:

1. **Shows a small canvas** (the existing `#game` canvas, or a dedicated one)
2. **Renders each stored state** at 100 ms intervals (same speed as gameplay)
3. **Uses the existing `draw()` function** from `game.js` to render each frame

```javascript
function startReplay(scoreId) {
  // Find the score entry with state_history in the currently loaded list
  var scores = window._hsCurrentScores; // set by renderScoresList
  var entry = (scores || []).find(function (s) { return s.id === scoreId; });
  if (!entry || !entry.state_history) return;

  closeScoreModal(); // hide leaderboard
  showReplayOverlay(entry);
}

function showReplayOverlay(entry) {
  var overlay = document.createElement('div');
  overlay.id = 'replayOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.9);' +
    'justify-content:center;align-items:center;flex-direction:column;z-index:750;color:#eee;';

  var box = document.createElement('div');
  box.style.cssText = 'text-align:center;padding:20px;max-width:600px;width:95vw;';

  box.innerHTML = '<h2 style="margin-bottom:8px;">🎮 Replay: ' + escapeHTML(entry.name) +
    '</h2>' +
    '<p style="color:#aaa;margin-bottom:12px;">Score: ' + entry.score + ' | ' +
    entry.steps + ' steps | ' + (entry.mode === 'enhanced' ? 'Enhanced' : 'Normal') +
    '</p>' +
    '<canvas id="replayCanvas" style="border:2px solid #0f3460;border-radius:6px;' +
    'background:#16213e;display:block;margin:0 auto;"></canvas>' +
    '<div style="margin-top:12px;display:flex;gap:10px;justify-content:center;">' +
      '<button id="replayClose" style="padding:8px 24px;border:none;border-radius:8px;cursor:pointer;' +
      'background:#0f3460;color:#eee;">Close</button>' +
      '<span id="replayProgress" style="color:#888;font-size:0.9rem;"></span>' +
    '</div>';

  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.style.display = 'flex';

  // Resize canvas to fit
  var canvas = document.getElementById('replayCanvas');
  canvas.width = COLS * TILE; // 500
  canvas.height = ROWS * TILE; // 500
  var ctx = canvas.getContext('2d');

  // Parse state history
  var states = JSON.parse(entry.state_history);
  var total = states.length;
  var idx = 0;

  function renderState(state) {
    // Replicate the game's draw() logic for this state
    // (Or import the draw function — see §3.5 below)
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#1a2744';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * TILE, 0);
      ctx.lineTo(i * TILE, canvas.height);
      ctx.stroke();
    }
    for (var j = 0; j <= ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * TILE);
      ctx.lineTo(canvas.width, j * TILE);
      ctx.stroke();
    }

    // Draw walls
    if (state.walls) {
      for (var w = 0; w < state.walls.length; w++) {
        var wall = state.walls[w];
        var segments = [
          { x: wall.x1, y: wall.y1 },
          { x: wall.x2, y: wall.y2 }
        ];
        for (var s2 = 0; s2 < segments.length; s2++) {
          var seg = segments[s2];
          ctx.fillStyle = 'rgba(145,145,150,0.9)';
          ctx.fillRect(seg.x * TILE + 1, seg.y * TILE + 1, TILE - 2, TILE - 2);
          ctx.strokeStyle = 'rgba(100,100,105,0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(seg.x * TILE + 2, seg.y * TILE + 2, TILE - 4, TILE - 4);
          ctx.strokeStyle = 'rgba(180,180,185,0.55)';
          ctx.lineWidth = 1.5;
          var cx = seg.x * TILE + TILE / 2;
          var cy = seg.y * TILE + TILE / 2;
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 4);
          ctx.lineTo(cx + 4, cy + 4);
          ctx.moveTo(cx + 4, cy - 4);
          ctx.lineTo(cx - 4, cy + 4);
          ctx.stroke();
        }
      }
    }

    // Draw snake
    var snake = state.snake;
    for (var i = 0; i < snake.length; i++) {
      var s = snake[i];
      var ratio = 1 - i / snake.length;
      if (state.wallBreakerActive) {
        var pulse = Math.sin(Date.now() / 150) * 40 + 180;
        if (i === 0) {
          ctx.fillStyle = 'rgb(255,' + Math.round(pulse + 40) + ',0)';
        } else {
          ctx.fillStyle = 'rgb(255,' + Math.round(pulse) + ',20)';
        }
      } else {
        var g = Math.round(180 + 45 * ratio);
        ctx.fillStyle = 'rgb(30,' + g + ',100)';
      }
      ctx.beginPath();
      ctx.roundRect(s.x * TILE + 1, s.y * TILE + 1, TILE - 2, TILE - 2, 4);
      ctx.fill();
    }

    // Draw food
    if (state.food) {
      if (state.food.type === 1) {
        ctx.fillStyle = '#f5a623';
        ctx.beginPath();
        ctx.arc(state.food.x * TILE + TILE / 2, state.food.y * TILE + TILE / 2, TILE / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4ecca3';
        ctx.fillRect(state.food.x * TILE + TILE / 2 - 1, state.food.y * TILE + 3, 2, 5);
      } else {
        ctx.fillStyle = '#e94560';
        ctx.beginPath();
        ctx.arc(state.food.x * TILE + TILE / 2, state.food.y * TILE + TILE / 2, TILE / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = '#e94560';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Update progress
    document.getElementById('replayProgress').textContent =
      idx + ' / ' + total + ' steps';
  }

  // Animation loop
  renderState(states[0]); // initial frame
  idx = 1;
  var interval = setInterval(function () {
    if (idx < total) {
      renderState(states[idx]);
      idx++;
    } else {
      clearInterval(interval);
    }
  }, 100);

  // Close handler
  document.getElementById('replayClose').addEventListener('click', function () {
    clearInterval(interval);
    overlay.style.display = 'none';
    document.body.removeChild(overlay);
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) {
      clearInterval(interval);
      overlay.style.display = 'none';
      document.body.removeChild(overlay);
    }
  });
}
```

### 3.5 Reusing `draw()` — Option A vs Option B

**Option A (simpler, recommended):** Duplicate the draw logic in the replay overlay code. The replay code has its own `<canvas>` and doesn't share DOM with the live game canvas, so no conflict. This avoids any coupling between `game.js` and `highscore.js`.

**Option B (DRY):** In `game.js`, extract `draw(ctx, state)` as a pure function that takes a state object instead of relying on global variables. This is cleaner but requires refactoring the existing `draw()` function.

**Recommendation: Option A.** The draw logic is already compact and duplicated code is ~80 lines. No need to refactor the live game loop for this feature.

---

## 4. Implementation Order

| Step | File | What |
|------|------|------|
| 1 | `backend/database.js` | Add `state_history TEXT` column; update `saveScore` to accept it |
| 2 | `backend/server.js` | Add `MAX_STATE_HISTORY` constant; accept `stateHistory` in POST; pass to `saveScore` |
| 3 | `game.js` | Add `MAX_HISTORY` constant; update `saveState()` to store WB fields + use `MAX_HISTORY` trim; expose `window._snakeGameState` |
| 4 | `highscore.js` | Capture history when saving; include in `saveScore` request |
| 5 | `highscore.js` | Add ▶ replay button to leaderboard rows |
| 6 | `highscore.js` | Build replay overlay modal with canvas rendering |

Total estimated effort: **~200 lines of new code** (mostly replay overlay rendering in highscore.js).

---

## 5. Edge Cases & Notes

- **Empty history** — If a score was saved before this feature (no `state_history`), the ▶ button is hidden. Existing scores remain valid.
- **Large state_history** — The JSON text is stored directly in SQLite. No size limit beyond SQLite's 1 GB TEXT limit (irrelevant for ~60 KB).
- **Concurrent saves** — SQLite WAL mode handles concurrent inserts safely.
- **Backward compatibility** — `state_history` is NULL for old scores. The API treats it as optional everywhere.
- **Performance** — Replays run at 10 fps (100 ms/frame), same as the live game. No need for interpolation or acceleration (can add a 2× speed toggle later).
- **Explosion sparks & flame particles** — Not stored (they're visual-only effects). The replay will show the snake, food, walls, and Wall Breaker state (colors, length, timer) but not the fire/spark particles. This is intentional — particles are ephemeral and not part of game state.
- **History shorter than `steps`** — If the snake dies after 500 steps but the live history is capped at `MAX_HISTORY = 100`, the saved entry will have `steps: 500` but only 100 states. The replay will cover the **last MAX_HISTORY steps** of the game. This is acceptable: the most interesting part of the replay is near the game end (where mistakes happen).
- **Increasing the cap later** — As described above, just bump `MAX_HISTORY` in `game.js` and `MAX_STATE_HISTORY` in `server.js`. No DB migration needed. Existing entries remain unaffected. If you increase it to 500, expect ~5× the storage per entry. Consider adding compression if this becomes a concern.
