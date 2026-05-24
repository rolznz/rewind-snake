const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { saveScore, getScoresByMode, getAllScores } = require('./database');

const app = express();

const MAX_STATE_HISTORY = 100;  // max state snapshots per score entry

// --- Middleware ---
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

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
    return crypto.createHash('sha256').update(ip).digest('hex');
  },
});

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- POST /api/scores — Save a score ---
app.post('/api/scores', scoreLimiter, (req, res) => {
  const { name, score, steps, mode, stateHistory } = req.body;

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

  // Validate stateHistory if provided
  if (stateHistory !== undefined && stateHistory !== null) {
    if (typeof stateHistory !== 'string') {
      return res.status(400).json({
        error: 'stateHistory must be a JSON string or omitted.'
      });
    }
    try {
      const parsed = JSON.parse(stateHistory);
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_STATE_HISTORY) {
        return res.status(400).json({
          error: `stateHistory must be a JSON array of 1-${MAX_STATE_HISTORY} state snapshots.`
        });
      }
    } catch (e) {
      return res.status(400).json({ error: 'stateHistory is not valid JSON.' });
    }
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
    ipHash,
    stateHistory: typeof stateHistory === 'string' ? stateHistory : null
  });

  // Parse state_history back for the response (it may be NULL)
  const responseEntry = {
    id: entry.id,
    name: entry.name,
    score: entry.score,
    steps: entry.steps,
    mode: entry.mode,
    state_history: entry.state_history || null,
    createdAt: entry.createdAt
  };

  res.status(201).json(responseEntry);
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
app.listen(PORT, (error) => {
  if (error) {
    console.error(error);
    return;
  }
  console.log('Rewind Snake API listening on port ' + PORT);
});
