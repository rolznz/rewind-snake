const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const GRID = 25;
const MAX_HISTORY = 100;  // max states kept (for rewind + replay capture)

let tileSize = 20; // dynamically computed
canvas.width = GRID * tileSize;
canvas.height = GRID * tileSize;

let snake, dir, nextDir, food, score, alive, loop;
let steps = 0; // total steps taken in current game
let history = []; // array of { snake, food, walls } snapshots (oldest first), max 100
const $score = document.getElementById('score');
const $msg = document.getElementById('msg');
const $gameUI = document.getElementById('gameUI');
const $welcome = document.getElementById('welcome');
const $btn = document.getElementById('btn');
const $homeBtn = document.getElementById('homeBtn');
const $undoBtn = document.getElementById('undoBtn');
const $popup = document.getElementById('popup');
const $stepsInput = document.getElementById('stepsInput');
const $countdown = document.getElementById('countdown');
const $countdownNum = document.getElementById('countdownNum');
const $costLine = document.getElementById('costLine');
const $payBtn = document.getElementById('payBtn');
const $toast = document.getElementById('toast');
const $flash = document.getElementById('powerup-flash');
const $controls = document.getElementById('controls');
const $saveHighscoreBtn = document.getElementById('saveHighscoreBtn');

// --- Mode ---
let isEnhanced = false;

// --- Responsive canvas ---
function resizeGameCanvas() {
  const maxW = Math.min(window.innerWidth - 20, window.innerHeight * 0.55);
  tileSize = Math.floor(maxW / GRID);
  if (tileSize < 10) tileSize = 10;
  if (tileSize > 24) tileSize = 24;
  canvas.width = GRID * tileSize;
  canvas.height = GRID * tileSize;
}

// --- Touch controls ---
let touchStartX = 0, touchStartY = 0;
const SWIPE_THRESHOLD = 30;
let longPressTimer = null;

function setupTouchControls() {
  canvas.addEventListener('touchstart', function (e) {
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;

    // Long-press for Wall Breaker (Enhanced mode only)
    if (alive && isEnhanced) {
      longPressTimer = setTimeout(function () {
        activateWallBreaker();
        longPressTimer = null;
      }, 500);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', function (e) {
    e.preventDefault();
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function (e) {
    e.preventDefault();
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
      return;
    }

    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDirection(dx > 0 ? 1 : -1, 0);
    } else {
      setDirection(0, dy > 0 ? 1 : -1);
    }
  }, { passive: false });
}

function setDirection(dx, dy) {
  // Prevent 180-degree turns
  if (dx === -dir.x && dy === -dir.y) return;
  nextDir = { x: dx, y: dy };
}

// Handle window resize with debounce
let resizeTimeout;
window.addEventListener('resize', function () {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(resizeGameCanvas, 150);
});

// --- Payment state ---
let paymentLoading = false;
const SATS_PER_STEP = 100;
const PAYMENT_RECIPIENT = 'rolznz@getalby.com';

// --- Food types ---
const FOOD_APPLE  = 0;  // common, +1 segment
const FOOD_ORANGE = 1;  // rare, +10 segments (gradual, 1 per frame)
function updateScoreDisplay() {
  score = snake.length;
  const suffix = wallBreakerActive ? '  🔥  Enhanced' : '  |  Enhanced';
  $score.textContent = isEnhanced ? 'Score: ' + score + suffix : 'Score: ' + score + '  |  Normal';
}

// --- Wall state ---
let walls = []; // { x1, y1, x2, y2 }
let wallSpawnChance = 0.03;     // starts at 3%

// --- Orange growth — segments added one per frame ---
let growQueue = 0; // when >0, skip pop() for this many frames

// --- Flash notification ---
let flashTimeout;

// --- Wall Breaker state ---
let wallBreakerActive = false;
let wallBreakerTimer = 0;
let wallBreakerCooldown = false;
const WALL_BREAKER_DURATION = 3000;
const WALL_BREAKER_COOLDOWN = 100;
const WALL_BREAKER_SEG_COST = 5;
const MIN_SEGMENTS_FOR_BREAKER = 6;

// --- Particles ---
let wallBreakerFlames = [];  // flame particles from tail
let explosionSparks = [];    // sparks from exploded walls

function confirmRestart() {
  if (confirm('Restart game? Your score will be lost.')) {
    startGame(isEnhanced ? 'enhanced' : 'normal');
  }
}

