# 🐍⏪ Rewind Snake

<a href="https://rolznz.github.io/rewind-snake/"><img src="https://img.shields.io/badge/🕹️_Play_Now-blue?style=for-the-badge&logo=steam&logoColor=white" alt="Play Now"></a>

A classic snake game with a time-traveling twist — **go back in time** after game over by paying a small bitcoin lightning fee.

## Play

👉 **[Play Rewind Snake Now](https://rolznz.github.io/rewind-snake/)**

## Features

- **Two modes** — Normal (classic snake) and Enhanced (walls appear, bonus food)
- **Back in Time** — Rewind your game after game over for 100 sats/step via Lightning
- **Wall Breaker** — In Enhanced Mode, smash through walls with 🔥 (press **X**)
- **High scores** — Save and view your best scores across both modes
- **Particle effects** — Fire particles and explosion sparks
- **No downloads** — Runs entirely in the browser, no sign-up required

## How It Works

1. **Choose a mode** — Normal or Enhanced from the welcome screen
2. **Play snake** — Eat food to grow longer, avoid walls and yourself
3. **Game over?** — Click "⏪ Back in Time" to rewind
4. **Pay & Rewind** — Enter steps, pay via Lightning (100 sats per step), and watch your snake travel back through saved states
5. **Resume playing** — A countdown starts and you continue from the chosen moment

## Tech

- **Frontend** — Vanilla HTML, CSS, JavaScript
- **Payments** — Lightning Address (LNURL) + Bitcoin Connect SDK
- **Scores** — `localStorage` persistence
- **No dependencies, no build step**

## Development

Open `index.html` in a browser to play locally. Run with any simple HTTP server:

```bash
npx serve .
```

See [AGENTS.md](./AGENTS.md) for detailed project documentation.
