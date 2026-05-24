# High Scores

## Goal

Store and display per-mode high scores (Normal vs Enhanced). Show a "Save High Score"
button on the game-over screen so players can submit their name after a game.

---

## Design

### Data model

```ts
interface HighScoreEntry {
  name: string;
  score: number;   // snake.length at game over
  steps: number;   // total steps taken (= score - 1 for normal, varies for enhanced due to oranges)
  mode: 'normal' | 'enhanced';
  createdAt: number; // Date.now()
}

interface HighScores {
  normal: HighScoreEntry[];
  enhanced: HighScoreEntry[];
}
```

### Sorting

Scores are sorted by:

1. **score** descending (highest length wins)
2. **steps** ascending (fewer steps / faster game wins the tie-breaker)

### Storage (phase 1)

- **localStorage** key: `snake-highscores`
- JSON-serialized `HighScores` object
- Cap at **20 entries per mode**

### Storage (phase 2 — future)

- Replace localStorage with an API endpoint
- The `HighScoreStore` abstracts storage so the swap is a one-line change

### UI

#### Game-over screen

When `alive` becomes `false`, after the existing buttons (Play Again / Back in Time / Home), show:

- A text input (optional name, placeholder "Enter your name")
- A **"Save High Score"** button (only visible when score > 0)
- On click: prompt for name if empty, validate (max 20 chars), save, show toast "Score saved!"

#### Welcome screen

Next to the existing Play buttons, add a **"High Scores"** button/icon in the About card
(or as a new card). Clicking it opens a modal:

- Tabs or section headers: **Normal** | **Enhanced**
- Numbered list showing rank, name, score, steps, and date
- A **"Clear All"** button per mode
- A close button to dismiss

---

## File structure

```
game.js          ← game logic, calls HighScoreStore
highscore.js     ← standalone high-score module (store + UI helpers)
index.html       ← modal markup + script src for highscore.js
```

### highscore.js API (exported functions)

| Function | Purpose |
|---|---|
| `saveScore(mode, score, steps, name?)` | Save an entry (asks for name if missing, falls back to "Player") |
| `getAllScores(mode)` | Return sorted array |
| `clearMode(mode)` | Remove all entries for a mode |
| `clearAll()` | Remove all scores across both modes |
| `renderScores(container, mode)` | Render scores into a DOM container |
| `showHighScoreModal()` | Open the high-score modal |
| `hideHighScoreModal()` | Close the modal |

### Integration points in game.js

1. **Import**: `import * as HS from './highscore.js';` (inline `<script>` or module script)
2. **gameOver()**: After existing buttons appear, call `HS.showGameOverUI(mode, score, steps)` which:
   - Renders the name input + Save button
   - Wires up the submit handler to call `HS.saveScore()`
3. **startGame()**: Pass `steps` (total move count) to the score tracking
4. **Welcome page**: Add High Scores button; wire to `HS.showHighScoreModal()`

---

## Implementation plan

### Step 1: Create `highscore.js`

- Full module with localStorage persistence
- Sorting function
- `saveScore()`, `getAllScores()`, `clearMode()`, `clearAll()`
- Default name fallback: `"Player"`

### Step 2: Wire into game loop

- Track total steps (each `update()` call increments a `steps` counter)
- On `gameOver()`, pass `mode`, `score`, and `steps` to highscore save UI

### Step 3: Game-over UI

- Add a div `#highscoreSave` below the game-over buttons
- Contains: `<input placeholder="Your name">` + `<button>Save High Score</button>`
- Hidden by default; shown on game over
- On save: validate → save → hide → toast

### Step 4: Welcome page — High Scores button

- Add a button in the About card (or new card): **🏆 High Scores**
- On click: call `HS.showHighScoreModal()`
- Modal shows Normal/Enhanced tabs with ranked list + clear buttons

### Step 5: Test & polish

- Verify localStorage persistence across page reloads
- Verify sorting (score desc, steps asc)
- Verify entries are separated by mode

---

## Future enhancements

- [ ] API backend (fetch/POST to `/api/highscores`)
- [ ] Leaderboard with top-10 global rankings
- [ ] Animate score entry (slide-in on save)
- [ ] Export/import scores as JSON
- [ ] Share scores via URL shortlink
