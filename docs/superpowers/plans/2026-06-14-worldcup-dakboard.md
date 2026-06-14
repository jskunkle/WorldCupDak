# World Cup 2026 DAKboard Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static TypeScript dashboard showing all 12 FIFA World Cup 2026 group standings in a 2×6 grid plus a pinned live/recent scores strip, auto-refreshing from worldcup26.ir, deployable as a Render Static Site embeddable in a DAKboard iframe.

**Architecture:** All logic runs client-side. Pure functions normalize the API JSON, compute standings from finished group matches, and build a score feed; a thin render layer paints the DOM and updates it in place every 90s. A `lastGood` snapshot keeps the wall populated through transient API failures.

**Tech Stack:** TypeScript, Vite, Vitest (unit, jsdom), Playwright (e2e), pnpm.

---

## Data source reference (verified 2026-06-14)

Base URL `https://worldcup26.ir`, CORS-open, no auth. Endpoints used:

- `GET /get/teams` → `{ teams: RawTeam[] }` (48 teams; carries group + flag URL)
- `GET /get/games` → `{ games: RawGame[] }` (104 matches; source of truth)

`/get/groups` is **not used** — its standings are all zero and team group
membership is already on each team via `groups`.

Real object shapes:

```jsonc
// RawTeam
{ "_id":"679c9c6b5749c4077500ea01", "name_en":"Mexico", "name_fa":"مکزیک",
  "flag":"https://flagcdn.com/w80/mx.png", "fifa_code":"MEX", "iso2":"MX",
  "groups":"A", "id":"1" }

// RawGame
{ "_id":"679c9c8a5749c4077500e001", "id":"1", "home_team_id":"1", "away_team_id":"2",
  "home_score":"2", "away_score":"0", "home_scorers":"{...}", "away_scorers":"null",
  "group":"A", "matchday":"1", "local_date":"06/11/2026 13:00",
  "persian_date":"1405-03-21 13:00", "stadium_id":"1", "finished":"TRUE",
  "time_elapsed":"finished", "type":"group",
  "home_team_name_en":"Mexico", "away_team_name_en":"South Africa", ... }
```

Notes the code must handle:

- All numeric fields are **strings** → coerce to number.
- `finished` is the string `"TRUE"`/`"FALSE"`.
- `time_elapsed` observed only as `"notstarted"`/`"finished"` (no live minute).
- `local_date` is `MM/DD/YYYY HH:mm`.
- `type` is `"group"` for group matches; standings count group matches only.

---

## File structure

```
WorldCupDak/
├── index.html              # Vite entry; mounts #app
├── package.json
├── tsconfig.json
├── vite.config.ts          # Vite + Vitest (jsdom) config
├── playwright.config.ts
├── src/
│   ├── types.ts            # Raw API + domain types
│   ├── api.ts              # fetchData() I/O + pure normalizeTeams/normalizeGames
│   ├── standings.ts        # pure computeStandings(), buildScoreFeed()
│   ├── render.ts           # renderStandings(), renderScoreFeed() DOM painters
│   ├── main.ts             # orchestration: load, 90s refresh, lastGood, visibility
│   └── styles.css          # dark 2×6 grid theme
├── tests/
│   ├── api.test.ts
│   ├── standings.test.ts
│   └── render.test.ts
└── e2e/
    └── dashboard.spec.ts
```

---

## Task 1: Project scaffold

**Files:**

- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts` (placeholder)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "worldcupdak",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "jsdom": "^25.0.0",
    "prettier": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src", "tests", "e2e"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>World Cup 2026</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="app">
      <main id="groups" class="groups"></main>
      <footer id="scores" class="scores"></footer>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create placeholder `src/main.ts`**

```ts
// Wired up in Task 7.
console.log("WorldCupDak loading…");
```

- [ ] **Step 6: Install and verify build tooling**

Run: `pnpm install`
Then: `pnpm build`
Expected: `tsc` passes and Vite writes `dist/` with no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/main.ts pnpm-lock.yaml
git commit -m "chore: scaffold Vite + TypeScript + Vitest project"
```

