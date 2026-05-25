# AGENTS.md — Project Guide

> **⚠️ Always update this file when making changes to the project.**
> Keep this summary accurate so agents and contributors can quickly understand the codebase.

## Overview

A vanilla **Snake game** — a multi-file browser game built with HTML, CSS, and JavaScript. No build step, no dependencies. Features two game modes (Normal and Enhanced), a Lightning payment rewind system, and a full high-score leaderboard backed by a cloud API.

## Core Files

| File | Purpose |
|------|---------|
| `index.html` | HTML structure, CSS styling, welcome page, modals, UI overlays, PWA manifest link, service worker registration |
| `game.js` | Full game logic: rendering, input, collision, scoring, state history, rewind ("Back in Time"), Wall Breaker, payment integration, responsive canvas, touch controls |
| `highscore.js` | Standalone high-score module: cloud API persistence, save/view modals, leaderboard display, welcome-page integration, responsive replay canvas |
| `sw.js` | Service Worker for PWA offline support — caches core assets |
| `manifest.json` | PWA manifest — app name, icons, theme color, standalone display mode |
| `icon-192.png` / `icon-512.png` | PWA app icons (192×192, 512×512) |

## Key Mechanics

- **Canvas rendering** — 25×25 grid, **responsive** tile size (10–24px, auto-scaled), gradient snake body, glowing food, particle effects
- **Input** — Arrow keys and WASD, touch swipe (30px threshold), long-press Wall Breaker (Enhanced mode), with 180° turn prevention
- **Game loop** — `setInterval` at 100ms (10 fps)
- **Collision** — wall boundaries and self-intersection trigger game over
- **State history** — last 100 states saved as snapshots (`{ snake, food, walls }`)
- **"Back in Time" rewind** — on game over, shows a step-by-step rewind animation through saved states, then a countdown before resuming
- **Two game modes**: Normal (walls wrap around edges) and Enhanced (walls appear, oranges grant bonus growth)
- **Wall Breaker** (Enhanced Mode) — press **X** to smash through walls for 3 seconds; costs 5 segments, 100s cooldown
- **Food types**: Apple (+1 segment, common) and Orange (+10 segments over 10 frames, rare in Enhanced mode)
- **Particle effects** — flame particles from snake tail during Wall Breaker, explosion sparks on wall destruction
- **High scores** — saved/loaded via cloud API at `https://rewind-snake.fly.dev`; top 20 per mode; sorted by score desc then steps asc
- **Welcome page** — mode selection cards (Normal / Enhanced) with animated transitions

## UI Layout

- Dark-themed (`#1a1a2e` / `#16213e` / `#0f3460` palette) with accent colors (`#e94560` red, `#4ecca3` green, `#f5a623` orange)
- **Responsive design** — canvas auto-scales to fit screen; `clamp()` countdown font; `touch-action: none` on canvas; `overflow-y: auto` for scrollable welcome page
- **PWA** — installable as an app (`standalone` display mode); offline support via service worker
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
- Edit `game.js` for game logic changes (responsive canvas, touch controls, rendering)
- Edit `index.html` for styling / layout changes (responsive CSS, PWA meta tags)
- Edit `highscore.js` for high-score module changes (responsive replay canvas)
- Edit `sw.js` for service worker cache strategy
- Edit `manifest.json` for PWA metadata (name, icons, colors)
- Edit `backend/server.js` for backend API changes
- Run locally with any simple HTTP server (e.g. `npx serve .`)
- Backend runs on fly.io at `https://rewind-snake.fly.dev` with SQLite storage
- High scores are saved/loaded via the cloud API (no localStorage)
- Mobile: canvas uses dynamic `tileSize` (10–24px); touch controls on canvas; PWA installable
