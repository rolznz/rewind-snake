# Rewind Snake — Backend Plan

> **Goal**: Replace localStorage high scores with a shared cloud backend, deployed on fly.io at `https://rewind-snake.fly.dev`.

---

## 1. Architecture Overview

```
┌──────────────────┐         ┌─────────────────────────┐         ┌───────────────┐
│   Browser        │         │   Backend (fly.io)       │         │   Database    │
│   (index.html)   │ ──────► │   Node.js + Express      │ ──────► │   SQLite      │
│                  │ ◄────── │                         │ ◄────── │   (Fly VPS)   │
│  - Save scores   │         │  - POST /api/scores      │         │               │
│  - Fetch scores  │         │  - GET /api/scores       │         │  high_scores  │
└──────────────────┘         └─────────────────────────┘         └───────────────┘
```

- **Single-fly-app deployment** with SQLite (`better-sqlite3`) — simplest path, no extra fly.io add-ons needed
- **CORS** enabled for `https://rewind-snake.fly.dev`
- **No auth** — anonymous scores; rate-limited to prevent abuse
- **Zero dependencies** for the frontend — pure `fetch()` API, no libraries

---

## 2. Database Schema

### Table: `high_scores`

| Column     | Type        | Description                         | Index      |
|-----------|-------------|-------------------------------------|------------|
| `id`      | INTEGER     | Primary key, AUTOINCREMENT          | PK         |
| `name`    | TEXT        | Player name, trimmed to 20 chars    |            |
| `score`   | INTEGER     | Game score (snake length)           |            |
| `steps`   | INTEGER     | Steps taken in the game             |            |
| `mode`    | TEXT        | `'normal'` or `'enhanced'`          |            |
| `created_at` | INTEGER  | Unix timestamp (milliseconds)       |            |
| `ip_hash` | TEXT        | SHA-256 of client IP (anti-cheat)   |            |

### Indexes

```sql
CREATE INDEX idx_mode_score ON high_scores (mode, score DESC, steps ASC);
CREATE INDEX idx_ip_mode ON high_scores (ip_hash, mode);  -- for rate limiting
```

---

## 3. API Endpoints

### 3.1 `POST /api/scores` — Save a high score

```
POST /api/scores
Content-Type: application/json

Request body:
{
  "name": "Player",        // optional, defaults to "Player"
  "score": 42,             // required, integer > 0
  "steps": 150,            // required, integer > 0
  "mode": "normal"         // required, "normal" | "enhanced"
}

Response (201 Created):
{
  "id": 1,
  "name": "Player",
  "score": 42,
  "steps": 150,
  "mode": "normal",
  "createdAt": 1748100000000
}

Response (400 Bad Request):
{ "error": "Invalid mode. Must be 'normal' or 'enhanced'." }
{ "error": "Score must be a positive integer." }
{ "error": "Steps must be a positive integer." }
{ "error": "Name must be a string (max 20 characters)." }
{ "error": "Rate limit exceeded. Wait a moment and try again." }
```

**Validation rules:**
- `mode`: must be exactly `"normal"` or `"enhanced"`
- `score`: must be a positive integer (≥ 1)
- `steps`: must be a positive integer (≥ 1)
- `name`: optional string, trimmed, max 20 chars; defaults to `"Player"` if empty/missing
- **Rate limit**: max 5 score submissions per IP per minute

---

### 3.2 `GET /api/scores` — List high scores

```
GET /api/scores?mode=normal&limit=20
GET /api/scores?mode=enhanced&limit=20
GET /api/scores                    (returns both modes, top 20 each)

Query parameters:
  mode   — optional: "normal" | "enhanced". Omit or use "all" to return both modes.
  limit  — optional: integer 1–50 (default: 20, max: 50)

Response (200 OK):
{
  "normal": [
    { "id": 1, "name": "Player", "score": 42, "steps": 150, "mode": "normal", "createdAt": 1748100000000 },
    { "id": 2, "name": "SnakeMaster", "score": 38, "steps": 200, "mode": "normal", "createdAt": 1748099000000 }
  ],
  "enhanced": [
    { "id": 3, "name": "WallCrusher", "score": 55, "steps": 100, "mode": "enhanced", "createdAt": 1748101000000 }
  ]
}

Response (400 Bad Request):
{ "error": "Invalid mode. Must be 'normal', 'enhanced', or 'all'." }
{ "error": "Limit must be between 1 and 50." }
```

