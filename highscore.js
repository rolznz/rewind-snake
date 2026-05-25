/* ─────────────────────────────────────────────────────────────
   highscore.js — High-score module (cloud API backend)
   Saves and loads scores from the Rewind Snake API.
   Loads as a regular <script> (not ES module).
   DOM elements are in index.html; this file only handles logic.
   ───────────────────────────────────────────────────────────── */

var HS = {}; // exposed globally

(function () {
  var API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '0.0.0.1')
    ? 'http://localhost:3000'
    : 'https://rewind-snake.fly.dev';
  var MAX_PER_MODE = 20;
  var DEFAULT_NAME = 'Player';
  var MAX_NAME_LEN = 20;

  /* ── API helpers ─────────────────────────────────────────── */

  /** Save a score to the backend. Returns the saved entry. */
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
      // Serialize: extract only the replay-relevant fields from each snapshot
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

    var resp = await fetch(API_BASE + '/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      var errText = await resp.text();
      throw new Error(errText || resp.statusText);
    }
    return resp.json();
  };

  /** Get scores for a specific mode from the backend. */
  HS.getAllScores = async function (mode) {
    var url = API_BASE + '/api/scores?mode=' + encodeURIComponent(mode);
    console.log('[HS] GET', url);
    var resp = await fetch(url);
    console.log('[HS] Response status:', resp.status, resp.ok);
    if (!resp.ok) {
      var errText = await resp.text();
      console.error('[HS] Non-ok response:', errText);
      throw new Error(errText || resp.statusText);
    }
    var data = await resp.json();
    console.log('[HS] Response data:', JSON.stringify(data).slice(0, 200));
    var scores = data[mode];
    console.log('[HS] scores for mode "' + mode + '":', scores ? scores.length + ' items' : 'undefined');
    return scores || [];
  };

  /** Get a single score entry with state_history by id. */
  HS.getScoreById = async function (id) {
    var url = API_BASE + '/api/scores/' + encodeURIComponent(id);
    var resp = await fetch(url);
    if (!resp.ok) {
      var errText = await resp.text();
      throw new Error(errText || resp.statusText);
    }
    return resp.json();
  };

  /* ── Escape HTML ─────────────────────────────────────────── */

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Toast helper ────────────────────────────────────────── */

  function showToast(msg) {
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    if (msg.indexOf('✅') !== -1 || msg.indexOf('saved') !== -1) {
      toast.classList.add('toast-success');
    }
    setTimeout(function () { toast.classList.remove('show', 'toast-success'); }, 3500);
  }

  /* ── Game-over save UI ───────────────────────────────────── */

  /** Show the save button on the game-over screen. */
  HS.showGameOverUI = function (mode, score, steps) {
    var btn = document.getElementById('saveHighscoreBtn');
    if (!btn) return;

    btn.style.display = 'inline-block';

    btn.onclick = function () {
      // Capture history from the live game
      var gameState = window._snakeGameState;
      var stateHistory = gameState ? gameState.getHistory() : [];
      showSaveModal(mode, score, steps, stateHistory);
    };
  };

  /* ── Save-score modal ─────────────────────────────────────── */

  var pendingMode = '';
  var pendingScore = 0;
  var pendingSteps = 0;
  var pendingStateHistory = null;

  function getSaveModalOverlay() {
    return document.getElementById('saveScoreModalOverlay');
  }

  function openSaveModal(mode, score, steps, stateHistory) {
    pendingMode = mode;
    pendingScore = score;
    pendingSteps = steps;
    pendingStateHistory = stateHistory;
    var info = document.getElementById('saveScoreInfo');
    if (info) info.textContent = 'Score: ' + score + ' | Steps: ' + steps;
    var input = document.getElementById('saveScoreNameInput');
    if (input) {
      input.value = '';
      setTimeout(function () { input.focus(); }, 100);
    }
    getSaveModalOverlay().style.display = 'flex';
  }

  function closeSaveModal() {
    var overlay = getSaveModalOverlay();
    if (overlay) overlay.style.display = 'none';
  }

  function showSaveModal(mode, score, steps, stateHistory) {
    openSaveModal(mode, score, steps, stateHistory);
  }

  // Save modal event handlers
  (function () {
    var overlay = getSaveModalOverlay();
    if (!overlay) return;

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSaveModal();
    });

    document.getElementById('saveScoreClose').addEventListener('click', closeSaveModal);
    document.getElementById('saveScoreCancel').addEventListener('click', closeSaveModal);

    document.getElementById('saveScoreSubmit').addEventListener('click', async function () {
      var nameInput = document.getElementById('saveScoreNameInput');
      var name = nameInput ? nameInput.value.trim() : '';
      var submitBtn = document.getElementById('saveScoreSubmit');
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        var entry = await HS.saveScore(pendingMode, pendingScore, pendingSteps, name, pendingStateHistory);
        showToast('✅ High score saved! (' + entry.score + ', ' + entry.steps + ' steps)');
      } catch (err) {
        showToast('❌ Failed to save score: ' + err.message);
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Score';
      closeSaveModal();
    });

    document.addEventListener('keydown', function (e) {
      var ov = getSaveModalOverlay();
      if (e.key === 'Escape' && ov && ov.style.display === 'flex') {
        closeSaveModal();
      }
      if (e.key === 'Enter' && ov && ov.style.display === 'flex') {
        if (document.activeElement && document.activeElement.id === 'saveScoreNameInput') {
          e.preventDefault();
          document.getElementById('saveScoreSubmit').click();
        }
      }
    });
  })();

  /* ── High-score modal (view scores) ──────────────────────── */

  function getScoreModalOverlay() {
    return document.getElementById('scoreModalOverlay');
  }

  // High score modal event handlers
  (function () {
    var overlay = getScoreModalOverlay();
    if (!overlay) return;

    var currentMode = 'normal';

    // Tab switching
    overlay.querySelectorAll('.hs-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        currentMode = tab.dataset.mode;
        overlay.querySelectorAll('.hs-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        renderScoresList(currentMode);
      });
    });

    // Close via overlay click
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.style.display = 'none';
    });

    // Close via X button
    document.getElementById('scoreClose').addEventListener('click', function () {
      overlay.style.display = 'none';
    });

    // ESC key
    document.addEventListener('keydown', function (e) {
      var ov = getScoreModalOverlay();
      if (e.key === 'Escape' && ov && ov.style.display === 'flex') {
        ov.style.display = 'none';
      }
    });
  })();

  /** Open the high-score modal. */
  HS.showHighScoreModal = function () {
    var overlay = getScoreModalOverlay();
    if (!overlay) return;
    overlay.style.display = 'flex';
    var tab = overlay.querySelector('.hs-tab.active');
    var mode = tab ? tab.dataset.mode : 'normal';
    renderScoresList(mode);
  };

  /** Close the high-score modal. */
  HS.hideHighScoreModal = function () {
    var overlay = getScoreModalOverlay();
    if (overlay) overlay.style.display = 'none';
  };

  /** Render scores into the modal's list container (async). */
  function renderScoresList(mode) {
    var listEl = document.getElementById('scoreList');
    if (!listEl) return;

    // Show loading state
    listEl.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">Loading...</p>';

    HS.getAllScores(mode).then(function (scores) {
      if (scores.length === 0) {
        listEl.innerHTML = '<p style="color:#666;text-align:center;padding:20px;">No scores yet. Play a game!</p>';
      } else {
        var html = '<ol style="list-style:none;padding:0;">';
        scores.forEach(function (s, i) {
          var rank = i + 1;
          var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
          var replayBtn =
            '<button class="replay-btn" data-id="' + s.id + '" title="Replay this score">▶</button>';
          html += '<li style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;' +
            'margin-bottom:6px;border-radius:8px;background:#1a1a2e;">' +
            '<span style="font-weight:bold;color:#e94560;min-width:30px;">' + medal + '</span>' +
            '<span style="flex:1;margin-left:8px;">' + escapeHTML(s.name) + '</span>' +
            '<span style="margin-left:12px;color:#4ecca3;font-weight:bold;">' + s.score + '</span>' +
            '<span style="margin-left:8px;color:#888;font-size:0.85rem;">' + s.steps + ' steps</span>' +
            (replayBtn ? '<span style="margin-left:8px">' + replayBtn + '</span>' : '') +
            '</li>';
        });
        html += '</ol>';
        listEl.innerHTML = html;

        // Attach replay button click handlers
        var overlay = getScoreModalOverlay();
        if (overlay) {
          overlay.querySelectorAll('.replay-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var scoreId = parseInt(btn.dataset.id, 10);
              showReplayLoading(btn);
              startReplay(scoreId);
            });
          });
        }
      }
    }).catch(function (err) {
      console.error('[HS] Failed to load scores:', err);
      listEl.innerHTML = '<p style="color:#e94560;text-align:center;padding:20px;">Failed to load scores: ' +
        escapeHTML(err.message) + '</p>';
    });
  }

  /* ── Check if save UI is visible ─────────────────────────── */

  HS.isHighScoreSaveUIVisible = function () {
    var btn = document.getElementById('saveHighscoreBtn');
    return btn && btn.style.display !== 'none';
  };

  /* ── Replay viewer ──────────────────────────────────────── */

  /** Show a loading spinner on a replay button until replay overlay opens. */
  function showReplayLoading(btn) {
    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '0.5';
    // Show a small spinner overlay on the button
    btn.innerHTML = '<span style="font-size:0.8rem;">⏳</span>';
    btn._originalText = originalText;
  }

  function restoreReplayButton(btn) {
    if (btn && btn._originalText !== undefined) {
      btn.innerHTML = btn._originalText;
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  /** Start a replay for the given score ID (fetches data from API). */
  function startReplay(scoreId) {
    HS.getScoreById(scoreId).then(function (entry) {
      if (!entry || !entry.state_history) return;
      var btn = document.querySelector('.replay-btn[data-id="' + scoreId + '"]');
      restoreReplayButton(btn);
      showReplayOverlay(entry);
    }).catch(function (err) {
      console.error('[HS] Failed to load replay data:', err);
      var btn = document.querySelector('.replay-btn[data-id="' + scoreId + '"]');
      restoreReplayButton(btn);
      showToast('❌ Failed to load replay: ' + err.message);
    });
  }

  /** Show the replay overlay. */
  function showReplayOverlay(entry) {
    var overlay = document.getElementById('replayOverlay');
    if (!overlay) return;

    // Set title and info
    document.getElementById('replayTitle').textContent = '🎮 Replay: ' + entry.name;
    document.getElementById('replayInfo').textContent = 'Score: ' + entry.score + ' | ' + entry.steps + ' steps | ' +
      (entry.mode === 'enhanced' ? 'Enhanced' : 'Normal');

    overlay.style.display = 'flex';

    var GRID = 25;
    var canvas = document.getElementById('replayCanvas');
    // Responsive sizing for replay canvas
    var maxW = Math.min(window.innerWidth * 0.9, 560);
    var tileSize = Math.floor(maxW / GRID);
    if (tileSize < 10) tileSize = 10;
    if (tileSize > 24) tileSize = 24;
    canvas.width = GRID * tileSize;
    canvas.height = GRID * tileSize;
    var ctx = canvas.getContext('2d');

    // Parse stored state history
    var states = JSON.parse(entry.state_history);
    var total = states.length;
    var idx = 0;

    /* ── Draw a single state (replicates game.js draw()) ── */
    function renderState(state) {
      var snake = state.snake;
      var food = state.food;
      var wallBreakerActive = state.wallBreakerActive;
      var walls = state.walls || [];

      // Background
      ctx.fillStyle = '#16213e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid
      ctx.strokeStyle = '#1a2744';
      ctx.lineWidth = 0.5;
      for (var i = 0; i <= GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, canvas.height); ctx.stroke();
      }
      for (var i = 0; i <= GRID; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(canvas.width, i * tileSize); ctx.stroke();
      }

      // Walls
      for (var wi = 0; wi < walls.length; wi++) {
        var wall = walls[wi];
        var segments = [
          { x: wall.x1, y: wall.y1 },
          { x: wall.x2, y: wall.y2 }
        ];
        for (var si = 0; si < segments.length; si++) {
          var seg = segments[si];
          ctx.fillStyle = 'rgba(145,145,150,0.9)';
          ctx.fillRect(seg.x * tileSize + 1, seg.y * tileSize + 1, tileSize - 2, tileSize - 2);
          ctx.strokeStyle = 'rgba(100,100,105,0.8)';
          ctx.lineWidth = 1;
          ctx.strokeRect(seg.x * tileSize + 2, seg.y * tileSize + 2, tileSize - 4, tileSize - 4);
          ctx.strokeStyle = 'rgba(180,180,185,0.55)';
          ctx.lineWidth = 1.5;
          var cx = seg.x * tileSize + tileSize / 2;
          var cy = seg.y * tileSize + tileSize / 2;
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
          ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4);
          ctx.stroke();
        }
      }

      // Snake
      for (var si = 0; si < snake.length; si++) {
        var s = snake[si];
        var ratio = 1 - si / snake.length;
        var r, g, b;
        if (wallBreakerActive) {
          var pulse = Math.sin(0) * 40 + 180;  // fixed time = deterministic
          if (si === 0) {
            r = 255; g = Math.round(pulse + 40); b = 0;
          } else {
            r = 255; g = Math.round(pulse); b = 20;
          }
        } else {
          r = 30; g = Math.round(180 + 45 * ratio); b = 100;
        }
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.beginPath();
        ctx.roundRect(s.x * tileSize + 1, s.y * tileSize + 1, tileSize - 2, tileSize - 2, 4);
        ctx.fill();
      }

      // Food
      if (food) {
        if (food.type === 1) {
          ctx.fillStyle = '#f5a623';
          ctx.beginPath();
          ctx.arc(food.x * tileSize + tileSize / 2, food.y * tileSize + tileSize / 2, tileSize / 2 - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4ecca3';
          ctx.fillRect(food.x * tileSize + tileSize / 2 - 1, food.y * tileSize + 3, 2, 5);
        } else {
          ctx.fillStyle = '#e94560';
          ctx.beginPath();
          ctx.arc(food.x * tileSize + tileSize / 2, food.y * tileSize + tileSize / 2, tileSize / 2 - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowColor = '#e94560';
          ctx.shadowBlur = 12;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Progress
      var progressEl = document.getElementById('replayProgress');
      if (progressEl) {
        progressEl.textContent = idx + ' / ' + total + ' steps';
      }
    }

    // Animation loop at 10 fps (same as live game)
    renderState(states[0]);
    idx = 1;
    var interval = setInterval(function () {
      if (idx < total) {
        renderState(states[idx]);
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 100);

    // Close handlers
    document.getElementById('replayClose').addEventListener('click', function () {
      clearInterval(interval);
      overlay.style.display = 'none';
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        clearInterval(interval);
        overlay.style.display = 'none';
      }
    });
  }

  /* ── Init ────────────────────────────────────────────────── */

  // Expose globally
  window.HS = HS;
})();
