# AGENTS.md — Project Guide

> **⚠️ Always update this file when making changes to the project.**
> Keep this summary accurate so agents and contributors can quickly understand the codebase.

## Overview

A vanilla **Snake game** — a multi-file browser game built with HTML, CSS, and JavaScript. No build step, no dependencies. Features two game modes (Normal and Enhanced), a Lightning payment rewind system, and a full high-score leaderboard.

## Core Files

| File | Purpose |
|------|---------|
| `index.html` | HTML structure, CSS styling, welcome page, modals, UI overlays (game-over popup, undo popup, countdown, about modal) |
| `game.js` | Full game logic: rendering, input, collision, scoring, state history, rewind ("Back in Time"), Wall Breaker, payment integration |
| `highscore.js` | Standalone high-score module: localStorage persistence, save/view modals, leaderboard display, welcome-page integration |

## Key Mechanics

- **Canvas rendering** — 25×25 grid, 20px tiles, gradient snake body, glowing food, particle effects
- **Input** — Arrow keys and WASD, with 180° turn prevention
- **Game loop** — `setInterval` at 100ms (10 fps)
- **Collision** — wall boundaries and self-intersection trigger game over
- **State history** — last 100 states saved as snapshots (`{ snake, food, walls }`)
- **"Back in Time" rewind** — on game over, shows a step-by-step rewind animation through saved states, then a countdown before resuming
- **Two game modes**: Normal (walls wrap around edges) and Enhanced (walls appear, oranges grant bonus growth)
- **Wall Breaker** (Enhanced Mode) — press **X** to smash through walls for 3 seconds; costs 5 segments, 100s cooldown
- **Food types**: Apple (+1 segment, common) and Orange (+10 segments over 10 frames, rare in Enhanced mode)
- **Particle effects** — flame particles from snake tail during Wall Breaker, explosion sparks on wall destruction
- **High scores** — saved to `localStorage` under key `snake-highscores`; top 20 per mode; sorted by score desc then steps asc
- **Welcome page** — mode selection cards (Normal / Enhanced) with animated transitions

## UI Layout

- Dark-themed (`#1a1a2e` / `#16213e` / `#0f3460` palette) with accent colors (`#e94560` red, `#4ecca3` green, `#f5a623` orange)
- **Welcome page** — animated card selection (Normal, Enhanced, About, High Scores) with fade-out transition
- **Game HUD** — title, score (with mode indicator), canvas, message area, restart button, undo button, home button
- **Wall Breaker** — flash notification with fire particles, pulsing orange/red snake body
- **Power-up flash** — floating banner showing food collected, wall spawned, Wall Breaker activated/depleted
- **Modals** — rewind step selection, game-over save, high-score leaderboard (tabbed Normal/Enhanced), about
- **Countdown overlay** — animated 3-2-1-Go! with pulsing numbers
- **Toast notifications** — bottom-center error/warning messages (3.5s duration)
- **High-score save UI** — "🏆 Save High Score" button appears on game over; optional name input

## Payment Rewind

When game over, the "Back in Time" feature requires payment before rewinding:

- **Cost**: 100 sats per step (e.g., 5 steps = 500 sats)
- **Recipient**: `rolznz@getalby.com` (Alby wallet)
- **Flow**: User enters steps → sees cost → clicks "Pay & Rewind" → Bitcoin Connect payment modal opens → user pays → rewind animation plays → countdown → game resumes
- **Tech**: Uses `@getalby/bitcoin-connect` (CDN) for payment modal and `@getalby/lightning-tools` (dynamic import) for invoice generation via LNURL
- **State**: `paymentLoading` prevents double-clicks; toast notifications show errors; polling every 2s for up to 3 minutes

## Skills (.agents/skills/)

- **alby-bitcoin-builder** — Bitcoin lightning wallet integration (Nostr Wallet Connect, LNURL, fiat conversion)

The payment rewind feature is fully wired and live. The skills provide scaffolding for additional bitcoin/lightning features.

## Development Notes

- No toolchain or dependencies — open `index.html` in a browser to play
- Edit `game.js` for game logic changes
- Edit `index.html` for styling / layout changes
- Edit `highscore.js` for high-score module changes
- Run locally with any simple HTTP server (e.g. `npx serve .`)
- High scores persist in `localStorage` key `snake-highscores`