function startGame(mode) {
  clearInterval(loop);
  paymentLoading = false;
  snake = [{ x: 5, y: 12 }];
  dir = { x: 1, y: 0 };
  nextDir = { x: 1, y: 0 };
  score = 0;
  alive = true;
  history = [];
  steps = 0;
  walls = [];
  growQueue = 0;
  wallSpawnChance = 0.03;
  wallBreakerActive = false;
  wallBreakerTimer = 0;
  wallBreakerCooldown = false;
  wallBreakerFlames = [];
  explosionSparks = [];
  isEnhanced = mode === 'enhanced';
  hideWelcome();
  // Detect touch device and show appropriate controls message
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  $controls.textContent = isTouch
    ? (isEnhanced
        ? '👆 Swipe to move · Hold for Wall Breaker (Enhanced)' 
        : '👆 Swipe to move')
    : (isEnhanced
        ? 'Arrow keys or WASD to move · X for Wall Breaker'
        : 'Arrow keys or WASD to move');
  updateScoreDisplay();
  $msg.textContent = '';
  $btn.style.display = 'none';
  $undoBtn.style.display = 'none';
  $homeBtn.style.display = 'none';
  if ($saveHighscoreBtn) $saveHighscoreBtn.style.display = 'none';
  resizeGameCanvas();
  setupTouchControls();
  placeFood();
  draw();
  startCountdown(() => {
    loop = setInterval(update, 100);
  });
}

function placeFood() {
  let pos;
  let attempts = 0;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
      type: FOOD_APPLE
    };
    attempts++;
    if (attempts > 200) {
      // Grid too full, just place anywhere
      pos.type = FOOD_APPLE;
      break;
    }
  } while (isOccupied(pos.x, pos.y));

  // Enhanced mode: weighted food type
  if (isEnhanced) {
    const orangeChance = getOrangeChance(snake.length);
    if (Math.random() < orangeChance) {
      pos.type = FOOD_ORANGE;
    } else {
      pos.type = FOOD_APPLE;
    }
  }

  food = pos;
}

function getOrangeChance(length) {
  return Math.min(0.40, 0.05 + length * 0.015);
}

function getWallSpawnChance(length) {
  return Math.min(0.20, 0.03 + length * 0.006);
}

function isOccupied(x, y) {
  if (snake.some(s => s.x === x && s.y === y)) return true;
  if (food && food.x === x && food.y === y) return true;
  for (const w of walls) {
    if ((w.x1 === x && w.y1 === y) || (w.x2 === x && w.y2 === y)) return true;
  }
  return false;
}

function spawnWall() {
  const head = snake[0];
  const attempts = 100;
  for (let i = 0; i < attempts; i++) {
    const orientation = Math.random() < 0.5 ? 'h' : 'v';
    const x1 = Math.floor(Math.random() * (GRID - (orientation === 'h' ? 1 : 0)));
    const y1 = Math.floor(Math.random() * (GRID - (orientation === 'v' ? 1 : 0)));
    const x2 = orientation === 'h' ? x1 + 1 : x1;
    const y2 = orientation === 'v' ? y1 + 1 : y1;
    // Safety zone: 6×6 area around snake head
    if (Math.abs(x1 - head.x) > 6 && Math.abs(y1 - head.y) > 6) {
      if (!isOccupied(x1, y1) && !isOccupied(x2, y2)) {
        walls.push({ x1, y1, x2, y2 });
        showFlash('⚠️ Wall appeared!', '#f5a623');
        return;
      }
    }
  }
}

function saveState() {
  history.push({
    snake: snake.map(s => ({ ...s })),
    food: { ...food },
    walls: walls.map(w => ({ ...w })),
    wallBreakerActive: wallBreakerActive,
    wallBreakerTimer: wallBreakerTimer,
  });
  // Keep only last MAX_HISTORY states (oldest first, so trim end)
  if (history.length > MAX_HISTORY) {
    history = history.slice(history.length - MAX_HISTORY);
  }
}