**Sorting**: score DESC, then steps ASC (same as current localStorage behavior).

---

### 3.3 Health check

```
GET /health
Response (200 OK): { "status": "ok" }
```

---

## 4. Frontend Changes (highscore.js)

### 4.1 API Client Module

Add a `HS_API` object (or extend `HS`) that wraps all fetch calls:

```js
var API_BASE = 'https://rewind-snake.fly.dev';

var HS_API = {
  /** Save a score. Returns the saved entry on success. */
  saveScore: async function (mode, score, steps, name) {
    var body = {
      mode: mode,
      score: score,
      steps: steps,
      name: (typeof name === 'string' && name.trim().length > 0)
        ? name.trim().slice(0, 20)
        : 'Player'
    };
    var resp = await fetch(API_BASE + '/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      var err = await resp.text();
      throw new Error(err || resp.statusText);
    }
    return resp.json();
  },

  /** Get scores for a mode. Returns { normal: [...], enhanced: [...] } */
  getScores: async function (mode) {
    var url = API_BASE + '/api/scores';
    if (mode) url += '?mode=' + encodeURIComponent(mode);
    var resp = await fetch(url);
    if (!resp.ok) throw new Error(resp.statusText);
    return resp.json();
  },

  /** Get scores for a specific mode only. */
  getModeScores: async function (mode) {
    var url = API_BASE + '/api/scores?mode=' + encodeURIComponent(mode);
    var resp = await fetch(url);
    if (!resp.ok) throw new Error(resp.statusText);
    var data = await resp.json();
    return data[mode] || [];
  }
};
```

### 4.2 Remove localStorage entirely

**Remove from `highscore.js`:**
- `LS_KEY = 'snake-highscores'` variable
- `loadScores()` function
- `saveScores(data)` function
- `HS.clearMode()` — no longer needed (backend doesn't expose a clear endpoint)
- `HS.clearAll()` — no longer needed
- `HS.countScores()` — replaced by checking array length from API
- `HS.hasScores()` — replaced by checking array length from API

**Replace `HS.getAllScores()`** with an async version:

```js
HS.getAllScores = async function (mode) {
  return await HS_API.getModeScores(mode);
};
```

### 4.3 Update save flow (async)

The save modal submit handler becomes async:

```js
box.querySelector('#saveScoreSubmit').addEventListener('click', async function () {
  var nameInput = document.getElementById('saveScoreNameInput');
  var name = nameInput ? nameInput.value.trim() : '';
  try {
    var entry = await HS_API.saveScore(pendingMode, pendingScore, pendingSteps, name);
    showToast('🏆 High score saved! (' + entry.score + ', ' + entry.steps + ' steps)');
  } catch (err) {
    showToast('❌ Failed to save score: ' + err.message);
  }
  closeSaveModal();
});
```

### 4.4 Update leaderboard render (async)

The `renderScoresList()` function becomes async and uses a loading state:

```js
function renderScoresList(mode) {
  var listEl = document.getElementById('scoreList');
  var clearBtn = document.getElementById('clearModeBtn');
  if (!listEl) return;

  if (clearBtn) clearBtn.style.display = 'none';  // no clear button in cloud version
  listEl.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Loading...</p>';

  HS_API.getModeScores(mode).then(function (scores) {
    if (scores.length === 0) {
      listEl.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">No scores yet. Play a game!</p>';
      return;
    }
    // Render HTML same as before...
  }).catch(function () {
    listEl.innerHTML = '<p style="color:#e94560;text-align:center;padding:20px;">Failed to load scores.</p>';
  });
}
```

### 4.5 Welcome page: show top scores count (optional)

On the welcome page, fetch both modes and display counts:
- Normal: X scores
- Enhanced: X scores

---

## 5. Backend Implementation

### 5.1 File structure

```
backend/
├── server.js          # Express app, routes, middleware
├── database.js        # SQLite setup, schema creation, queries
├── package.json       # dependencies: express, better-sqlite3, cors
├── fly.toml           # fly.io deployment config
└── Dockerfile         # fly.io build container
```

### 5.2 `package.json`

```json
{
  "name": "rewind-snake-backend",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "express": "^5.1.0",
    "better-sqlite3": "^11.7.0",
    "cors": "^2.8.5",
    "express-rate-limit": "^7.5.0"
  }
}
```

### 5.3 `database.js` — SQLite layer

```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'snake.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS high_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'Player',
    score INTEGER NOT NULL,
    steps INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('normal', 'enhanced')),
    created_at INTEGER NOT NULL,
    ip_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mode_score ON high_scores (mode, score DESC, steps ASC);
  CREATE INDEX IF NOT EXISTS idx_ip_mode ON high_scores (ip_hash, mode);
`);

