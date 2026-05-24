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