function update() {
  if (!alive) return;
  saveState(); // save before move
  steps++;

  dir = nextDir;
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  // Wall bounds collision (unchanged)
  if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
    return gameOver();
  }

  // Self collision (unchanged)
  if (snake.some(s => s.x === head.x && s.y === head.y)) {
    return gameOver();
  }

  // Wall segment collision (enhanced mode only)
  if (isEnhanced) {
    const wallsToRemove = [];
    for (const w of walls) {
      if ((head.x === w.x1 && head.y === w.y1) || (head.x === w.x2 && head.y === w.y2)) {
        if (wallBreakerActive) {
          wallsToRemove.push(w);
        } else {
          return gameOver();
        }
      }
    }
    if (wallBreakerActive && wallsToRemove.length > 0) {
      walls = walls.filter(w => !wallsToRemove.includes(w));
      for (const w of wallsToRemove) {
        spawnExplosionSparks(w.x1, w.y1);
        if (w.x1 !== w.x2 || w.y1 !== w.y2) {
          spawnExplosionSparks(w.x2, w.y2);
        }
      }
    }
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    if (food.type === FOOD_ORANGE) {
      growQueue += 10; // add 1 segment per frame for 10 frames
      showFlash('🍊 Orange +10', '#f5a623');
    } else {
      showFlash('🍎 Apple +1', '#e94560');
    }
    updateScoreDisplay();
    placeFood();
    
    if (isEnhanced) {
      // Spawn walls — count scales with snake length, with randomness
      const numWalls = Math.min(Math.floor(snake.length * Math.random() / 6), 5);
      for (let i = 0; i < numWalls; i++) {
        spawnWall();
      }
    }
  } else {
    if (isEnhanced && growQueue > 0) {
      growQueue--;
      // skip pop() — tail stays, body extends
    } else {
      snake.pop();
    }
  }

  // Wall Breaker timer
  if (wallBreakerActive) {
    wallBreakerTimer -= 100;
    if (wallBreakerTimer <= 0) {
      deactivateWallBreaker();
    }
  }

  // Emit flame particles from tail
  if (wallBreakerActive && Math.random() < 0.6) {
    const tail = snake[snake.length - 1];
    wallBreakerFlames.push({
      x: tail.x * tileSize + tileSize / 2,
      y: tail.y * tileSize + tileSize / 2,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -(Math.random() * 1.5 + 0.5),
      life: 1,
      size: Math.random() * 3 + 3,
      color: ['#ff6600', '#ffaa00', '#ff2200'][Math.floor(Math.random() * 3)]
    });
  }

  // Update particles
  wallBreakerFlames = wallBreakerFlames.map(p => ({
    ...p,
    x: p.x + p.vx,
    y: p.y + p.vy,
    life: p.life - 0.03,
    size: p.size * 0.97
  })).filter(p => p.life > 0);

  explosionSparks = explosionSparks.map(s => ({
    ...s,
    x: s.x + s.vx,
    y: s.y + s.vy,
    vx: s.vx * 0.9,
    vy: s.vy * 0.9,
    life: s.life - 0.04
  })).filter(s => s.life > 0);

  draw();
}

function draw() {
  // Background
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid (subtle)
  ctx.strokeStyle = '#1a2744';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(i * tileSize, 0); ctx.lineTo(i * tileSize, canvas.height); ctx.stroke();
  }
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * tileSize); ctx.lineTo(canvas.width, i * tileSize); ctx.stroke();
  }

  // Draw walls
  drawWalls();

  // Snake
  snake.forEach((s, i) => {
    const ratio = 1 - i / snake.length;
    let headColor, bodyColor;

    if (wallBreakerActive) {
      const pulse = Math.sin(Date.now() / 150) * 40 + 180;
      if (i === 0) {
        headColor = `rgb(255, ${Math.round(pulse + 40)}, 0)`;
      } else {
        bodyColor = `rgb(255, ${Math.round(pulse)}, 20)`;
      }
    }

    if (i === 0 && wallBreakerActive) {
      ctx.fillStyle = headColor || `rgb(255, ${Math.round(pulse + 40)}, 0)`;
    } else if (wallBreakerActive) {
      ctx.fillStyle = bodyColor || `rgb(255, ${Math.round(pulse)}, 20)`;
    } else {
      const g = Math.round(180 + 45 * ratio);
      ctx.fillStyle = `rgb(30, ${g}, 100)`;
    }
    ctx.beginPath();
    ctx.roundRect(s.x * tileSize + 1, s.y * tileSize + 1, tileSize - 2, tileSize - 2, 4);
    ctx.fill();
  });

  // Particles (flames + explosion sparks)
  for (const p of wallBreakerFlames) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of explosionSparks) {
    ctx.globalAlpha = s.life;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Food
  drawFood();
}

