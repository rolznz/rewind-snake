/* ─────────────────────────────────────────────────────────────
   highscore.js — High-score module (cloud API backend)
   Saves and loads scores from the Rewind Snake API.
   Loads as a regular <script> (not ES module).
   ───────────────────────────────────────────────────────────── */

var HS = {}; // exposed globally

(function () {
  var API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '0.0.0.0')
    ? 'http://localhost:3000'
    : 'https://rewind-snake.fly.dev';
  var MAX_PER_MODE = 20;
  var DEFAULT_NAME = 'Player';
  var MAX_NAME_LEN = 20;

  /* ── API helpers ─────────────────────────────────────────── */

  /** Save a score to the backend. Returns the saved entry. */
  HS.saveScore = async function (mode, score, steps, name) {
    if (score < 1) return null;
    var body = {
      mode: mode,
      score: score,
      steps: steps,
      name: (typeof name === 'string' && name.trim().length > 0)
        ? name.trim().slice(0, MAX_NAME_LEN)
        : 'Player'
    };
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
    var resp = await fetch(url);
    if (!resp.ok) {
      var errText = await resp.text();
      throw new Error(errText || resp.statusText);
    }
    var data = await resp.json();
    return data[mode] || [];
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
    setTimeout(function () { toast.classList.remove('show'); }, 3500);
  }

  /* ── Game-over save UI ───────────────────────────────────── */

  /** Show the save button on the game-over screen. */
  HS.showGameOverUI = function (mode, score, steps) {
    var container = document.getElementById('highscoreSave');
    if (!container) return;
    var btn = document.getElementById('saveHighscoreBtn');
    if (!btn) return;

    container.style.display = 'block';
    btn.style.display = 'inline-block';

    btn.onclick = function () {
      showSaveModal(mode, score, steps);
    };
  };

  /* ── Save-score modal ─────────────────────────────────────── */

  function getSaveModalOverlay() {
    return document.getElementById('saveScoreModalOverlay');
  }

  function ensureSaveModal() {
    if (getSaveModalOverlay()) return;

    var overlay = document.createElement('div');
    overlay.id = 'saveScoreModalOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);justify-content:center;align-items:center;z-index:700;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#16213e;border:2px solid #0f3460;border-radius:14px;padding:28px 32px;max-width:400px;width:90vw;max-height:80vh;overflow-y:auto;color:#eee;position:relative;';

    box.innerHTML = '<span class="close-btn" id="saveScoreClose">✕</span>' +
      '<h2 style="margin-bottom:14px;font-size:1.4rem;text-align:center;">🏆 Save High Score</h2>' +
      '<p style="color:#aaa;margin-bottom:16px;text-align:center;" id="saveScoreInfo"></p>' +
      '<input type="text" id="saveScoreNameInput" placeholder="Enter your name (optional)" maxlength="20" ' +
        'style="width:100%;padding:8px 12px;font-size:1rem;border:2px solid #0f3460;border-radius:8px;' +
        'background:#1a1a2e;color:#eee;outline:none;margin-bottom:16px;">' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button id="saveScoreCancel" style="padding:8px 24px;border:none;border-radius:8px;cursor:pointer;' +
        'background:#0f3460;color:#eee;font-size:0.95rem;">Cancel</button>' +
        '<button id="saveScoreSubmit" style="padding:8px 24px;border:none;border-radius:8px;cursor:pointer;' +
        'background:#f5a623;color:#1a1a2e;font-size:0.95rem;font-weight:bold;">Save Score</button>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var pendingMode = '';
    var pendingScore = 0;
    var pendingSteps = 0;

    /* Close via overlay click */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeSaveModal();
    });

    /* Close via X button */
    box.querySelector('#saveScoreClose').addEventListener('click', closeSaveModal);

    /* Cancel button */
    box.querySelector('#saveScoreCancel').addEventListener('click', closeSaveModal);

    /* Submit button — async save to API */
    box.querySelector('#saveScoreSubmit').addEventListener('click', async function () {
      var nameInput = document.getElementById('saveScoreNameInput');
      var name = nameInput ? nameInput.value.trim() : '';
      var submitBtn = document.getElementById('saveScoreSubmit');
      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        var entry = await HS.saveScore(pendingMode, pendingScore, pendingSteps, name);
        showToast('🏆 High score saved! (' + entry.score + ', ' + entry.steps + ' steps)');
      } catch (err) {
        showToast('❌ Failed to save score: ' + err.message);
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Score';
      closeSaveModal();
    });

    /* Enter key to submit */
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

    function closeSaveModal() {
      if (overlay) overlay.style.display = 'none';
    }

    function openModal(mode, score, steps) {
      pendingMode = mode;
      pendingScore = score;
      pendingSteps = steps;
      var info = document.getElementById('saveScoreInfo');
      if (info) info.textContent = 'Score: ' + score + ' | Steps: ' + steps;
      var input = document.getElementById('saveScoreNameInput');
      if (input) {
        input.value = '';
        setTimeout(function () { input.focus(); }, 100);
      }
      overlay.style.display = 'flex';
    }

    /* Expose open/close */
    window._hsSaveModal = {
      open: openModal,
      close: closeSaveModal
    };
  }

  function showSaveModal(mode, score, steps) {
    ensureSaveModal();
    if (window._hsSaveModal) {
      window._hsSaveModal.open(mode, score, steps);
    }
  }

  function closeSaveModal() {
    var overlay = getSaveModalOverlay();
    if (overlay) overlay.style.display = 'none';
  }

  /* ── High-score modal (view scores) ──────────────────────── */

  function getScoreModalOverlay() {
    return document.getElementById('scoreModalOverlay');
  }

  function ensureScoreModal() {
    if (getScoreModalOverlay()) return;

    var overlay = document.createElement('div');
    overlay.id = 'scoreModalOverlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);justify-content:center;align-items:center;z-index:700;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#16213e;border:2px solid #0f3460;border-radius:14px;padding:28px 32px;max-width:540px;width:90vw;max-height:80vh;overflow-y:auto;color:#eee;position:relative;';

    box.innerHTML = '<span class="close-btn" id="scoreClose">✕</span>' +
      '<h2 style="margin-bottom:14px;font-size:1.5rem;text-align:center;">🏆 High Scores</h2>' +
      '<div style="display:flex;gap:8px;margin-bottom:16px;justify-content:center;">' +
        '<button class="hs-tab" data-mode="normal" style="padding:6px 20px;border:none;border-radius:8px;cursor:pointer;' +
        'background:#0f3460;color:#4ecca3;font-size:0.9rem;">Normal</button>' +
        '<button class="hs-tab" data-mode="enhanced" style="padding:6px 20px;border:none;border-radius:8px;cursor:pointer;' +
        'background:#0f3460;color:#e94560;font-size:0.9rem;">Enhanced</button>' +
      '</div>' +
      '<div id="scoreList" style="min-height:40px;"></div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var currentMode = 'normal';

    /* Tab switching */
    var tabs = overlay.querySelectorAll('.hs-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        currentMode = tab.dataset.mode;
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        renderScoresList(currentMode);
      });
    });

    /* Close via overlay click (delegation) */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.style.display = 'none';
    });

    /* Close via X button */
    box.querySelector('#scoreClose').addEventListener('click', function () {
      overlay.style.display = 'none';
    });

    /* ESC key */
    document.addEventListener('keydown', function (e) {
      var ov = getScoreModalOverlay();
      if (e.key === 'Escape' && ov && ov.style.display === 'flex') {
        ov.style.display = 'none';
      }
    });
  }

  /** Open the high-score modal. */
  HS.showHighScoreModal = function () {
    ensureScoreModal();
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
          html += '<li style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;' +
            'margin-bottom:6px;border-radius:8px;background:#1a1a2e;">' +
            '<span style="font-weight:bold;color:#e94560;min-width:30px;">' + medal + '</span>' +
            '<span style="flex:1;margin-left:8px;">' + escapeHTML(s.name) + '</span>' +
            '<span style="margin-left:12px;color:#4ecca3;font-weight:bold;">' + s.score + '</span>' +
            '<span style="margin-left:8px;color:#888;font-size:0.85rem;">' + s.steps + ' steps</span>' +
            '</li>';
        });
        html += '</ol>';
        listEl.innerHTML = html;
      }
    }).catch(function () {
      listEl.innerHTML = '<p style="color:#e94560;text-align:center;padding:20px;">Failed to load scores.</p>';
    });
  }

  /* ── Welcome page: add High Scores button ────────────────── */

  function addHighScoresButtonToWelcome() {
    var cards = document.querySelector('.cards');
    if (!cards) return;

    var hsCard = document.createElement('div');
    hsCard.className = 'card';
    hsCard.innerHTML = '<div class="icon">🏆</div>' +
      '<h2>High Scores</h2>' +
      '<p>See the best scores across both modes.</p>' +
      '<span class="tag">&nbsp;</span>' +
      '<button class="play-btn" style="background:#f5a623;color:#1a1a2e;">View Scores</button>';
    // Only the button triggers the modal (not the card)
    hsCard.querySelector('.play-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      HS.showHighScoreModal();
    });
    // Insert before the About card (last card in .cards)
    var aboutCard = cards.lastElementChild;
    if (aboutCard) {
      aboutCard.parentNode.insertBefore(hsCard, aboutCard);
    }
  }

  /* ── Check if save UI is visible ─────────────────────────── */

  HS.isHighScoreSaveUIVisible = function () {
    var container = document.getElementById('highscoreSave');
    return container && container.style.display !== 'none';
  };

  /* ── Init ────────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    addHighScoresButtonToWelcome();
  });

  // Expose globally
  window.HS = HS;
})();
