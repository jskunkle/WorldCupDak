# Request Reduction + Client Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut upstream API load (poll games every cycle, refresh teams ~hourly) and repaint instantly on reload via a best-effort `localStorage` cache that degrades gracefully in storage-blocked iframes.

**Architecture:** Split `api.ts` into `fetchTeams`/`fetchGames`. A pure `needsTeamsRefresh` policy decides when to re-pull teams (none cached / ≥1h old / cache-miss). A `cache.ts` module persists the last fetch to `localStorage` (all access try/catch-guarded) and revives `Date` fields on read. `main.ts` orchestrates: seed-from-cache on load for instant paint, poll games, conditionally refresh teams, write cache after each fetch.

**Tech Stack:** TypeScript, Vite, vanilla DOM. Vitest (jsdom — provides `localStorage`) for unit tests, Playwright for e2e. Prettier (`pnpm format`).

**Conventions (match existing code):**

- Unit tests in `tests/*.test.ts`, import `{ describe, it, expect }` (and `vi` where needed) from `vitest`.
- 2-space indent, double quotes, trailing commas.
- Run unit tests: `pnpm test`. If `pnpm` errors with "mise", use `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run`.
- Typecheck: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc --noEmit`. Build: add `&& mise exec node@22.22.2 -- node node_modules/vite/bin/vite.js build`.

**Branch:** Work continues on `feat/client-cache` (already created; spec committed there).

---

## File Structure

**Create:**

- `src/refresh-policy.ts` — pure `needsTeamsRefresh(...)`. No DOM, no I/O.
- `src/cache.ts` — `readCache`/`writeCache` (localStorage persistence + Date revival), try/catch-guarded.
- `tests/refresh-policy.test.ts` — tests for `needsTeamsRefresh`.
- `tests/cache.test.ts` — tests for `readCache`/`writeCache`.

**Modify:**

- `src/api.ts` — replace `fetchData`/`ApiData` with `fetchTeams()` and `fetchGames()`.
- `tests/api.test.ts` — replace the `fetchData` tests with `fetchTeams`/`fetchGames` tests.
- `src/main.ts` — orchestrate teams cadence, cache seed, write-after-fetch.

---

## Task 1: Split the API into `fetchTeams` / `fetchGames`

**Files:**

- Modify: `src/api.ts`
- Test: `tests/api.test.ts`

- [ ] **Step 1: Replace the `fetchData` test block with split-function tests**

In `tests/api.test.ts`, change the import line:

```ts
import {
  normalizeTeams,
  normalizeGames,
  fetchTeams,
  fetchGames,
} from "../src/api";
```

Then DELETE the entire `describe("fetchData", () => { ... })` block (lines 75–108 in the current file) and replace it with:

```ts
function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("fetchTeams", () => {
  it("fetches the teams endpoint and returns normalized teams", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse({ teams: [rawTeam] });
    }) as unknown as typeof fetch;

    const teams = await fetchTeams(fakeFetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/get/teams");
    expect(teams[0].code).toBe("MEX");
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse({ teams: [] }, false, 500)) as unknown as typeof fetch;
    await expect(fetchTeams(fakeFetch)).rejects.toThrow();
  });
});

