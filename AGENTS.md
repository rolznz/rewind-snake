# AGENTS.md — Project Guide

> **⚠️ Always update this file when making changes to the project.**
> Keep this summary accurate so agents and contributors can quickly understand the codebase.

## Overview

A vanilla **Snake game** — a single-file browser game built with HTML, CSS, and JavaScript. No build step, no dependencies.

## Core Files

| File | Purpose |
|------|---------|
| `index.html` | HTML structure, CSS styling, and UI overlay elements (game-over popup, undo popup, countdown) |
| `game.js` | Full game logic: rendering, input, collision, scoring, state history, and rewind ("Back in Time") feature |

## Key Mechanics

- **Canvas rendering** — 25×25 grid, 20px tiles, gradient snake body, glowing food
- **Input** — Arrow keys and WASD, with 180° turn prevention
- **Game loop** — `setInterval` at 100ms (10 fps)
- **Collision** — wall boundaries and self-intersection trigger game over
- **State history** — last 100 states saved as snapshots (`{ snake, food }`)
- **"Back in Time" rewind** — on game over, shows a step-by-step rewind animation through saved states, then a countdown before resuming

## UI Layout

- Dark-themed (`#1a1a2e` / `#16213e` / `#0f3460` palette)
- Title, score, canvas, message area, restart button, undo button
- Modal popup for rewind step selection
- Countdown overlay (3-2-1-Go!)

## Payment Rewind

When game over, the "Back in Time" feature requires payment before rewinding:

- **Cost**: 100 sats per step (e.g., 5 steps = 500 sats)
- **Recipient**: `rolznz@getalby.com` (Alby wallet)
- **Flow**: User enters steps → sees cost → clicks "Pay & Rewind" → Bitcoin Connect payment modal opens → user pays → rewind animation plays → countdown → game resumes
- **Tech**: Uses `@getalby/bitcoin-connect` (CDN) for payment modal and `@getalby/lightning-tools` (dynamic import) for invoice generation via LNURL
- **State**: `paymentLoading` prevents double-clicks; toast notifications show errors

## Skills (`.agents/skills/`)

- **alby-bitcoin-builder** — Bitcoin lightning wallet integration (Nostr Wallet Connect, LNURL, fiat conversion)
- **alby-bitcoin-payments** — Lightning wallet operations (send/receive, balance, invoices, fiat)

These skills are installed but not yet wired into the game. They provide scaffolding for adding bitcoin/lightning payment features later.

## Development Notes

- No toolchain or dependencies — open `index.html` in a browser to play
- Edit `game.js` for game logic changes
- Edit `index.html` for styling / layout changes
- Run locally with any simple HTTP server (e.g. `npx serve .`)
