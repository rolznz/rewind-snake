# High Score Replays — Implementation Checklist

> Follow this checklist sequentially. Tick off each task before moving to the next.
> Based on: `docs/high-score-replays.md`

---

## Step 1 — Database: Add `state_history` column

- [x] ~~Add `state_history TEXT` column to `high_scores` table~~ ✅
- [x] ~~Update `saveScore()` to accept `stateHistory` parameter~~ ✅
- [x] ~~Update `getScoresByMode()` to return `state_history` column~~ ✅
- [x] ~~Update `getAllScores()` to include `state_history`~~ ✅

**File:** `backend/database.js`

---

## Step 2 — Backend API: Accept & validate `stateHistory`

- [x] ~~Add `MAX_STATE_HISTORY = 100` constant to `backend/server.js`~~ ✅
- [x] ~~Parse optional `stateHistory` from POST /api/scores request body~~ ✅
- [x] ~~Validate: must be array of 1–100 state snapshots~~ ✅
- [x] ~~Pass `stateHistory` (JSON string) to `saveScore()`~~ ✅
- [x] ~~Include `state_history` in the 201 response JSON~~ ✅

**File:** `backend/server.js`

---

## Step 3 — Game: Expose state history + constants

- [x] ~~Add `const MAX_HISTORY = 100` in `game.js`~~ ✅
- [x] ~~Change `saveState()` trim from `> 100` to `> MAX_HISTORY`~~ ✅
- [x] ~~Store `wallBreakerActive` and `wallBreakerTimer` in `saveState()`~~ ✅
- [x] ~~Expose `window._snakeGameState` with `getHistory()`, `isEnhanced`, `TILE`, `COLS`, `ROWS`~~ ✅

**File:** `game.js`

---

## Step 4 — Frontend: Capture history when saving

- [x] ~~Update `HS.saveScore()` to accept optional `stateHistory` parameter~~ ✅
- [x] ~~Serialize state snapshots (snake, food, walls, wallBreakerActive, wallBreakerTimer)~~ ✅
- [x] ~~Pass `stateHistory` JSON string in save request body~~ ✅
- [x] ~~Update `HS.showGameOverUI()` to capture history from `window._snakeGameState`~~ ✅
- [x] ~~Pass captured history to save modal~~ ✅

**File:** `highscore.js`

---

## Step 5 — Leaderboard: Add ▶ replay buttons

- [x] ~~Add replay button (▶) to each leaderboard row that has `state_history`~~ ✅
- [x] ~~Attach click handler to open replay modal~~ ✅
- [x] ~~Hide replay button for scores without `state_history` (backward compatible)~~ ✅

**File:** `highscore.js`

---

## Step 6 — Replay: Build replay overlay modal

- [x] ~~Create replay overlay modal (`#replayOverlay`) with canvas~~ ✅
- [x] ~~Parse `state_history` JSON from score entry~~ ✅
- [x] ~~Render each state snapshot at 100ms intervals (10 fps)~~ ✅
- [x] ~~Replicate draw logic: background, grid, walls, snake, food~~ ✅
- [x] ~~Handle Wall Breaker colors (pulsing orange/red)~~ ✅
- [x] ~~Show progress counter (step N / total)~~ ✅
- [x] ~~Add close button + overlay click-to-close~~ ✅
- [x] ~~Clear interval on close~~ ✅

**File:** `highscore.js`

---

## Verification

- [x] ~~Backend starts without errors (`node backend/server.js`)~~ ✅ — tested, runs clean
- [x] ~~Save a score — check API response includes `state_history`~~ ✅ — POST returns `state_history` field
- [ ] Load leaderboard — see ▶ button on replay-enabled entries
- [ ] Click ▶ — replay plays smoothly at 10 fps
- [ ] Click Close — overlay closes, interval stops
- [ ] Existing scores (without `state_history`) show no ▶ button
- [ ] Game still plays normally, rewind still works

**Validation tests passed:**
- Empty `stateHistory: []` → 400 "must be 1-100"
- 101 entries → 400 "must be 1-100"
- No `stateHistory` → 201 with `state_history: null`
- Valid `stateHistory` → 201 with `state_history` JSON string
- `getAllScores()` returns `state_history` in all mode objects

---

## Notes

- Replication of `draw()` in replay is **Option A** (duplicated code, ~80 lines) — no coupling
- Particles are intentionally **not** stored in replays (ephemeral visual effects)
- If game over occurs after 500 steps, only the last `MAX_HISTORY` (100) states are captured
- `state_history` is NULL for scores saved before this feature — fully backward compatible