describe("fetchGames", () => {
  it("fetches the games endpoint and returns normalized games", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse({ games: [finishedGame] });
    }) as unknown as typeof fetch;

    const games = await fetchGames(fakeFetch);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("/get/games");
    expect(games[0].homeScore).toBe(2);
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse({ games: [] }, false, 500)) as unknown as typeof fetch;
    await expect(fetchGames(fakeFetch)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the api tests to verify they fail**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/api.test.ts`
Expected: FAIL — `fetchTeams`/`fetchGames` are not exported (and `fetchData` import removed).

- [ ] **Step 3: Replace `fetchData`/`ApiData` in `src/api.ts`**

In `src/api.ts`, DELETE the `ApiData` interface and the `fetchData` function (current lines 40–64) and replace them with:

```ts
// I/O wrappers. fetchImpl is injectable for tests.
export async function fetchTeams(
  fetchImpl: typeof fetch = fetch,
): Promise<Team[]> {
  const res = await fetchImpl(`${BASE_URL}/get/teams`);
  if (!res.ok) throw new Error(`API error: teams ${res.status}`);
  const json = (await res.json()) as { teams: RawTeam[] };
  return normalizeTeams(json.teams);
}

export async function fetchGames(
  fetchImpl: typeof fetch = fetch,
): Promise<Game[]> {
  const res = await fetchImpl(`${BASE_URL}/get/games`);
  if (!res.ok) throw new Error(`API error: games ${res.status}`);
  const json = (await res.json()) as { games: RawGame[] };
  return normalizeGames(json.games);
}
```

Leave `normalizeTeams`, `normalizeGames`, `parseKickoff`, `BASE_URL`, and the imports unchanged. (`Team` and `Game` are already imported at the top of the file.)

- [ ] **Step 4: Confirm nothing else references the removed symbols**

Run: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc --noEmit`
Expected: It MAY report errors in `src/main.ts` (which still imports `fetchData`) — that is fine and expected; Task 4 rewrites `main.ts`. There must be NO errors in `src/api.ts` or `tests/api.test.ts`. If any other file references `fetchData`/`ApiData`, note it; only `main.ts` should.

- [ ] **Step 5: Run the api tests to verify they pass**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/api.test.ts`
Expected: PASS (normalize tests still green; new fetch tests green).

- [ ] **Step 6: Commit**

```bash
git add src/api.ts tests/api.test.ts
git commit -m "feat: split fetchData into fetchTeams and fetchGames"
```

---

## Task 2: `needsTeamsRefresh` policy

**Files:**

- Create: `src/refresh-policy.ts`
- Test: `tests/refresh-policy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/refresh-policy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { needsTeamsRefresh } from "../src/refresh-policy";
import type { Game } from "../src/types";

function game(homeId: string, awayId: string): Game {
  return {
    id: `${homeId}-${awayId}`,
    homeId,
    awayId,
    homeName: homeId,
    awayName: awayId,
    homeScore: 0,
    awayScore: 0,
    group: "A",
    matchday: 1,
    kickoff: new Date(2026, 5, 11, 12, 0),
    finished: false,
    isGroupStage: true,
  };
}

const HOUR = 3_600_000;

describe("needsTeamsRefresh", () => {
  it("returns true when nothing is cached", () => {
    expect(needsTeamsRefresh(null, null, [], 0, HOUR)).toBe(true);
  });

  it("returns true when the cache is at or past maxAgeMs", () => {
    const ids = new Set(["1", "2"]);
    expect(needsTeamsRefresh(ids, 0, [game("1", "2")], HOUR, HOUR)).toBe(true);
  });

  it("returns true when a game references an unknown team id", () => {
    const ids = new Set(["1", "2"]);
    expect(needsTeamsRefresh(ids, 0, [game("1", "9")], 1000, HOUR)).toBe(true);
  });

  it("returns false when fresh and all team ids are known", () => {
    const ids = new Set(["1", "2"]);
    expect(needsTeamsRefresh(ids, 0, [game("1", "2")], 1000, HOUR)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/refresh-policy.test.ts`
Expected: FAIL — cannot resolve `../src/refresh-policy`.

- [ ] **Step 3: Implement**

Create `src/refresh-policy.ts`:

```ts
import type { Game } from "./types";

/**
 * True when the teams list should be re-fetched: nothing cached yet, the cache
 * has reached maxAgeMs, or a game references a team id we don't have cached.
 */
export function needsTeamsRefresh(
  cachedTeamIds: Set<string> | null,
  teamsFetchedAt: number | null,
  games: Game[],
  now: number,
  maxAgeMs: number,
): boolean {
  if (cachedTeamIds === null || teamsFetchedAt === null) return true;
  if (now - teamsFetchedAt >= maxAgeMs) return true;
  for (const g of games) {
    if (!cachedTeamIds.has(g.homeId) || !cachedTeamIds.has(g.awayId)) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/refresh-policy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/refresh-policy.ts tests/refresh-policy.test.ts
git commit -m "feat: add needsTeamsRefresh policy"
```

---

## Task 3: `cache.ts` — best-effort localStorage

**Files:**

- Create: `src/cache.ts`
- Test: `tests/cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readCache, writeCache } from "../src/cache";
import type { Team, Game } from "../src/types";

const teams: Team[] = [
  { id: "1", name: "Mexico", code: "MEX", flagUrl: "f/mx", group: "A" },
];

const games: Game[] = [
  {
    id: "1",
    homeId: "1",
    awayId: "2",
    homeName: "Mexico",
    awayName: "RSA",
    homeScore: 2,
    awayScore: 0,
    group: "A",
    matchday: 1,
    kickoff: new Date(2026, 5, 11, 13, 0),
    finished: true,
    isGroupStage: true,
  },
];

const HOUR = 3_600_000;

describe("cache", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips teams and games, reviving kickoff as a Date", () => {
    writeCache(teams, games, 1000);
    const out = readCache(HOUR, 1000)!;
    expect(out).not.toBeNull();
    expect(out.teams).toEqual(teams);
    expect(out.games[0].kickoff).toBeInstanceOf(Date);
    expect(out.games[0].kickoff.getTime()).toBe(games[0].kickoff.getTime());
    expect(out.games[0].homeScore).toBe(2);
  });

  it("returns null when nothing is stored", () => {
    expect(readCache(HOUR, 1000)).toBeNull();
  });

  it("returns null when the cache is at or past maxAgeMs", () => {
    writeCache(teams, games, 0);
    expect(readCache(HOUR, HOUR)).toBeNull();
  });

  it("does not throw and returns null when localStorage access throws", () => {
    const getSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    expect(() => writeCache(teams, games, 1000)).not.toThrow();
    expect(readCache(HOUR, 1000)).toBeNull();

    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/cache.test.ts`
Expected: FAIL — cannot resolve `../src/cache`.

- [ ] **Step 3: Implement**

Create `src/cache.ts`:

```ts
import type { Team, Game } from "./types";

const CACHE_KEY = "wcdak:cache:v1";

interface CachedPayload {
  teams: Team[];
  games: Game[];
  fetchedAt: number;
}

/**
 * Best-effort persist of the last successful fetch. No-ops on any storage
 * error (blocked/partitioned iframe, quota, serialization).
 */
export function writeCache(teams: Team[], games: Game[], now: number): void {
  try {
    const payload: CachedPayload = { teams, games, fetchedAt: now };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable — caching is best-effort only.
  }
}

/**
 * Returns the cached teams/games if present and younger than maxAgeMs, with
 * each game's kickoff revived from its serialized string into a Date.
 * Returns null when absent, stale, or storage is unavailable/unparseable.
 */
export function readCache(
  maxAgeMs: number,
  now: number,
): { teams: Team[]; games: Game[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const payload = JSON.parse(raw) as CachedPayload;
    if (
      typeof payload.fetchedAt !== "number" ||
      now - payload.fetchedAt >= maxAgeMs
    ) {
      return null;
    }
    const games = payload.games.map((g) => ({
      ...g,
      kickoff: new Date(g.kickoff),
    }));
    return { teams: payload.teams, games };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run it to verify pass**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/cache.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cache.ts tests/cache.test.ts
git commit -m "feat: add best-effort localStorage cache"
```

---

## Task 4: Wire caching + teams cadence into `main.ts`

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Replace the ENTIRE contents of `src/main.ts` with:**

```ts
import { fetchTeams, fetchGames } from "./api";
import { computeStandings, buildScoreFeed, filterGroups } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import { parseConfig, deriveGrid } from "./config";
import { fitToViewport } from "./fit";
import { needsTeamsRefresh } from "./refresh-policy";
import { readCache, writeCache } from "./cache";
import type { Snapshot, Team, Game } from "./types";

const config = parseConfig(window.location.search);

const TEAMS_MAX_AGE_MS = 3_600_000; // refresh teams at most hourly
const CACHE_MAX_AGE_MS = 3_600_000; // use cached data for instant paint if < 1h old

const appEl = document.getElementById("app")!;
const groupsEl = document.getElementById("groups")!;
const scoresEl = document.getElementById("scores")!;

// Apply one-time config to the DOM.
document.documentElement.setAttribute("data-theme", config.theme);
appEl.setAttribute("data-fit", config.fit ? "on" : "off");
if (!config.scores) scoresEl.style.display = "none";

let cachedTeams: Team[] | null = null;
let teamsFetchedAt: number | null = null;
let lastGood: Snapshot | null = null;
let timer: number | undefined;
let resizeTimer: number | undefined;

function buildSnapshot(teams: Team[], games: Game[]): Snapshot {
  return {
    groups: filterGroups(computeStandings(teams, games), config.groups),
    feed: buildScoreFeed(games, new Date(), {
      maxUpcoming: config.upcoming,
      maxFinished: config.finished,
    }),
  };
}

async function refresh(): Promise<void> {
  try {
    const games = await fetchGames();
    const ids = cachedTeams ? new Set(cachedTeams.map((t) => t.id)) : null;
    if (
      needsTeamsRefresh(
        ids,
        teamsFetchedAt,
        games,
        Date.now(),
        TEAMS_MAX_AGE_MS,
      )
    ) {
      try {
        cachedTeams = await fetchTeams();
        teamsFetchedAt = Date.now();
      } catch (err) {
        // No teams at all → can't render; fail this cycle. Otherwise reuse cache.
        if (cachedTeams === null) throw err;
        console.error("Teams refresh failed; reusing cached teams.", err);
      }
    }
    const teams = cachedTeams!;
    lastGood = buildSnapshot(teams, games);
    writeCache(teams, games, Date.now());
    paint(lastGood);
  } catch (err) {
    console.error("Refresh failed; keeping last-good data.", err);
    // Intentionally do not clear the screen — lastGood stays painted.
  }
}

function paint(s: Snapshot): void {
  const grid = deriveGrid(s.groups.length, config.cols, config.rows);
  groupsEl.style.setProperty("--cols", String(grid.cols));
  groupsEl.style.setProperty("--rows", String(grid.rows));

  renderStandings(groupsEl, s.groups, {
    detail: config.detail,
    highlight: config.highlight,
  });
  if (config.scores) renderScoreFeed(scoresEl, s.feed);
  if (config.fit) fitToViewport(appEl);
}

// Paint instantly from a fresh-enough cache before the first network round-trip.
function seedFromCache(): void {
  const cached = readCache(CACHE_MAX_AGE_MS, Date.now());
  if (!cached) return;
  cachedTeams = cached.teams;
  teamsFetchedAt = Date.now();
  lastGood = buildSnapshot(cached.teams, cached.games);
  paint(lastGood);
}

function start(): void {
  if (timer !== undefined) return;
  timer = window.setInterval(refresh, config.refreshMs);
}

function stop(): void {
  if (timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stop();
  } else {
    void refresh();
    start();
  }
});

window.addEventListener("resize", () => {
  if (!config.fit) return;
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => fitToViewport(appEl), 150);
});

seedFromCache();
void refresh();
start();
```

- [ ] **Step 2: Typecheck**

Run: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS, no errors anywhere (no unused imports, `fetchData` fully gone).

- [ ] **Step 3: Run the full unit suite**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run`
Expected: PASS — api, cache, refresh-policy, config, fit, render, standings all green.

- [ ] **Step 4: Production build**

Run: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc && mise exec node@22.22.2 -- node node_modules/vite/bin/vite.js build`
Expected: PASS.

- [ ] **Step 5: Format**

Run: `pnpm format` (or `mise exec node@22.22.2 -- node node_modules/prettier/bin/prettier.cjs --write "src/**/*.ts" "tests/**/*.ts"`).

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: poll games, refresh teams hourly, seed from localStorage cache"
```

---

## Final Verification

- [ ] **Step 1: Full unit suite**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run`
Expected: all suites PASS (including the new cache + refresh-policy + api tests).

- [ ] **Step 2: Build**

Run: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc && mise exec node@22.22.2 -- node node_modules/vite/bin/vite.js build`
Expected: PASS.

- [ ] **Step 3: e2e (unchanged externally — confirm no regression)**

Run: `pnpm e2e` (or `mise exec node@22.22.2 -- node node_modules/@playwright/test/cli.js test`)
Expected: PASS. The dashboard's external behavior is unchanged; this confirms the split fetch + cache seeding didn't break rendering. (Upstream API is slow, ~10–17s; the suite already uses a 30s expect timeout.)

- [ ] **Step 4: Manual smoke (recommended)**

Run `pnpm dev`, then:

- Load `/` once (populates the cache). Reload — confirm the board paints **immediately** from cache, then updates when the live fetch returns a few seconds later.
- Open DevTools → Network: confirm steady-state refreshes hit `/get/games` each cycle and `/get/teams` only on first load (not every cycle).
- DevTools → Application → Local Storage: confirm a `wcdak:cache:v1` entry exists and updates.

---

## Self-Review Notes (author check — completed)

- **Spec coverage:** API split → Task 1. `needsTeamsRefresh` (null/stale/cache-miss/fresh) → Task 2. `readCache`/`writeCache` with Date revival + try/catch + staleness → Task 3. Teams cadence + seed-from-cache + write-after-fetch + preserved failure/visibility/param behavior → Task 4. Testing for all pure/storage units → Tasks 1–3; orchestration via e2e + manual smoke → Final Verification.
- **Type consistency:** `fetchTeams()/fetchGames()` return `Team[]/Game[]`; `needsTeamsRefresh(cachedTeamIds: Set<string> | null, teamsFetchedAt: number | null, games, now, maxAgeMs)`; `readCache(maxAgeMs, now) → { teams, games } | null`; `writeCache(teams, games, now)`. Signatures identical across main.ts and tests.
- **No placeholders:** every code step is complete.
- **Note:** both max-age constants are 1h but kept distinct (`TEAMS_MAX_AGE_MS`, `CACHE_MAX_AGE_MS`) since they govern different concerns. Seeding sets `teamsFetchedAt = now` (not the cache's original timestamp) — teams can therefore be up to ~2h old before a forced refresh, acceptable since cache-miss covers unknown teams and teams rarely change.

## Unresolved questions

None.