/** Save a score entry. Returns the inserted row. */
function saveScore({ name, score, steps, mode, createdAt, ipHash }) {
  const stmt = db.prepare(`
    INSERT INTO high_scores (name, score, steps, mode, created_at, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, score, steps, mode, createdAt, ipHash);
  return { id: result.lastInsertRowid, name, score, steps, mode, createdAt };
}

/** Get scores for a mode, sorted by score DESC then steps ASC. */
function getScoresByMode(mode, limit = 20) {
  const stmt = db.prepare(
    'SELECT id, name, score, steps, mode, created_at FROM high_scores WHERE mode = ? ORDER BY score DESC, steps ASC LIMIT ?'
  );
  return stmt.all(mode, limit);
}

/** Get scores for all modes. */
function getAllScores(limit = 20) {
  const normal = getScoresByMode('normal', limit);
  const enhanced = getScoresByMode('enhanced', limit);
  return { normal, enhanced };
}

module.exports = { saveScore, getScoresByMode, getAllScores, db };
```

### 5.4 `server.js` — Express app

```js
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { saveScore, getScoresByMode, getAllScores } = require('./database');

const app = express();

// --- Middleware ---
app.use(cors({ origin: ['https://rewind-snake.fly.dev', 'http://localhost:3000'] }));
app.use(express.json());

// Rate limiter: 100 requests per 5 minutes per IP (general)
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(generalLimiter);

// Stricter rate limiter for score submissions: 5 per minute per IP
const scoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.headers['x-forwarded-for']
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : req.ip;
    return crypto.createHash('sha256').update(ip).digest('hex'); // hash IP, don't store it
  },
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- POST /api/scores — Save a score ---
app.post('/api/scores', scoreLimiter, (req, res) => {
  const { name, score, steps, mode } = req.body;

  // Validate mode
  if (mode !== 'normal' && mode !== 'enhanced') {
    return res.status(400).json({ error: "Invalid mode. Must be 'normal' or 'enhanced'." });
  }

  // Validate score
  if (!Number.isInteger(score) || score < 1) {
    return res.status(400).json({ error: 'Score must be a positive integer.' });
  }

  // Validate steps
  if (!Number.isInteger(steps) || steps < 1) {
    return res.status(400).json({ error: 'Steps must be a positive integer.' });
  }

  // Validate name
  const playerName = (typeof name === 'string' && name.trim().length > 0)
    ? name.trim().slice(0, 20)
    : 'Player';

  // Get client IP hash for rate limiting
  const ip = req.headers['x-forwarded-for']
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.ip;
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  // Save and return
  const entry = saveScore({
    name: playerName,
    score,
    steps,
    mode,
    createdAt: Date.now(),
    ipHash
  });

  res.status(201).json(entry);
});

// --- GET /api/scores — List scores ---
app.get('/api/scores', (req, res) => {
  const { mode = 'all', limit = '20' } = req.query;

  // Validate mode
  if (mode !== 'normal' && mode !== 'enhanced' && mode !== 'all') {
    return res.status(400).json({ error: "Invalid mode. Must be 'normal', 'enhanced', or 'all'." });
  }

  // Validate limit
  const limitNum = parseInt(limit, 10);
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
    return res.status(400).json({ error: 'Limit must be between 1 and 50.' });
  }

  if (mode === 'all') {
    res.json(getAllScores(limitNum));
  } else {
    const scores = getScoresByMode(mode, limitNum);
    res.json({ [mode]: scores });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Rewind Snake API listening on port ' + PORT);
});
```

### 5.5 `Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY server.js database.js ./
RUN mkdir -p /data
VOLUME ["/data"]

CMD ["node", "server.js"]
```

### 5.6 `fly.toml`

```toml
app = "rewind-snake"
primary_region = "iad"

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[mounts]]
  source = "snake_data"
  destination = "/data"
```

---

## 6. Deployment

```bash
cd backend
flyctl launch  # interactive — say no to PostgreSQL, yes to Dockerfile
flyctl deploy --app rewind-snake
```

The `snake_data` mount persists the SQLite database across deployments. fly.io volumes handle this automatically.

---

## 7. Migration Checklist

### Backend (build & deploy)
- [ ] Create `backend/` directory
- [ ] Write `server.js`, `database.js`, `package.json`, `Dockerfile`, `fly.toml`
- [ ] Test locally: `npm install && node server.js`
- [ ] Test API with curl/Postman:
  - `POST /api/scores` with valid/invalid payloads
  - `GET /api/scores?mode=normal&limit=5`
  - `GET /api/scores?mode=all`
  - `GET /health`
- [ ] Deploy to fly.io: `flyctl deploy`
- [ ] Verify deployed endpoints: `curl https://rewind-snake.fly.dev/health`

### Frontend (update highscore.js)
- [ ] Remove all localStorage references
- [ ] Add `HS_API` async fetch wrapper
- [ ] Convert `HS.saveScore()` to async, call `HS_API.saveScore()`
- [ ] Convert `HS.getAllScores()` to async, call `HS_API.getModeScores()`
- [ ] Convert `renderScoresList()` to async, add loading state
- [ ] Remove `HS.clearMode()` and `HS.clearAll()` (no backend endpoint for delete)
- [ ] Remove "Clear This Mode" button from high-score modal
- [ ] Update welcome page to show live score counts
- [ ] Add error handling / retry for failed API calls
- [ ] Add offline detection (fallback to localStorage temporarily? or just show error)
- [ ] Test: save a score → verify it appears on the leaderboard
- [ ] Test: both Normal and Enhanced modes
- [ ] Test: error cases (network failure, rate limit, invalid data)
- [ ] Test: mobile and desktop browsers

### Post-deployment
- [ ] Update `AGENTS.md` to reference backend
- [ ] Update `README.md` if present
- [ ] Update this plan with live endpoint once deployed

---

## 8. Future Enhancements (out of scope for v1)

- **User accounts** — login with wallet, track personal bests
- **Daily/weekly challenges** — server-generated seeds
- **Anti-cheat** — validate score vs. steps (a score of 1000 in 10 steps is suspicious)
- **WebSockets** — real-time leaderboard updates
- **Caching** — Redis cache for score lists (TTL: 30s)
- **Admin panel** — remove fraudulent scores
- **Analytics** — track daily active players, game modes popularity
- **Multiplayer** — async leaderboards with head-to-head

---

## 9. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **Score cheating** | No validation yet (game is client-side). Accept scores are not guaranteed legitimate. |
| **Rate limit bypass** | Hash IPs before storing; rate limiter uses x-forwarded-for header. |
| **SQL injection** | Parameterized queries only (better-sqlite3 prepared statements). |
| **XSS** | Names are stored in SQLite; rendered with `textContent` in JS (not `innerHTML` with user data). |
| **DDoS** | fly.io network-level protection; rate limiter at app level. |
| **Data loss** | SQLite on fly.io volume; WAL mode for crash safety. Back up periodically. |
| **CORS** | Restrict to `https://rewind-snake.fly.dev` only. |
