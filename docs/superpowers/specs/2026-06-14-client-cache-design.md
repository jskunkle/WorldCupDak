# Request Reduction + Best-Effort Client Cache — Design

**Date:** 2026-06-14
**Status:** Approved

## Goal

Reduce load on the upstream API (worldcup26.ir) and make the dashboard repaint instantly on reload, without adding any server. The dashboard is a static site embedded as a cross-origin iframe on a DAKboard wall display, so all caching must be client-side and must degrade gracefully where iframe storage is blocked.

## Background

Today `src/main.ts` polls on an interval (`config.refreshMs`, default 90s, min 30s) and on tab-visibility resume. Each refresh calls `fetchData()` in `src/api.ts`, which fetches **both** `/get/teams` and `/get/games` and normalizes them to `Team[]` / `Game[]`. Standings and the score feed are computed client-side. On fetch failure, the last-good snapshot stays painted.

Two inefficiencies:

1. Teams data (names, flags, group assignments) barely changes during the tournament, yet it is re-fetched every cycle.
2. A cold start (reload / device wake) paints nothing until the first fetch returns — and the upstream `/get/games` call has been measured at 10–17s.

## Constraints

- **No server.** Pure static site; caching is client-side only.
- **Cross-origin iframe.** `localStorage` may be partitioned (Chromium — persists per top-level site) or blocked/ephemeral (Safari/strict privacy), and access can throw `SecurityError`. Therefore `localStorage` is a best-effort optimization, never load-bearing.
- The in-memory teams optimization must work regardless of storage availability.

## Decisions

- **Teams refresh cadence:** hourly + on cache-miss (re-fetch teams if none cached, if cached ≥ 1h, or if a game references an unknown team id).
- **localStorage instant-paint staleness cap:** 1 hour (ignore cached data older than 1h for the cold-start paint).

## 1. Split the API calls — `src/api.ts`

Replace `fetchData()` with two exports, `fetchTeams(): Promise<Team[]>` and `fetchGames(): Promise<Game[]>`, reusing the existing normalization logic unchanged. This lets the loop poll games without always pulling teams.

## 2. In-memory teams cadence — `src/main.ts` + `src/refresh-policy.ts` (new)

The refresh loop fetches **games every cycle**. Teams are fetched only when needed, decided by a pure helper:

```
needsTeamsRefresh(
  cachedTeamIds: Set<string> | null,
  teamsFetchedAt: number | null,
  games: Game[],
  now: number,
  maxAgeMs: number,
): boolean
```

Returns true when:

- `cachedTeamIds` is null (nothing cached yet), **or**
- `teamsFetchedAt` is null or `now - teamsFetchedAt >= maxAgeMs` (stale), **or**
- any game's `homeId` or `awayId` is not in `cachedTeamIds` (cache-miss).

`src/main.ts` holds `cachedTeams: Team[] | null` and `teamsFetchedAt: number | null` in module scope. Each refresh: fetch games; if `needsTeamsRefresh` is true, fetch teams and update `cachedTeams` + `teamsFetchedAt`; otherwise reuse `cachedTeams`. If the teams fetch fails but `cachedTeams` exists, keep using the cached teams (graceful); if it fails with nothing cached, behave as a failed refresh (keep last-good).

`TEAMS_MAX_AGE_MS = 3_600_000` (1 hour).

## 3. Best-effort localStorage cache — `src/cache.ts` (new)

Single key `wcdak:cache:v1`. Two functions, every storage access wrapped in try/catch:

- `writeCache(teams: Team[], games: Game[], now: number): void` — persists `{ teams, games, fetchedAt: now }` as JSON. No-ops on any error.
- `readCache(maxAgeMs: number, now: number): { teams: Team[]; games: Game[] } | null` — parses the stored JSON; returns null if absent, unparseable, or `now - fetchedAt >= maxAgeMs`. On success, revives each game's `kickoff` from its serialized ISO string back into a `Date`. Returns null on any error.

`CACHE_MAX_AGE_MS = 3_600_000` (1 hour).

Serialization note: `Game.kickoff` is a `Date`; `JSON.stringify` writes it as an ISO string, so `readCache` must map games to `{ ...g, kickoff: new Date(g.kickoff) }`.

## 4. Startup flow — `src/main.ts`

On load, before any network call:

1. `readCache(CACHE_MAX_AGE_MS, Date.now())`.
2. If it returns data: seed `cachedTeams` from it and set `teamsFetchedAt` to now (so the first cycle does not immediately re-fetch teams within the hour, unless a cache-miss forces it); compute the snapshot (`computeStandings` + `buildScoreFeed` with the current time) and paint immediately.
3. Then run the normal `refresh()` + `start()` as today — live data overwrites the seeded paint within a few seconds.

After every successful fetch (games-only or games+teams), call `writeCache(currentTeams, games, Date.now())`.

On a blocked or empty cache, steps 1–2 yield nothing and the panel starts blank exactly as today.

## 5. Behavior preserved

- Fetch-failure handling: last-good snapshot stays painted; no retry storm.
- Visibility pause/resume unchanged.
- All URL-param behavior (groups, grid, detail, scores, theme, highlight, fit, refresh) unchanged.
- With storage disabled, the app behaves exactly as before plus the in-memory teams savings.

## 6. Testing

**Vitest (TDD):**

- `refresh-policy.test.ts` — `needsTeamsRefresh`: null cache → true; stale (`now - fetchedAt >= maxAgeMs`) → true; cache-miss (game references unknown id) → true; fresh + all ids known → false.
- `cache.test.ts` (jsdom provides `localStorage`) — `writeCache` then `readCache` round-trips teams + games with `kickoff` revived to a `Date`; returns null when empty; returns null when older than `maxAgeMs`; `readCache` returns null and `writeCache` does not throw when `localStorage` access throws (simulate by stubbing the global).
- `api.test.ts` — update for the `fetchTeams` / `fetchGames` split, preserving the existing normalization assertions.

**Not unit-tested:** `main.ts` orchestration (covered by the existing e2e suite + a manual smoke test: load with a warm cache and confirm instant paint, then live overwrite).

## Net effect

Steady state drops from 2 requests/cycle to ~1 (games only), plus a teams fetch about once per hour. Instant repaint on reload where storage is permitted; identical-to-today graceful behavior where it is blocked.

## Unresolved questions

None.
