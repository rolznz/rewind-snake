const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.SNAKE_DB_PATH || 'snake.db';
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
    state_history TEXT,  -- NULL or JSON array of state snapshots (for replay)
    state_history_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of state_history JSON, prevents duplicate submissions
    created_at INTEGER NOT NULL,
    ip_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mode_score ON high_scores (mode, score DESC, steps ASC);
  CREATE INDEX IF NOT EXISTS idx_ip_mode ON high_scores (ip_hash, mode);
`);

/** Save a score entry. Returns the inserted row. */
function saveScore({ name, score, steps, mode, createdAt, ipHash, stateHistory, stateHistoryHash }) {
  const stmt = db.prepare(`
    INSERT INTO high_scores (name, score, steps, mode, state_history, state_history_hash, created_at, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(name, score, steps, mode, stateHistory || null, stateHistoryHash, createdAt, ipHash);
  return { id: result.lastInsertRowid, name, score, steps, mode, createdAt, state_history: stateHistory, state_history_hash: stateHistoryHash };
}

/** Get scores for a mode, sorted by score DESC then steps ASC (no state_history). */
function getScoresByMode(mode, limit = 20) {
  const stmt = db.prepare(
    'SELECT id, name, score, steps, mode, created_at '
    + 'FROM high_scores WHERE mode = ? ORDER BY score DESC, steps ASC LIMIT ?'
  );
  return stmt.all(mode, limit);
}



/** Get a single score entry by id (includes state_history for replay). */
function getScoreById(id) {
  const stmt = db.prepare(
    'SELECT id, name, score, steps, mode, state_history, created_at '
    + 'FROM high_scores WHERE id = ?'
  );
  return stmt.get(id);
}

module.exports = { saveScore, getScoresByMode, getScoreById, db };
