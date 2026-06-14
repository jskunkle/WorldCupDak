# WorldCupDak

A self-hosted static dashboard showing live **FIFA World Cup 2026** group
standings (ESPN-style) and scores, designed to embed as an iframe on a
[DAKboard](https://dakboard.com) wall display.

- All 12 groups visible at once in a dark, high-contrast **2 × 6 grid** (no rotation)
- A pinned strip of live / recently-finished scores
- Auto-refreshes every ~90s with no full-page reload
- Standings computed client-side from live match data
- Deployed as a static site (always-on, HTTPS, no server, no cold-start)

## Status

Design stage. See the design spec:
[`docs/superpowers/specs/2026-06-14-worldcup-dakboard-design.md`](docs/superpowers/specs/2026-06-14-worldcup-dakboard-design.md).

## Stack

TypeScript + Vite (no UI framework). Vitest for unit tests, Playwright for e2e.

## Data source

[worldcup26.ir](https://worldcup26.ir) — called directly from the browser
(public, CORS-open, no token). Standings are computed locally because the API's
own standings aggregation returns zeros.
