# World Cup 2026 → DAKboard Dashboard — Design

_Date: 2026-06-14_

A self-hosted static web page showing live FIFA World Cup 2026 group standings
(ESPN-style) and scores, embedded as an iframe on a DAKboard wall display. Dark
theme, all 12 groups visible at once, with a pinned live/recent-scores strip,
auto-refreshing.

## Decisions (settled during brainstorming)

- **Layout:** All 12 groups visible at once in a **2 × 6 grid** — no rotation.
  Data updates in place. Full columns: rank, flag, FIFA code, GP, W, D, L, GF,
  GA, GD, Pts. Top 2 of each group highlighted (advancing positions).
- **Stack:** TypeScript + Vite, no UI framework. Builds to a static bundle.
- **Data source:** **worldcup26.ir**, called directly from the browser
  (CORS `*`, no token required). Chosen over football-data.org because it needs
  no server, no API key, no cold-start, and was verified returning genuinely
  current data over HTTPS on 2026-06-14.
- **Deploy:** Render **Static Site** (always-on, free, no cold-start, HTTPS).

### Why not football-data.org

It would give built-in standings + flags, but requires an API key, a
Node/Express proxy on Render (free tier cold-starts ~30–60s, needs an uptime
pinger), and its free tier may not cover the World Cup competition. The
static-site path is simpler and always-on.

## Data source details (verified 2026-06-14)

Base URL: `https://worldcup26.ir` — HTTPS works, `CORS_ORIGINS=*`, no auth.

| Endpoint       | Use                                                              |
| -------------- | --------------------------------------------------------------- |
| `/get/teams`   | `team_id → { fifaCode, flagUrl, nameEn, group }`. Flags are HTTPS `flagcdn.com` URLs. |
| `/get/games`   | Full 104-match schedule + scores. **Source of truth.**         |
| `/get/groups`  | Group rosters (so all 4 teams show before any match is played). |

Verified behaviour:

- Only past matches are marked `finished` with scores; future matches are not —
  i.e. data is live, not pre-fabricated.
- The API's own `/get/groups` standings are **all 0-0-0** (their aggregation is
  broken) — **so we compute standings ourselves** from finished games.
- Match state field `time_elapsed` observed only as `notstarted` / `finished`;
  no in-match minute marker seen. A truly live match may not show a running
  score until it finishes (documented risk).
- The `scorers` field is messy (mixed straight/curly quotes) — parse
  defensively; not required for the core UI.

## Architecture

Static bundle, all logic client-side. Fetch on load and every **90s**.

```
main.ts ── orchestrates: initial load, 90s refresh, last-good fallback
  ├── api.ts        fetch + normalize the 3 endpoints into typed objects
  ├── standings.ts  computeStandings(), buildScoreFeed()  (pure, tested)
  └── render.ts     paint 2×6 grid + scores strip, diff-update in place
```

### Modules

- **`api.ts`** — fetches `/get/teams`, `/get/games`, `/get/groups`; normalizes
  (string→number coercion, defensive `scorers` parse) into typed `Team`,
  `Game`, `GroupRoster` objects.
- **`standings.ts`** — pure functions, no I/O:
  - `computeStandings(teams, games)` → per-group tables sorted by
    **Pts → GD → GF**, including teams with zero games played.
  - `buildScoreFeed(games, now)` → ordered list of finished-today + live +
    next-up matches for the strip.
- **`render.ts`** — renders the 2×6 grid and the pinned scores strip; updates
  the DOM in place (no full re-render, no flicker). Per-flag `onerror` falls
  back to the FIFA code text.
- **`main.ts`** — initial load → render; `setInterval` 90s refresh; holds a
  `lastGood` snapshot; pauses the timer on `visibilitychange` hidden and
  resumes on visible (single interval, no leaks).

## UI

- 2×6 grid, all 12 groups, full ESPN columns, top-2 highlighted, real flags.
- Dark, high-contrast theme, legible across a room.
- Scores strip pinned at the bottom (label + finished/live/next matches).
- Responsive to a landscape DAKboard iframe block.

## Error handling / resilience

- All rendering is driven from an in-memory `lastGood` snapshot.
- A failed or partial fetch logs and reuses `lastGood` rather than blanking.
- Flag image load failure falls back to the FIFA code text.
- Single refresh interval, paused when the tab/iframe is hidden — designed to
  run a full day on the wall without leaking memory or blanking on transient
  API errors.

## Testing

- **Vitest (TDD, write first):**
  - `standings.ts` — early-tournament all-0-0-0 case, tiebreakers
    (Pts/GD/GF), partial group, full group; `buildScoreFeed` ordering.
  - `api.ts` — normalization against captured real fixtures.
- **Playwright (one test):** load the built page, assert all 12 group headers
  (A–L) are visible and the scores strip renders.

## Deploy

1. Push repo to GitHub (`https://github.com/jskunkle/WorldCupDak`).
2. Render **Static Site** from the repo: build `pnpm build`, publish `dist/`.
3. Paste the public HTTPS URL into a DAKboard **Website/iframe** block on a
   Custom Screen; size/position it.

## Acceptance criteria

- Loads over HTTPS and renders inside a DAKboard iframe block.
- All 12 group tables appear in the 2×6 grid with correct computed standings.
- Finished matches show real scorelines; data refreshes without a page reload.
- Runs a full day on the wall without leaking memory or blanking on transient
  API errors.

## Known risks

1. worldcup26.ir is a hobby API (~2 GitHub stars) — could degrade mid-tournament.
   Mitigated by last-good display and an isolated `api.ts` we could repoint to
   football-data.org later if needed.
2. No confirmed in-match live minute/score — live matches may only appear once
   finished.

## Unresolved questions

- None blocking. (Live in-match behaviour will be observed once a match is
  actually in progress during testing.)