---

## Task 2: Domain & API types

**Files:**

- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
// Raw shapes exactly as worldcup26.ir returns them (all values are strings).
export interface RawTeam {
  id: string;
  name_en: string;
  flag: string;
  fifa_code: string;
  iso2: string;
  groups: string;
}

export interface RawGame {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  group: string;
  matchday: string;
  local_date: string;
  finished: string; // "TRUE" | "FALSE"
  time_elapsed: string;
  type: string; // "group" for group-stage matches
  home_team_name_en: string;
  away_team_name_en: string;
}

// Normalized domain types used everywhere else.
export interface Team {
  id: string;
  name: string;
  code: string; // FIFA code, e.g. "MEX"
  flagUrl: string;
  group: string; // "A".."L"
}

export interface Game {
  id: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  group: string;
  matchday: number;
  kickoff: Date;
  finished: boolean;
  isGroupStage: boolean;
}

export interface StandingRow {
  rank: number;
  teamId: string;
  code: string;
  name: string;
  flagUrl: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface GroupTable {
  group: string; // "A".."L"
  rows: StandingRow[];
}

export type FeedKind = "live" | "finished" | "upcoming";

export interface FeedMatch {
  id: string;
  kind: FeedKind;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  kickoff: Date;
}

export interface Snapshot {
  groups: GroupTable[];
  feed: FeedMatch[];
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add raw and domain types"
```

---

## Task 3: API normalization (`normalizeTeams`, `normalizeGames`)

**Files:**

- Create: `src/api.ts`
- Test: `tests/api.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { normalizeTeams, normalizeGames } from "../src/api";
import type { RawTeam, RawGame } from "../src/types";

const rawTeam: RawTeam = {
  id: "1",
  name_en: "Mexico",
  flag: "https://flagcdn.com/w80/mx.png",
  fifa_code: "MEX",
  iso2: "MX",
  groups: "A",
};

const finishedGame: RawGame = {
  id: "1",
  home_team_id: "1",
  away_team_id: "2",
  home_score: "2",
  away_score: "0",
  group: "A",
  matchday: "1",
  local_date: "06/11/2026 13:00",
  finished: "TRUE",
  time_elapsed: "finished",
  type: "group",
  home_team_name_en: "Mexico",
  away_team_name_en: "South Africa",
};

describe("normalizeTeams", () => {
  it("maps raw fields to the domain Team", () => {
    const [t] = normalizeTeams([rawTeam]);
    expect(t).toEqual({
      id: "1",
      name: "Mexico",
      code: "MEX",
      flagUrl: "https://flagcdn.com/w80/mx.png",
      group: "A",
    });
  });
});

describe("normalizeGames", () => {
  it("coerces strings to numbers/booleans and parses the date", () => {
    const [g] = normalizeGames([finishedGame]);
    expect(g.homeScore).toBe(2);
    expect(g.awayScore).toBe(0);
    expect(g.finished).toBe(true);
    expect(g.isGroupStage).toBe(true);
    expect(g.matchday).toBe(1);
    expect(g.kickoff.getFullYear()).toBe(2026);
    expect(g.kickoff.getMonth()).toBe(5); // June (0-based)
    expect(g.kickoff.getDate()).toBe(11);
  });

  it("treats finished other than 'TRUE' as not finished", () => {
    const [g] = normalizeGames([{ ...finishedGame, finished: "FALSE" }]);
    expect(g.finished).toBe(false);
  });

  it("marks non-group types as not group stage", () => {
    const [g] = normalizeGames([{ ...finishedGame, type: "round_of_32" }]);
    expect(g.isGroupStage).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/api.test.ts`
Expected: FAIL — cannot find module `../src/api` / functions undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { RawTeam, RawGame, Team, Game } from "./types";

const BASE_URL = "https://worldcup26.ir";

export function normalizeTeams(raw: RawTeam[]): Team[] {
  return raw.map((t) => ({
    id: t.id,
    name: t.name_en,
    code: t.fifa_code,
    flagUrl: t.flag,
    group: t.groups,
  }));
}

// Parses "MM/DD/YYYY HH:mm" as local time.
function parseKickoff(s: string): Date {
  const [datePart, timePart = "00:00"] = s.trim().split(" ");
  const [mm, dd, yyyy] = datePart.split("/").map(Number);
  const [hh, min] = timePart.split(":").map(Number);
  return new Date(yyyy, mm - 1, dd, hh, min);
}

export function normalizeGames(raw: RawGame[]): Game[] {
  return raw.map((g) => ({
    id: g.id,
    homeId: g.home_team_id,
    awayId: g.away_team_id,
    homeName: g.home_team_name_en,
    awayName: g.away_team_name_en,
    homeScore: Number(g.home_score),
    awayScore: Number(g.away_score),
    group: g.group,
    matchday: Number(g.matchday),
    kickoff: parseKickoff(g.local_date),
    finished: g.finished === "TRUE",
    isGroupStage: g.type === "group",
  }));
}

export interface ApiData {
  teams: Team[];
  games: Game[];
}

// I/O wrapper. fetchImpl is injectable for tests.
export async function fetchData(
  fetchImpl: typeof fetch = fetch,
): Promise<ApiData> {
  const [teamsRes, gamesRes] = await Promise.all([
    fetchImpl(`${BASE_URL}/get/teams`),
    fetchImpl(`${BASE_URL}/get/games`),
  ]);
  if (!teamsRes.ok || !gamesRes.ok) {
    throw new Error(
      `API error: teams ${teamsRes.status}, games ${gamesRes.status}`,
    );
  }
  const teamsJson = (await teamsRes.json()) as { teams: RawTeam[] };
  const gamesJson = (await gamesRes.json()) as { games: RawGame[] };
  return {
    teams: normalizeTeams(teamsJson.teams),
    games: normalizeGames(gamesJson.games),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api.ts tests/api.test.ts
git commit -m "feat: normalize teams and games from worldcup26.ir"
```

---

## Task 4: `computeStandings`

**Files:**

- Create: `src/standings.ts`
- Test: `tests/standings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeStandings } from "../src/standings";
import type { Team, Game } from "../src/types";

function team(id: string, code: string, group = "A"): Team {
  return { id, code, name: code, flagUrl: `flag/${code}`, group };
}

function game(
  homeId: string,
  awayId: string,
  homeScore: number,
  awayScore: number,
  opts: Partial<Game> = {},
): Game {
  return {
    id: `${homeId}-${awayId}`,
    homeId,
    awayId,
    homeName: homeId,
    awayName: awayId,
    homeScore,
    awayScore,
    group: "A",
    matchday: 1,
    kickoff: new Date(2026, 5, 11, 12, 0),
    finished: true,
    isGroupStage: true,
    ...opts,
  };
}

const groupA = [
  team("1", "MEX"),
  team("2", "RSA"),
  team("3", "KOR"),
  team("4", "CZE"),
];

describe("computeStandings", () => {
  it("returns every team at 0-0-0 before any match", () => {
    const [g] = computeStandings(groupA, []);
    expect(g.group).toBe("A");
    expect(g.rows).toHaveLength(4);
    expect(g.rows.every((r) => r.gp === 0 && r.pts === 0)).toBe(true);
  });

  it("scores a win (3), loss (0) and tracks GF/GA/GD", () => {
    const [g] = computeStandings(groupA, [game("1", "2", 2, 0)]);
    const mex = g.rows.find((r) => r.code === "MEX")!;
    const rsa = g.rows.find((r) => r.code === "RSA")!;
    expect(mex).toMatchObject({
      gp: 1,
      w: 1,
      d: 0,
      l: 0,
      gf: 2,
      ga: 0,
      gd: 2,
      pts: 3,
    });
    expect(rsa).toMatchObject({
      gp: 1,
      w: 0,
      d: 0,
      l: 1,
      gf: 0,
      ga: 2,
      gd: -2,
      pts: 0,
    });
  });

  it("scores a draw as 1 point each", () => {
    const [g] = computeStandings(groupA, [game("3", "4", 1, 1)]);
    const kor = g.rows.find((r) => r.code === "KOR")!;
    expect(kor).toMatchObject({ gp: 1, w: 0, d: 1, l: 0, pts: 1 });
  });

  it("sorts by Pts then GD then GF and assigns rank", () => {
    // MEX 3-0 RSA, KOR 1-0 CZE → MEX & KOR both 3pts, MEX better GD.
    const g = computeStandings(groupA, [
      game("1", "2", 3, 0),
      game("3", "4", 1, 0),
    ])[0];
    expect(g.rows.map((r) => r.code)).toEqual(["MEX", "KOR", "CZE", "RSA"]);
    expect(g.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("ignores unfinished and non-group matches", () => {
    const games = [
      game("1", "2", 5, 0, { finished: false }),
      game("1", "2", 5, 0, { isGroupStage: false }),
    ];
    const [g] = computeStandings(groupA, games);
    expect(g.rows.every((r) => r.gp === 0)).toBe(true);
  });

  it("returns groups ordered A..L", () => {
    const teams = [team("9", "ENG", "L"), team("1", "MEX", "A")];
    const groups = computeStandings(teams, []);
    expect(groups.map((g) => g.group)).toEqual(["A", "L"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/standings.test.ts`
Expected: FAIL — `computeStandings` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { Team, Game, GroupTable, StandingRow } from "./types";

interface Tally {
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
}

export function computeStandings(teams: Team[], games: Game[]): GroupTable[] {
  const tallies = new Map<string, Tally>();
  for (const t of teams) {
    tallies.set(t.id, { gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  }

  for (const g of games) {
    if (!g.finished || !g.isGroupStage) continue;
    const home = tallies.get(g.homeId);
    const away = tallies.get(g.awayId);
    if (!home || !away) continue;
    home.gp++;
    away.gp++;
    home.gf += g.homeScore;
    home.ga += g.awayScore;
    away.gf += g.awayScore;
    away.ga += g.homeScore;
    if (g.homeScore > g.awayScore) {
      home.w++;
      away.l++;
    } else if (g.awayScore > g.homeScore) {
      away.w++;
      home.l++;
    } else {
      home.d++;
      away.d++;
    }
  }

  const byGroup = new Map<string, StandingRow[]>();
  for (const t of teams) {
    const a = tallies.get(t.id)!;
    const row: StandingRow = {
      rank: 0,
      teamId: t.id,
      code: t.code,
      name: t.name,
      flagUrl: t.flagUrl,
      gp: a.gp,
      w: a.w,
      d: a.d,
      l: a.l,
      gf: a.gf,
      ga: a.ga,
      gd: a.gf - a.ga,
      pts: a.w * 3 + a.d,
    };
    const list = byGroup.get(t.group) ?? [];
    list.push(row);
    byGroup.set(t.group, list);
  }

  return [...byGroup.keys()].sort().map((group) => {
    const rows = byGroup
      .get(group)!
      .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
    rows.forEach((r, i) => (r.rank = i + 1));
    return { group, rows };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/standings.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/standings.ts tests/standings.test.ts
git commit -m "feat: compute group standings from finished matches"
```

---

## Task 5: `buildScoreFeed`

**Files:**

- Modify: `src/standings.ts`
- Test: `tests/standings.test.ts` (add a `describe` block)

- [ ] **Step 1: Write the failing test (append to `tests/standings.test.ts`)**

```ts
import { buildScoreFeed } from "../src/standings";

describe("buildScoreFeed", () => {
  const now = new Date(2026, 5, 14, 18, 0); // June 14 2026, 18:00

  function fg(id: string, opts: Partial<Game>): Game {
    return {
      id,
      homeId: "h",
      awayId: "a",
      homeName: "Home",
      awayName: "Away",
      homeScore: 0,
      awayScore: 0,
      group: "A",
      matchday: 1,
      kickoff: new Date(2026, 5, 14, 12, 0),
      finished: false,
      isGroupStage: true,
      ...opts,
    };
  }

  it("classifies started-but-unfinished matches as live", () => {
    const feed = buildScoreFeed(
      [fg("1", { kickoff: new Date(2026, 5, 14, 17, 0) })],
      now,
    );
    expect(feed[0].kind).toBe("live");
  });

  it("classifies finished matches as finished", () => {
    const feed = buildScoreFeed([fg("1", { finished: true })], now);
    expect(feed[0].kind).toBe("finished");
  });

  it("classifies future matches as upcoming", () => {
    const feed = buildScoreFeed(
      [fg("1", { kickoff: new Date(2026, 5, 14, 21, 0) })],
      now,
    );
    expect(feed[0].kind).toBe("upcoming");
  });

  it("orders live first, then finished, then upcoming", () => {
    const feed = buildScoreFeed(
      [
        fg("up", { kickoff: new Date(2026, 5, 14, 21, 0) }),
        fg("fin", { finished: true }),
        fg("live", { kickoff: new Date(2026, 5, 14, 17, 0) }),
      ],
      now,
    );
    expect(feed.map((m) => m.kind)).toEqual(["live", "finished", "upcoming"]);
  });

  it("limits upcoming matches to the next 5", () => {
    const upcoming = Array.from({ length: 9 }, (_, i) =>
      fg(`u${i}`, { kickoff: new Date(2026, 5, 15, 12 + i, 0) }),
    );
    const feed = buildScoreFeed(upcoming, now);
    expect(feed.filter((m) => m.kind === "upcoming")).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/standings.test.ts`
Expected: FAIL — `buildScoreFeed` not defined.

- [ ] **Step 3: Add implementation to `src/standings.ts`**

```ts
import type { FeedMatch, FeedKind } from "./types";

const MAX_UPCOMING = 5;

function classify(g: Game, now: Date): FeedKind {
  if (g.finished) return "finished";
  return g.kickoff <= now ? "live" : "upcoming";
}

function toFeedMatch(g: Game, kind: FeedKind): FeedMatch {
  return {
    id: g.id,
    kind,
    homeName: g.homeName,
    awayName: g.awayName,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    kickoff: g.kickoff,
  };
}

export function buildScoreFeed(games: Game[], now: Date): FeedMatch[] {
  const live: FeedMatch[] = [];
  const finished: FeedMatch[] = [];
  const upcoming: FeedMatch[] = [];

  for (const g of games) {
    const kind = classify(g, now);
    if (kind === "live") live.push(toFeedMatch(g, kind));
    else if (kind === "finished") finished.push(toFeedMatch(g, kind));
    else upcoming.push(toFeedMatch(g, kind));
  }

  live.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  finished.sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime()); // most recent first
  upcoming.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());

  return [...live, ...finished, ...upcoming.slice(0, MAX_UPCOMING)];
}
```

Add `import type { Game } from "./types";` if not already imported at the top
(Task 4 imported `Team, Game, GroupTable, StandingRow`; extend that import to
also include `FeedMatch, FeedKind`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/standings.test.ts`
Expected: PASS (all standings + feed tests).

- [ ] **Step 5: Commit**

```bash
git add src/standings.ts tests/standings.test.ts
git commit -m "feat: build live/finished/upcoming score feed"
```

---

## Task 6: Render layer

**Files:**

- Create: `src/render.ts`
- Test: `tests/render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { renderStandings, renderScoreFeed } from "../src/render";
import type { GroupTable, FeedMatch } from "../src/types";

function makeGroups(): GroupTable[] {
  return ["A", "B"].map((group) => ({
    group,
    rows: [1, 2, 3, 4].map((n) => ({
      rank: n,
      teamId: `${group}${n}`,
      code: `T${n}`,
      name: `Team ${n}`,
      flagUrl: `flag/${group}${n}.png`,
      gp: 1,
      w: 1,
      d: 0,
      l: 0,
      gf: 2,
      ga: 0,
      gd: 2,
      pts: 3,
    })),
  }));
}

describe("renderStandings", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders one table per group with a labelled header", () => {
    renderStandings(container, makeGroups());
    expect(container.querySelectorAll("[data-group]")).toHaveLength(2);
    expect(container.querySelector('[data-group="A"]')?.textContent).toContain(
      "Group A",
    );
  });

  it("renders a row per team tagged with the team code", () => {
    renderStandings(container, makeGroups());
    const a = container.querySelector('[data-group="A"]')!;
    expect(a.querySelectorAll("[data-team]")).toHaveLength(4);
    expect(a.querySelector('[data-team="T1"]')?.textContent).toContain("3"); // points
  });

  it("marks the top two rows as advancing", () => {
    renderStandings(container, makeGroups());
    const a = container.querySelector('[data-group="A"]')!;
    const advancing = a.querySelectorAll(".advancing");
    expect(advancing).toHaveLength(2);
  });

  it("updates in place without leaving stale tables", () => {
    renderStandings(container, makeGroups());
    renderStandings(container, makeGroups());
    expect(container.querySelectorAll("[data-group]")).toHaveLength(2);
  });
});

describe("renderScoreFeed", () => {
  it("renders each match with score and a kind class", () => {
    const container = document.createElement("div");
    const feed: FeedMatch[] = [
      {
        id: "1",
        kind: "live",
        homeName: "USA",
        awayName: "PAR",
        homeScore: 4,
        awayScore: 1,
        kickoff: new Date(2026, 5, 14, 17, 0),
      },
    ];
    renderScoreFeed(container, feed);
    const m = container.querySelector('[data-match="1"]')!;
    expect(m.classList.contains("live")).toBe(true);
    expect(m.textContent).toContain("USA");
    expect(m.textContent).toContain("4");
    expect(m.textContent).toContain("1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/render.test.ts`
Expected: FAIL — module/functions not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { GroupTable, FeedMatch } from "./types";

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderStandings(
  container: HTMLElement,
  groups: GroupTable[],
): void {
  container.replaceChildren(); // in-place refresh: clear then repaint

  for (const g of groups) {
    const card = el("section", "group-card");
    card.setAttribute("data-group", g.group);
    card.appendChild(el("h2", "group-title", `Group ${g.group}`));

    const table = el("table", "standings");
    const head = el("tr", "head");
    ["#", "", "Team", "GP", "W", "D", "L", "GF", "GA", "GD", "Pts"].forEach(
      (h) => head.appendChild(el("th", undefined, h)),
    );
    table.appendChild(head);

    g.rows.forEach((r) => {
      const tr = el("tr", r.rank <= 2 ? "advancing" : undefined);
      tr.setAttribute("data-team", r.code);

      tr.appendChild(el("td", "rank", String(r.rank)));

      const flagCell = el("td", "flag-cell");
      const flag = document.createElement("img");
      flag.className = "flag";
      flag.src = r.flagUrl;
      flag.alt = r.code;
      flag.addEventListener("error", () => {
        flagCell.replaceChildren(el("span", "flag-fallback", r.code));
      });
      flagCell.appendChild(flag);
      tr.appendChild(flagCell);

      tr.appendChild(el("td", "team", r.code));
      [r.gp, r.w, r.d, r.l, r.gf, r.ga, r.gd].forEach((v) =>
        tr.appendChild(el("td", undefined, String(v))),
      );
      tr.appendChild(el("td", "pts", String(r.pts)));
      table.appendChild(tr);
    });

    card.appendChild(table);
    container.appendChild(card);
  }
}

export function renderScoreFeed(
  container: HTMLElement,
  feed: FeedMatch[],
): void {
  container.replaceChildren();
  for (const m of feed) {
    const item = el("span", `match ${m.kind}`);
    item.setAttribute("data-match", m.id);
    const score =
      m.kind === "upcoming" ? "vs" : `${m.homeScore}-${m.awayScore}`;
    item.appendChild(el("span", "home", m.homeName));
    item.appendChild(el("span", "score", score));
    item.appendChild(el("span", "away", m.awayName));
    container.appendChild(item);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/render.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render.ts tests/render.test.ts
git commit -m "feat: render 2x6 standings grid and score strip"
```

---

## Task 7: Orchestration (`main.ts`)

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts` with the orchestrator**

```ts
import { fetchData } from "./api";
import { computeStandings, buildScoreFeed } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import type { Snapshot } from "./types";

const REFRESH_MS = 90_000;

const groupsEl = document.getElementById("groups")!;
const scoresEl = document.getElementById("scores")!;

let lastGood: Snapshot | null = null;
let timer: number | undefined;

async function refresh(): Promise<void> {
  try {
    const { teams, games } = await fetchData();
    lastGood = {
      groups: computeStandings(teams, games),
      feed: buildScoreFeed(games, new Date()),
    };
    paint(lastGood);
  } catch (err) {
    console.error("Refresh failed; keeping last-good data.", err);
    // Intentionally do not clear the screen — lastGood stays painted.
  }
}

function paint(s: Snapshot): void {
  renderStandings(groupsEl, s.groups);
  renderScoreFeed(scoresEl, s.feed);
}

function start(): void {
  if (timer !== undefined) return;
  timer = window.setInterval(refresh, REFRESH_MS);
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

void refresh();
start();
```

- [ ] **Step 2: Verify build and the full unit suite**

Run: `pnpm build`
Expected: typechecks and builds cleanly.
Run: `pnpm test`
Expected: all unit tests pass.

- [ ] **Step 3: Manual smoke check against the live API**

Run: `pnpm dev`
Open the printed localhost URL. Expected: 12 group tables (A–L) render with
flags and standings; a scores strip shows along the bottom.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire up data load, 90s refresh, and last-good fallback"
```

---

## Task 8: Dark theme styles

**Files:**

- Create: `src/styles.css`

- [ ] **Step 1: Create `src/styles.css`**

```css
:root {
  --bg: #0b0f17;
  --panel: #111827;
  --line: #1b2433;
  --text: #e8edf5;
  --muted: #56708f;
  --accent: #ffd25a;
  --live: #ff5a5a;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: "Segoe UI", system-ui, sans-serif;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 1vh 1vw;
  gap: 1vh;
}

.groups {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-auto-rows: 1fr;
  gap: 0.6vh 2vw;
  min-height: 0;
}

.group-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.group-title {
  margin: 0 0 0.3vh;
  font-size: clamp(11px, 1.4vh, 18px);
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #8fa6c4;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.2vh;
}

.standings {
  width: 100%;
  border-collapse: collapse;
}

.standings th {
  font-size: clamp(8px, 1vh, 12px);
  color: var(--muted);
  font-weight: 600;
  text-align: right;
  padding: 0.1vh 0.4vw;
}
.standings th:nth-child(3) {
  text-align: left;
}

.standings td {
  font-size: clamp(10px, 1.3vh, 16px);
  text-align: right;
  padding: 0.15vh 0.4vw;
}
.standings td.rank {
  color: var(--muted);
}
.standings td.team {
  text-align: left;
  font-weight: 600;
}
.standings td.pts {
  color: var(--accent);
  font-weight: 700;
}

.standings tr.advancing td {
  color: #fff;
}

.flag-cell {
  width: 1.6em;
}
.flag {
  width: 1.6em;
  height: 1.1em;
  border-radius: 2px;
  vertical-align: middle;
  object-fit: cover;
}
.flag-fallback {
  font-size: 0.8em;
  color: var(--muted);
}

.scores {
  background: var(--panel);
  border-radius: 8px;
  padding: 0.8vh 1vw;
  display: flex;
  gap: 1.6vw;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
}

.match {
  display: inline-flex;
  gap: 0.4em;
  align-items: baseline;
  font-size: clamp(11px, 1.6vh, 18px);
}
.match .score {
  font-weight: 700;
  color: #fff;
}
.match.live .score {
  color: var(--live);
}
.match.upcoming .score {
  color: var(--muted);
}
```

- [ ] **Step 2: Visual check**

Run: `pnpm dev`
Expected: dark 2×6 grid, gold points column, top-2 rows brighter, scores strip
pinned at the bottom; layout fills the viewport without scrollbars.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: dark high-contrast 2x6 grid theme"
```

---

## Task 9: Playwright e2e smoke test

**Files:**

- Create: `playwright.config.ts`, `e2e/dashboard.spec.ts`

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm build && pnpm preview --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL: "http://localhost:4173" },
});
```

- [ ] **Step 2: Create `e2e/dashboard.spec.ts`**

The page builds the 12 group headers from live team data (group membership is
stable regardless of scores), so we assert structure rather than specific
results. Flags load from `flagcdn.com`.

```ts
import { test, expect } from "@playwright/test";

test("renders all 12 group tables and a scores strip", async ({ page }) => {
  await page.goto("/");

  // All 12 group headers A–L are visible.
  for (const letter of "ABCDEFGHIJKL") {
    await expect(
      page.locator(`[data-group="${letter}"]`).getByText(`Group ${letter}`),
    ).toBeVisible();
  }

  // Each group shows four teams.
  await expect(page.locator('[data-group="A"] [data-team]')).toHaveCount(4);

  // The scores strip is present.
  await expect(page.locator("#scores")).toBeVisible();
});
```

- [ ] **Step 3: Install browsers and run**

Run: `pnpm exec playwright install chromium`
Then: `pnpm e2e`
Expected: 1 test passes. (Requires network access to worldcup26.ir.)

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/dashboard.spec.ts
git commit -m "test: e2e smoke for 12 groups and scores strip"
```

---

## Task 10: Render deploy config + docs

**Files:**

- Create: `render.yaml`
- Modify: `README.md`

- [ ] **Step 1: Create `render.yaml`**

```yaml
services:
  - type: web
    runtime: static
    name: worldcupdak
    buildCommand: corepack enable && pnpm install && pnpm build
    staticPublishPath: ./dist
    pullRequestPreviewsEnabled: false
```

- [ ] **Step 2: Update `README.md`**

Replace the **Status** section with:

````markdown
## Status

Implemented. Static site; deploy to Render (see below).

## Develop

```bash
pnpm install
pnpm dev        # local dev server
pnpm test       # unit tests (Vitest)
pnpm e2e        # end-to-end smoke (Playwright)
pnpm build      # production build to dist/
```
````

## Deploy (Render Static Site)

1. Connect the GitHub repo to Render; it auto-detects `render.yaml`, or set
   build command `pnpm install && pnpm build` and publish directory `dist/`.
2. Render serves the site over HTTPS — copy the public URL.
3. In DAKboard, add a **Website/iframe** block on a Custom Screen, paste the
   URL, and size it to a landscape region.

````

- [ ] **Step 3: Run formatter and full verification**

Run: `pnpm format`
Run: `pnpm test`
Run: `pnpm build`
Expected: all pass / clean build.

- [ ] **Step 4: Commit**

```bash
git add render.yaml README.md
git commit -m "docs: add Render deploy config and developer instructions"
````

---

## Self-review notes

- **Spec coverage:** 2×6 grid (Task 6/8), client-side standings (Task 4),
  score feed (Task 5), 90s refresh + last-good + visibility pause (Task 7),
  flags with fallback (Task 6), dark theme + HTTPS static deploy (Task 8/10),
  Vitest TDD for pure logic (Tasks 3–6) and Playwright smoke (Task 9). All
  acceptance criteria mapped.
- **Live-match limitation:** `buildScoreFeed` infers "live" from kickoff time
  since the API exposes no in-match minute (documented risk in the spec).
- **Type consistency:** `Team`, `Game`, `GroupTable`, `StandingRow`,
  `FeedMatch`, `Snapshot` are defined once in `types.ts` and reused; function
  names (`normalizeTeams/Games`, `computeStandings`, `buildScoreFeed`,
  `renderStandings/ScoreFeed`, `fetchData`) are consistent across tasks.

## Unresolved questions

- None blocking. Observe real live-match feed behaviour during a match in
  progress and adjust `buildScoreFeed` if the API later exposes a live minute.