function drawFood() {
  if (food.type === FOOD_ORANGE) {
    ctx.fillStyle = '#f5a623';  // orange
    ctx.beginPath();
    ctx.arc(food.x * tileSize + tileSize / 2, food.y * tileSize + tileSize / 2, tileSize / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    // Small green stem
    ctx.fillStyle = '#4ecca3';
    ctx.fillRect(food.x * tileSize + tileSize / 2 - 1, food.y * tileSize + 3, 2, 5);
  } else {
    ctx.fillStyle = '#e94560';  // red
    ctx.beginPath();
    ctx.arc(food.x * tileSize + tileSize / 2, food.y * tileSize + tileSize / 2, tileSize / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    // Food glow
    ctx.shadowColor = '#e94560';
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawWalls() {
  for (const w of walls) {
    // Draw wall segments
    const segments = [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 }
    ];
    for (const seg of segments) {
      // Gray brick color
      ctx.fillStyle = 'rgba(145, 145, 150, 0.9)';
      ctx.fillRect(seg.x * tileSize + 1, seg.y * tileSize + 1, tileSize - 2, tileSize - 2);
      // Brick-like border
      ctx.strokeStyle = 'rgba(100, 100, 105, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(seg.x * tileSize + 2, seg.y * tileSize + 2, tileSize - 4, tileSize - 4);
      // Small X mark for danger
      ctx.strokeStyle = 'rgba(180, 180, 185, 0.55)';
      ctx.lineWidth = 1.5;
      const cx = seg.x * tileSize + tileSize / 2;
      const cy = seg.y * tileSize + tileSize / 2;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 4);
      ctx.lineTo(cx + 4, cy + 4);
      ctx.moveTo(cx + 4, cy - 4);
      ctx.lineTo(cx - 4, cy + 4);
      ctx.stroke();
    }
  }
}

function gameOver() {
  alive = false;
  clearInterval(loop);
  score = snake.length;
  wallBreakerActive = false;
  wallBreakerCooldown = false;
  wallBreakerFlames = [];
  explosionSparks = [];
  $msg.textContent = 'Game Over — Length: ' + score;
  $btn.style.display = 'inline-block';
  if (history.length > 0) {
    $undoBtn.style.display = 'inline-block';
    $undoBtn.textContent = `⏪ Back in Time`;
  }
  $homeBtn.style.display = 'inline-block';

  // Show high-score save button
  if ($saveHighscoreBtn) {
    $saveHighscoreBtn.style.display = 'inline-block';
    HS.showGameOverUI(isEnhanced ? 'enhanced' : 'normal', score, steps);
  }

  // Re-size canvas on game over (state changed)
  resizeGameCanvas();
}

// ── Home confirmation popup ──
function showHomePopup() {
  if (confirm('Return to the start screen? Your current game will end.')) {
    clearInterval(loop);
    alive = false;
    $gameUI.style.display = 'none';
    $welcome.style.display = '';
    $welcome.classList.remove('hidden');
    $btn.style.display = 'none';
    $undoBtn.style.display = 'none';
    $homeBtn.style.display = 'none';
    if ($saveHighscoreBtn) $saveHighscoreBtn.style.display = 'none';
  }
}

// ── Hide welcome page ──
function hideWelcome() {
  $welcome.classList.add('hidden');
  setTimeout(() => {
    $welcome.style.display = 'none';
    $gameUI.style.display = '';
  }, 500);
}

function updateCostDisplay() {
  const steps = parseInt($stepsInput.value, 10) || 1;
  const cost = steps * SATS_PER_STEP;
  $costLine.textContent = `Cost: ${cost} sats (${SATS_PER_STEP}/step)`;
}

function showUndoPopup() {
  $stepsInput.value = Math.min(history.length, 10);
  $stepsInput.min = 1;
  $stepsInput.max = history.length;
  $popup.classList.add('show');
  $stepsInput.focus();
  $stepsInput.select();
  updateCostDisplay();

  // Listen for input changes to update cost display
  $stepsInput.addEventListener('input', updateCostDisplay);
}

function closePopup() {
  $popup.classList.remove('show');
  $stepsInput.removeEventListener('input', updateCostDisplay);
}

function startCountdown(callback) {
  let count = 3;
  $countdown.classList.add('show');
  $countdownNum.textContent = count;
  $countdownNum.style.animation = 'none';
  void $countdownNum.offsetHeight; // reflow to restart animation
  $countdownNum.style.animation = '';

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      $countdownNum.textContent = count;
      $countdownNum.style.animation = 'none';
      void $countdownNum.offsetHeight;
      $countdownNum.style.animation = '';
    } else {
      clearInterval(interval);
      $countdownNum.textContent = 'Go!';
      $countdownNum.style.color = '#4ecca3';
      $countdownNum.style.animation = 'none';
      void $countdownNum.offsetHeight;
      $countdownNum.style.animation = '';
      setTimeout(() => {
        $countdown.classList.remove('show');
        $countdownNum.style.color = '#e94560';
        callback();
      }, 500);
    }
  }, 1000);
}

function resumeGame(n) {
  // Restore snake, food, and walls from n steps ago
  const prevState = history[history.length - n];
  snake = prevState.snake.map(s => ({ ...s }));
  food = prevState.food;
  if (isEnhanced) {
    walls = prevState.walls.map(w => ({ ...w })); // restore walls too
  } else {
    walls = [];
  }
  // Restore direction from the snake's body orientation (head - neck = movement direction)
  const prevHead = prevState.snake[0];
  const prevBody = prevState.snake[1];
  if (prevBody) {
    dir = { x: prevHead.x - prevBody.x, y: prevHead.y - prevBody.y };
  } else {
    dir = { x: 1, y: 0 };
  }
  nextDir = { ...dir };
  score = n; // give back the score from the undone steps
  updateScoreDisplay();
  alive = true;
  $btn.style.display = 'none';
  $undoBtn.style.display = 'none';
  $homeBtn.style.display = 'none';
  if ($saveHighscoreBtn) $saveHighscoreBtn.style.display = 'none';
  $msg.textContent = '⏪ Traveled back ' + n + ' steps!';
  history = history.slice(0, history.length - n);
  growQueue = 0;
  wallBreakerActive = false;
  wallBreakerFlames = [];
  loop = setInterval(update, 100);
  draw();
}

// --- Toast notification ---
function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  setTimeout(() => { $toast.classList.remove('show'); }, 3500);
}

// --- Flash notification ---
function showFlash(text, color) {
  clearTimeout(flashTimeout);
  $flash.textContent = text;
  $flash.style.backgroundColor = color;
  $flash.classList.add('show');
  flashTimeout = setTimeout(() => {
    $flash.classList.remove('show');
  }, 1200);
}

// --- Payment & Rewind ---
async function payAndRewind() {
  const n = parseInt($stepsInput.value, 10);
  if (isNaN(n) || n < 1 || n > history.length) {
    showToast('Enter a valid number of steps.');
    return;
  }
  if (paymentLoading) return; // prevent double-clicks

  const cost = n * SATS_PER_STEP;
  paymentLoading = true;
  $payBtn.disabled = true;
  $payBtn.textContent = 'Processing...';

  try {
    // Step 1: Generate invoice from recipient's lightning address
    const { LightningAddress } = await import('https://esm.sh/@getalby/lightning-tools@^8.1.0/lnurl');
    const ln = new LightningAddress(PAYMENT_RECIPIENT);
    await ln.fetch();
    const invoiceData = await ln.requestInvoice({ satoshi: cost, comment: '🐍⏪ Rewind Snake - ' + n + ' steps' });

    // Step 2: Initialize Bitcoin Connect and launch payment modal
    const { init, launchPaymentModal } = await import('https://esm.sh/@getalby/bitcoin-connect@^3.0.0');
    init({ appName: '🐍⏪ Rewind Snake' });

    const { setPaid } = launchPaymentModal({
      invoice: invoiceData.paymentRequest,
      onPaid: () => {
        console.log('Payment confirmed');
      },
      onCancelled: () => {
        console.log('Payment cancelled');
      },
    });

    // Step 3: Poll for payment confirmation (every 2s, max 3 min)
    let attempts = 0;
    while (attempts < 90) {
      await new Promise(r => setTimeout(r, 2000));
      const isPaid = await invoiceData.isPaid();
      if (isPaid) {
        setPaid("dummy"); // hack for external payments
        closePopup();
        paymentLoading = false;
        $payBtn.disabled = false;
        $payBtn.textContent = 'Pay & Rewind';
        await new Promise(r => setTimeout(r, 3000));
        undoSteps();
        return;
      }
      attempts++;
    }

    showToast('Payment timed out. Please try again.');
    paymentLoading = false;
    $payBtn.disabled = false;
    $payBtn.textContent = 'Pay & Rewind';
  } catch (err) {
    console.error('Payment error:', err);
    if (err.message?.toLowerCase().includes('cancel')) {
      showToast('Payment cancelled.');
    } else if (err.message?.toLowerCase().includes('insufficient')) {
      showToast('Insufficient balance in your wallet.');
    } else if (err.message?.includes('Network') || err.message?.includes('connect')) {
      showToast('Connection error. Check your network.');
    } else {
      showToast('Payment failed: ' + err.message);
    }
    paymentLoading = false;
    $payBtn.disabled = false;
    $payBtn.textContent = 'Pay & Rewind';
  }
}

function undoSteps() {
  const n = parseInt($stepsInput.value, 10);
  if (isNaN(n) || n < 1 || n > history.length) {
    closePopup();
    return;
  }
  closePopup();
  clearInterval(loop);
  alive = false; // pause game during rewind

  // Collect the states to show: current state → each historical state backwards
  const states = [];
  states.push({
    snake: snake.map(s => ({ ...s })),
    food: { ...food },
    walls: walls.map(w => ({ ...w })),
  }); // current state
  for (let i = 1; i <= n; i++) {
    const prev = history[history.length - i];
    states.push({
      snake: prev.snake.map(s => ({ ...s })),
      food: { ...prev.food },
      walls: prev.walls.map(w => ({ ...w })),
    });
  }

  let step = 1; // start from the first step back (skip states[0] = current)
  // Show each state with 100ms delay (same speed as gameplay)
  const interval = setInterval(() => {
    snake = states[step].snake;
    food = states[step].food;
    walls = states[step].walls;
    draw();
    step++;
    if (step >= states.length) {
      clearInterval(interval);
      // Rewind complete — restore to target state
      snake = states[states.length - 1].snake;
      food = states[states.length - 1].food;
      walls = states[states.length - 1].walls;
      draw();
      // Show countdown, then resume
      startCountdown(() => {
        resumeGame(n);
      });
    }
  }, 100);
  draw(); // draw current state immediately before rewind starts
}

// ── Wall Breaker helpers ──
function activateWallBreaker() {
  if (wallBreakerActive) {
    showToast('🔥 Wall Breaker already active!');
    return;
  }
  if (wallBreakerCooldown) {
    showToast('⏳ Wall Breaker on cooldown!');
    return;
  }
  if (snake.length < MIN_SEGMENTS_FOR_BREAKER) {
    showToast('Need at least ' + MIN_SEGMENTS_FOR_BREAKER + ' segments');
    return;
  }

  // Deduct segments
  for (let i = 0; i < WALL_BREAKER_SEG_COST; i++) {
    snake.pop();
  }
  updateScoreDisplay();

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

  // Visual flash
  $flash.textContent = '💥 Wall Breaker depleted';
  $flash.style.backgroundColor = '#ff4500';
  $flash.classList.add('show');
  setTimeout(() => {
    $flash.classList.remove('show');
    wallBreakerCooldown = false;
  }, WALL_BREAKER_COOLDOWN);
}

function spawnExplosionSparks(cx, cy) {
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    explosionSparks.push({
      x: cx * tileSize + tileSize / 2,
      y: cy * tileSize + tileSize / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      size: Math.random() * 3 + 1,
      color: ['#ffff00', '#ffaa00', '#ffffff'][Math.floor(Math.random() * 3)]
    });
  }
}

// ── Keyboard controls ──
document.addEventListener('keydown', e => {
  // Popup shortcuts
  if ($popup.classList.contains('show')) {
    if (e.key === 'Enter') { e.preventDefault(); payAndRewind(); return; }
    if (e.key === 'Escape') { closePopup(); return; }
    return;
  }

  // High-score save UI visible — let keys pass through to modal
  if (HS.isHighScoreSaveUIVisible()) return;

  // Wall Breaker: press X
  if (e.key.toLowerCase() === 'x' && alive && isEnhanced) {
    e.preventDefault();
    activateWallBreaker();
    return;
  }
  const map = {
    ArrowUp:    { x: 0, y: -1 }, w: { x: 0, y: -1 }, W: { x: 0, y: -1 },
    ArrowDown:  { x: 0, y: 1 }, s: { x: 0, y: 1 }, S: { x: 0, y: 1 },
    ArrowLeft:  { x: -1, y: 0 }, a: { x: -1, y: 0 }, A: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 }, D: { x: 1, y: 0 },
  };
  const d = map[e.key];
  if (!d) return;
  e.preventDefault();
  setDirection(d.x, d.y);
});

// Initial start is from welcome page, so no auto-start
// startGame();

// Expose state history for highscore.js to capture on save
window._snakeGameState = {
  getHistory: function () { return history; },
  isEnhanced: isEnhanced,
  tileSize: tileSize,
  GRID: GRID
};
