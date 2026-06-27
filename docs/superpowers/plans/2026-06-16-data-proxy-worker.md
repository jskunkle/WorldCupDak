# Cloudflare Worker Data Layer with Multi-Source Failover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a small Cloudflare Worker in front of the dashboard's data so clients read a warm, cached, normalized feed instantly, with automatic failover from worldcup26.ir (primary) to football-data.org (fallback).

**Architecture:** A Worker in `worker/` runs two entry points — a Cron-scheduled refresher that fetches a full snapshot from one failover-chosen source and writes it to KV (only when content changed), and a `fetch` handler that serves `/get/teams` and `/get/games` from KV with CORS. Normalization moves server-side; the client just fetches already-normalized JSON. The Worker shares the root `package.json`/`node_modules` and imports domain types from `src/types.ts` (type-only).

**Tech Stack:** TypeScript, Cloudflare Workers + Workers KV + Cron Triggers, `wrangler`, Vitest (existing), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-16-data-proxy-worker-design.md`

---

## File Structure

**New (`worker/`):**

- `worker/wrangler.toml` — Worker name, KV binding, Cron schedule, compatibility date.
- `worker/tsconfig.json` — Worker-only TS config (Workers types, includes `../src/types.ts`).
- `worker/sources/source.ts` — `Source` interface + `SourceSnapshot` type.
- `worker/sources/worldcup26.ts` — primary adapter (normalizers moved from `src/api.ts` + `fetchSnapshot`).
- `worker/sources/football-data.ts` — fallback adapter (football-data.org v4 normalizers + `fetchSnapshot`).
- `worker/hash.ts` — deterministic content hash for the KV write-gate.
- `worker/timeout.ts` — `withTimeout` promise wrapper.
- `worker/failover.ts` — `fetchSnapshotWithFailover` (tries sources in order).
- `worker/refresh.ts` — `refreshSnapshot` orchestration + `KVStore` interface + hash-gated write.
- `worker/handler.ts` — `handleRequest` (routing, CORS, KV read, cold populate, 503).
- `worker/index.ts` — Worker entry: `Env`, builds sources, exports `{ fetch, scheduled }`.
- Worker tests: `worker/**/*.test.ts` (pure functions only).

**Modified:**

- `package.json` — add `wrangler` + `@cloudflare/workers-types` devDeps; worker scripts.
- `vite.config.ts` — add `worker/**/*.test.ts` to Vitest `include`.
- `src/api.ts` — drop normalization; fetch normalized arrays; revive `kickoff`; `BASE_URL` from `VITE_API_BASE`.
- `tests/api.test.ts` — rewrite for the new client contract.
- `render.yaml` — add `VITE_API_BASE` env var.
- `CLAUDE.md` / `README.md` — document the data layer + deploy steps.

**Unchanged:** `src/types.ts` (single source of truth for types), `src/standings.ts`, `src/render.ts`, `src/main.ts`, `src/cache.ts`, `src/refresh-policy.ts`, `src/config.ts`, `src/fit.ts`.

**Testing note:** Only pure functions are unit-tested (normalizers, hash, timeout, failover, refresh orchestration with a fake KV, handler with a fake KV + fake sources). The adapters' network `fetchSnapshot` I/O and the `index.ts` runtime wiring are verified by `wrangler dev` + curl smoke tests in Task 11, per spec §7.

---

## Task 1: Worker scaffolding & config

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`

- [ ] **Step 1: Install Worker dev dependencies**

Run:

```bash
pnpm add -D wrangler @cloudflare/workers-types
```

Expected: both appear under `devDependencies` in `package.json`.

- [ ] **Step 2: Add Worker scripts to `package.json`**

Add to the `"scripts"` block:

```json
    "worker:typecheck": "tsc --noEmit -p worker/tsconfig.json",
    "worker:dev": "wrangler dev --config worker/wrangler.toml",
    "worker:deploy": "wrangler deploy --config worker/wrangler.toml"
```

- [ ] **Step 3: Add the worker test glob to `vite.config.ts`**

Change the `include` line to:

```ts
    include: ["tests/**/*.test.ts", "worker/**/*.test.ts"],
```

- [ ] **Step 4: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["**/*.ts", "../src/types.ts"]
}
```

- [ ] **Step 5: Create `worker/wrangler.toml`**

```toml
name = "worldcupdak-data"
main = "index.ts"
compatibility_date = "2026-06-16"

# KV id is filled in during Task 11 (`wrangler kv namespace create`).
[[kv_namespaces]]
binding = "WCDAK_KV"
id = "TASK_11_PLACEHOLDER"

[triggers]
crons = ["* * * * *"]

# FOOTBALL_DATA_TOKEN is set as a secret in Task 11 (never committed).
```

- [ ] **Step 6: Verify wrangler is installed**

Run: `pnpm wrangler --version`
Expected: prints a version (e.g. `4.x.x`), no error.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts worker/tsconfig.json worker/wrangler.toml
git commit -m "chore: scaffold Cloudflare Worker tooling and config"
```

---

## Task 2: Content-hash utility

**Files:**

- Create: `worker/hash.ts`
- Test: `worker/hash.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashString } from "./hash";

describe("hashString", () => {
  it("is deterministic for the same input", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
  });

  it("differs for different input", () => {
    expect(hashString("hello")).not.toBe(hashString("hellp"));
  });

  it("returns a non-empty hex string", () => {
    expect(hashString("")).toMatch(/^[0-9a-f]+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run worker/hash.test.ts`
Expected: FAIL — cannot find module `./hash`.

- [ ] **Step 3: Write minimal implementation**

`worker/hash.ts`:

```ts
// djb2 string hash — small, deterministic, dependency-free. Used only to detect
// whether a normalized payload changed since the last KV write.
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run worker/hash.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/hash.ts worker/hash.test.ts
git commit -m "feat(worker): add deterministic content-hash util"
```

---

## Task 3: Timeout utility

**Files:**

- Create: `worker/timeout.ts`
- Test: `worker/timeout.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/timeout.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout } from "./timeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("rejects with the original error when the promise rejects", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("boom")), 1000),
    ).rejects.toThrow("boom");
  });

  it("rejects with a timeout error when the promise is too slow", async () => {
    vi.useFakeTimers();
    const never = new Promise<number>(() => {});
    const p = withTimeout(never, 25_000);
    vi.advanceTimersByTime(25_000);
    await expect(p).rejects.toThrow(/timeout/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run worker/timeout.test.ts`
Expected: FAIL — cannot find module `./timeout`.

- [ ] **Step 3: Write minimal implementation**

`worker/timeout.ts`:

```ts
// Rejects if `p` has not settled within `ms`. Clears the timer on settle so
// the test runner / Worker isolate is not kept alive.
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout after ${ms}ms`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run worker/timeout.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/timeout.ts worker/timeout.test.ts
git commit -m "feat(worker): add withTimeout promise wrapper"
```

---

## Task 4: Source interface & snapshot failover

**Files:**

- Create: `worker/sources/source.ts`
- Create: `worker/failover.ts`
- Test: `worker/failover.test.ts`

- [ ] **Step 1: Create the `Source` interface (no test — type only)**

`worker/sources/source.ts`:

```ts
import type { Team, Game } from "../../src/types";

export interface SourceSnapshot {
  teams: Team[];
  games: Game[];
}

export interface Source {
  name: string;
  fetchSnapshot(): Promise<SourceSnapshot>;
}
```

- [ ] **Step 2: Write the failing test**

`worker/failover.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchSnapshotWithFailover } from "./failover";
import type { Source, SourceSnapshot } from "./sources/source";

const SNAP: SourceSnapshot = { teams: [], games: [] };

function ok(name: string): Source {
  return { name, fetchSnapshot: async () => SNAP };
}
function fail(name: string): Source {
  return {
    name,
    fetchSnapshot: async () => {
      throw new Error(`${name} down`);
    },
  };
}

describe("fetchSnapshotWithFailover", () => {
  it("returns the first source's snapshot tagged with its name", async () => {
    const result = await fetchSnapshotWithFailover(
      [ok("primary"), ok("fallback")],
      1000,
    );
    expect(result).toEqual({ ...SNAP, source: "primary" });
  });

  it("falls back to the next source when the primary throws", async () => {
    const result = await fetchSnapshotWithFailover(
      [fail("primary"), ok("fallback")],
      1000,
    );
    expect(result).toEqual({ ...SNAP, source: "fallback" });
  });

  it("returns null when every source fails", async () => {
    const result = await fetchSnapshotWithFailover(
      [fail("primary"), fail("fallback")],
      1000,
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run worker/failover.test.ts`
Expected: FAIL — cannot find module `./failover`.

- [ ] **Step 4: Write minimal implementation**

`worker/failover.ts`:

```ts
import type { Source, SourceSnapshot } from "./sources/source";
import { withTimeout } from "./timeout";

export interface FailoverResult extends SourceSnapshot {
  source: string;
}

// Tries each source in order, with a per-attempt timeout. Returns the first
// successful snapshot tagged with its source name, or null if all fail.
export async function fetchSnapshotWithFailover(
  sources: Source[],
  timeoutMs: number,
): Promise<FailoverResult | null> {
  for (const src of sources) {
    try {
      const snap = await withTimeout(src.fetchSnapshot(), timeoutMs);
      return { ...snap, source: src.name };
    } catch (err) {
      console.error(`source "${src.name}" failed:`, err);
    }
  }
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run worker/failover.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add worker/sources/source.ts worker/failover.ts worker/failover.test.ts
git commit -m "feat(worker): add source interface and snapshot failover"
```

---

## Task 5: worldcup26.ir adapter (move normalizers from the client)

**Files:**

- Create: `worker/sources/worldcup26.ts`
- Test: `worker/sources/worldcup26.test.ts`

This moves the normalization logic out of `src/api.ts` (which Task 10 strips down). The pure normalizers are tested here; the network `fetchSnapshot` wrapper is smoke-tested in Task 11.

- [ ] **Step 1: Write the failing test (ported from the existing `tests/api.test.ts`)**

`worker/sources/worldcup26.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeTeams, normalizeGames } from "./worldcup26";
import type { RawTeam, RawGame } from "../../src/types";

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
    expect(normalizeTeams([rawTeam])[0]).toEqual({
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
    expect(g.kickoff.getMonth()).toBe(5);
    expect(g.kickoff.getDate()).toBe(11);
  });

  it("treats finished other than 'TRUE' as not finished", () => {
    expect(
      normalizeGames([{ ...finishedGame, finished: "FALSE" }])[0].finished,
    ).toBe(false);
  });

  it("marks non-group types as not group stage", () => {
    expect(
      normalizeGames([{ ...finishedGame, type: "round_of_32" }])[0]
        .isGroupStage,
    ).toBe(false);
  });

  it("coerces malformed numeric fields to 0 instead of NaN", () => {
    const [g] = normalizeGames([
      { ...finishedGame, home_score: "null", away_score: "" },
    ]);
    expect(g.homeScore).toBe(0);
    expect(g.awayScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run worker/sources/worldcup26.test.ts`
Expected: FAIL — cannot find module `./worldcup26`.

- [ ] **Step 3: Write the implementation (normalizers moved verbatim from `src/api.ts`, plus `fetchSnapshot`)**

`worker/sources/worldcup26.ts`:

```ts
import type { RawTeam, RawGame, Team, Game } from "../../src/types";
import type { Source } from "./source";

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
    homeScore: Number(g.home_score) || 0,
    awayScore: Number(g.away_score) || 0,
    group: g.group,
    matchday: Number(g.matchday) || 0,
    kickoff: parseKickoff(g.local_date),
    finished: g.finished === "TRUE",
    isGroupStage: g.type === "group",
  }));
}

export const worldcup26Source: Source = {
  name: "worldcup26.ir",
  async fetchSnapshot() {
    const [tRes, gRes] = await Promise.all([
      fetch(`${BASE_URL}/get/teams`),
      fetch(`${BASE_URL}/get/games`),
    ]);
    if (!tRes.ok) throw new Error(`worldcup26 teams ${tRes.status}`);
    if (!gRes.ok) throw new Error(`worldcup26 games ${gRes.status}`);
    const tJson = (await tRes.json()) as { teams: RawTeam[] };
    const gJson = (await gRes.json()) as { games: RawGame[] };
    return {
      teams: normalizeTeams(tJson.teams),
      games: normalizeGames(gJson.games),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run worker/sources/worldcup26.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/sources/worldcup26.ts worker/sources/worldcup26.test.ts
git commit -m "feat(worker): add worldcup26 adapter with moved normalizers"
```

---

## Task 6: football-data.org adapter

**Files:**

- Create: `worker/sources/football-data.ts`
- Test: `worker/sources/football-data.test.ts`

Maps football-data.org v4 to the domain types per spec §2, including deriving each team's group from matches and `""` for knockout groups.

- [ ] **Step 1: Write the failing test (fixtures trimmed from real API responses)**

`worker/sources/football-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeFdGames, normalizeFdTeams } from "./football-data";

const matchesRes = {
  matches: [
    {
      id: 537327,
      utcDate: "2026-06-11T19:00:00Z",
      status: "FINISHED",
      matchday: 1,
      stage: "GROUP_STAGE",
      group: "GROUP_A",
      homeTeam: { id: 769, name: "Mexico" },
      awayTeam: { id: 774, name: "South Africa" },
      score: { fullTime: { home: 2, away: 0 } },
    },
    {
      id: 537400,
      utcDate: "2026-07-10T19:00:00Z",
      status: "SCHEDULED",
      matchday: 7,
      stage: "SEMI_FINALS",
      group: null,
      homeTeam: { id: 769, name: "Mexico" },
      awayTeam: { id: 758, name: "Uruguay" },
      score: { fullTime: { home: null, away: null } },
    },
  ],
};

const teamsRes = {
  teams: [
    {
      id: 769,
      name: "Mexico",
      tla: "MEX",
      crest: "https://crests.football-data.org/769.svg",
    },
    {
      id: 758,
      name: "Uruguay",
      tla: "URU",
      crest: "https://crests.football-data.org/758.svg",
    },
  ],
};

describe("normalizeFdGames", () => {
  it("maps a finished group match to the domain Game", () => {
    const [g] = normalizeFdGames(matchesRes);
    expect(g).toEqual({
      id: "537327",
      homeId: "769",
      awayId: "774",
      homeName: "Mexico",
      awayName: "South Africa",
      homeScore: 2,
      awayScore: 0,
      group: "A",
      matchday: 1,
      kickoff: new Date("2026-06-11T19:00:00Z"),
      finished: true,
      isGroupStage: true,
    });
  });

  it("uses 0 for null scores and '' group for knockout, and flags non-group stage", () => {
    const g = normalizeFdGames(matchesRes)[1];
    expect(g.homeScore).toBe(0);
    expect(g.awayScore).toBe(0);
    expect(g.group).toBe("");
    expect(g.finished).toBe(false);
    expect(g.isGroupStage).toBe(false);
  });
});

describe("normalizeFdTeams", () => {
  it("maps team fields and derives group from matches", () => {
    const teams = normalizeFdTeams(teamsRes, matchesRes);
    expect(teams[0]).toEqual({
      id: "769",
      name: "Mexico",
      code: "MEX",
      flagUrl: "https://crests.football-data.org/769.svg",
      group: "A",
    });
  });

  it("leaves group empty for a team with no group-stage match", () => {
    // Uruguay only appears in the knockout match above.
    expect(normalizeFdTeams(teamsRes, matchesRes)[1].group).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run worker/sources/football-data.test.ts`
Expected: FAIL — cannot find module `./football-data`.

- [ ] **Step 3: Write the implementation**

`worker/sources/football-data.ts`:

```ts
import type { Team, Game } from "../../src/types";
import type { Source } from "./source";

const BASE = "https://api.football-data.org/v4/competitions/WC";

interface FdTeamRef {
  id: number;
  name: string;
}
interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  group: string | null;
  homeTeam: FdTeamRef;
  awayTeam: FdTeamRef;
  score: { fullTime: { home: number | null; away: number | null } };
}
interface FdMatchesResponse {
  matches: FdMatch[];
}
interface FdTeam {
  id: number;
  name: string;
  tla: string;
  crest: string;
}
interface FdTeamsResponse {
  teams: FdTeam[];
}

function stripGroup(g: string | null): string {
  return g ? g.replace(/^GROUP_/, "") : "";
}

export function normalizeFdGames(res: FdMatchesResponse): Game[] {
  return res.matches.map((m) => ({
    id: String(m.id),
    homeId: String(m.homeTeam.id),
    awayId: String(m.awayTeam.id),
    homeName: m.homeTeam.name,
    awayName: m.awayTeam.name,
    homeScore: m.score.fullTime.home ?? 0,
    awayScore: m.score.fullTime.away ?? 0,
    group: stripGroup(m.group),
    matchday: m.matchday ?? 0,
    kickoff: new Date(m.utcDate),
    finished: m.status === "FINISHED",
    isGroupStage: m.stage === "GROUP_STAGE",
  }));
}

export function normalizeFdTeams(
  teamsRes: FdTeamsResponse,
  matchesRes: FdMatchesResponse,
): Team[] {
  // football-data's teams endpoint has no group; derive it from matches.
  const groupByTeam = new Map<string, string>();
  for (const m of matchesRes.matches) {
    const g = stripGroup(m.group);
    if (!g) continue;
    groupByTeam.set(String(m.homeTeam.id), g);
    groupByTeam.set(String(m.awayTeam.id), g);
  }
  return teamsRes.teams.map((t) => ({
    id: String(t.id),
    name: t.name,
    code: t.tla,
    flagUrl: t.crest,
    group: groupByTeam.get(String(t.id)) ?? "",
  }));
}

export function createFootballDataSource(token: string): Source {
  return {
    name: "football-data.org",
    async fetchSnapshot() {
      const headers = { "X-Auth-Token": token };
      const [mRes, tRes] = await Promise.all([
        fetch(`${BASE}/matches`, { headers }),
        fetch(`${BASE}/teams`, { headers }),
      ]);
      if (!mRes.ok) throw new Error(`football-data matches ${mRes.status}`);
      if (!tRes.ok) throw new Error(`football-data teams ${tRes.status}`);
      const matches = (await mRes.json()) as FdMatchesResponse;
      const teams = (await tRes.json()) as FdTeamsResponse;
      return {
        games: normalizeFdGames(matches),
        teams: normalizeFdTeams(teams, matches),
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run worker/sources/football-data.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/sources/football-data.ts worker/sources/football-data.test.ts
git commit -m "feat(worker): add football-data.org fallback adapter"
```

---

## Task 7: Refresh orchestration (failover + hash-gated KV write)

**Files:**

- Create: `worker/refresh.ts`
- Test: `worker/refresh.test.ts`

- [ ] **Step 1: Write the failing test (fake KVStore + fake sources)**

`worker/refresh.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { refreshSnapshot } from "./refresh";
import type { KVStore } from "./refresh";
import type { Source, SourceSnapshot } from "./sources/source";
import type { Team, Game } from "../src/types";

function fakeKV(): KVStore & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
  };
}

const team: Team = {
  id: "1",
  name: "Mexico",
  code: "MEX",
  flagUrl: "f",
  group: "A",
};
const game: Game = {
  id: "1",
  homeId: "1",
  awayId: "2",
  homeName: "Mexico",
  awayName: "RSA",
  homeScore: 0,
  awayScore: 0,
  group: "A",
  matchday: 1,
  kickoff: new Date("2026-06-11T19:00:00Z"),
  finished: false,
  isGroupStage: true,
};
const SNAP: SourceSnapshot = { teams: [team], games: [game] };

function source(name: string, snap: SourceSnapshot | null): Source {
  return {
    name,
    fetchSnapshot: async () => {
      if (snap === null) throw new Error(`${name} down`);
      return snap;
    },
  };
}

describe("refreshSnapshot", () => {
  it("writes both keys on first run and reports the source", async () => {
    const kv = fakeKV();
    const result = await refreshSnapshot([source("primary", SNAP)], kv, 1000);
    expect(result).toEqual({
      source: "primary",
      teamsWritten: true,
      gamesWritten: true,
    });
    expect(JSON.parse(kv.store.get("teams")!).source).toBe("primary");
    expect(JSON.parse(kv.store.get("games")!).data[0].id).toBe("1");
  });

  it("does not rewrite a key whose content is unchanged", async () => {
    const kv = fakeKV();
    await refreshSnapshot([source("primary", SNAP)], kv, 1000);
    const result = await refreshSnapshot([source("primary", SNAP)], kv, 2000);
    expect(result).toEqual({
      source: "primary",
      teamsWritten: false,
      gamesWritten: false,
    });
  });

  it("rewrites games when a score changes but leaves unchanged teams alone", async () => {
    const kv = fakeKV();
    await refreshSnapshot([source("primary", SNAP)], kv, 1000);
    const changed: SourceSnapshot = {
      teams: [team],
      games: [{ ...game, homeScore: 1 }],
    };
    const result = await refreshSnapshot(
      [source("primary", changed)],
      kv,
      2000,
    );
    expect(result).toEqual({
      source: "primary",
      teamsWritten: false,
      gamesWritten: true,
    });
  });

  it("falls back to the second source when the primary fails", async () => {
    const kv = fakeKV();
    const result = await refreshSnapshot(
      [source("primary", null), source("fallback", SNAP)],
      kv,
      1000,
    );
    expect(result?.source).toBe("fallback");
  });

  it("returns null and writes nothing when all sources fail", async () => {
    const kv = fakeKV();
    const result = await refreshSnapshot([source("primary", null)], kv, 1000);
    expect(result).toBeNull();
    expect(kv.store.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run worker/refresh.test.ts`
Expected: FAIL — cannot find module `./refresh`.

- [ ] **Step 3: Write the implementation**

`worker/refresh.ts`:

```ts
import type { Source } from "./sources/source";
import { fetchSnapshotWithFailover } from "./failover";
import { hashString } from "./hash";

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface KvRecord {
  data: unknown;
  source: string;
  fetchedAt: number;
  hash: string;
}

const TIMEOUT_MS = 25_000;

async function writeIfChanged(
  kv: KVStore,
  key: string,
  data: unknown,
  source: string,
  now: number,
): Promise<boolean> {
  const hash = hashString(JSON.stringify(data));
  const existingRaw = await kv.get(key);
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as KvRecord;
      if (existing.hash === hash) return false;
    } catch {
      // Unparseable existing record — fall through and overwrite.
    }
  }
  const record: KvRecord = { data, source, fetchedAt: now, hash };
  await kv.put(key, JSON.stringify(record));
  return true;
}

export interface RefreshResult {
  source: string;
  teamsWritten: boolean;
  gamesWritten: boolean;
}

// Fetches one full snapshot via failover and writes the teams/games KV records
// only when their content changed. Returns null if every source failed.
export async function refreshSnapshot(
  sources: Source[],
  kv: KVStore,
  now: number,
): Promise<RefreshResult | null> {
  const snap = await fetchSnapshotWithFailover(sources, TIMEOUT_MS);
  if (!snap) return null;
  const teamsWritten = await writeIfChanged(
    kv,
    "teams",
    snap.teams,
    snap.source,
    now,
  );
  const gamesWritten = await writeIfChanged(
    kv,
    "games",
    snap.games,
    snap.source,
    now,
  );
  return { source: snap.source, teamsWritten, gamesWritten };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run worker/refresh.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/refresh.ts worker/refresh.test.ts
git commit -m "feat(worker): add refresh orchestration with hash-gated KV writes"
```

---

## Task 8: Request handler

**Files:**

- Create: `worker/handler.ts`
- Test: `worker/handler.test.ts`

- [ ] **Step 1: Write the failing test**

`worker/handler.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { handleRequest } from "./handler";
import type { KVStore, KvRecord } from "./refresh";
import type { Source, SourceSnapshot } from "./sources/source";

const ORIGIN = "https://worldcupdak.onrender.com";

function fakeKV(
  seed?: Record<string, KvRecord>,
): KVStore & { store: Map<string, string> } {
  const store = new Map<string, string>();
  for (const [k, v] of Object.entries(seed ?? {}))
    store.set(k, JSON.stringify(v));
  return {
    store,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v) => void store.set(k, v),
  };
}

const SNAP: SourceSnapshot = {
  teams: [{ id: "1", name: "Mexico", code: "MEX", flagUrl: "f", group: "A" }],
  games: [],
};
const okSource: Source = { name: "primary", fetchSnapshot: async () => SNAP };
const downSource: Source = {
  name: "primary",
  fetchSnapshot: async () => {
    throw new Error("down");
  },
};

function deps(kv: KVStore, sources: Source[]) {
  return { kv, sources, now: () => 1000 };
}

describe("handleRequest", () => {
  it("serves teams from KV with CORS + source headers", async () => {
    const kv = fakeKV({
      teams: {
        data: SNAP.teams,
        source: "primary",
        fetchedAt: 1000,
        hash: "abc",
      },
    });
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/teams`),
      deps(kv, [okSource]),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("X-Data-Source")).toBe("primary");
    expect(await res.json()).toEqual(SNAP.teams);
  });

  it("answers an OPTIONS preflight with 204 + CORS", async () => {
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/teams`, { method: "OPTIONS" }),
      deps(fakeKV(), [okSource]),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it("404s an unknown path", async () => {
    const res = await handleRequest(
      new Request(`${ORIGIN}/nope`),
      deps(fakeKV(), [okSource]),
    );
    expect(res.status).toBe(404);
  });

  it("populates cold KV inline, then serves the requested key", async () => {
    const kv = fakeKV(); // empty
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/teams`),
      deps(kv, [okSource]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SNAP.teams);
    expect(kv.store.has("games")).toBe(true); // both keys written during populate
  });

  it("503s when KV is cold and all sources fail", async () => {
    const res = await handleRequest(
      new Request(`${ORIGIN}/get/games`),
      deps(fakeKV(), [downSource]),
    );
    expect(res.status).toBe(503);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run worker/handler.test.ts`
Expected: FAIL — cannot find module `./handler`.

- [ ] **Step 3: Write the implementation**

`worker/handler.ts`:

```ts
import type { Source } from "./sources/source";
import { refreshSnapshot, type KVStore, type KvRecord } from "./refresh";

const ALLOWED_ORIGIN = "https://worldcupdak.onrender.com";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const KEY_BY_PATH: Record<string, "teams" | "games"> = {
  "/get/teams": "teams",
  "/get/games": "games",
};

export interface HandlerDeps {
  kv: KVStore;
  sources: Source[];
  now: () => number;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function handleRequest(
  request: Request,
  deps: HandlerDeps,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const key = KEY_BY_PATH[new URL(request.url).pathname];
  if (!key) return new Response("Not found", { status: 404, headers: CORS });

  let raw = await deps.kv.get(key);
  if (raw === null) {
    // Cold KV (before the first cron tick): populate inline, then re-read.
    const result = await refreshSnapshot(deps.sources, deps.kv, deps.now());
    if (result === null) return jsonError(503, "no data available");
    raw = await deps.kv.get(key);
  }
  if (raw === null) return jsonError(503, "no data available");

  const record = JSON.parse(raw) as KvRecord;
  return new Response(JSON.stringify(record.data), {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=30",
      "X-Data-Source": record.source,
      "X-Fetched-At": String(record.fetchedAt),
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run worker/handler.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/handler.ts worker/handler.test.ts
git commit -m "feat(worker): add request handler with CORS and cold-KV populate"
```

---

## Task 9: Worker entry point

**Files:**

- Create: `worker/index.ts`

No unit test — this is runtime wiring validated by typecheck here and `wrangler dev` in Task 11.

- [ ] **Step 1: Write `worker/index.ts`**

```ts
import { handleRequest } from "./handler";
import { refreshSnapshot, type KVStore } from "./refresh";
import { worldcup26Source } from "./sources/worldcup26";
import { createFootballDataSource } from "./sources/football-data";
import type { Source } from "./sources/source";

export interface Env {
  WCDAK_KV: KVNamespace;
  FOOTBALL_DATA_TOKEN: string;
}

// worldcup26.ir primary, football-data.org fallback (same order = same id space
// per refresh; see spec §3).
function sourcesFor(env: Env): Source[] {
  return [worldcup26Source, createFootballDataSource(env.FOOTBALL_DATA_TOKEN)];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, {
      kv: env.WCDAK_KV as unknown as KVStore,
      sources: sourcesFor(env),
      now: () => Date.now(),
    });
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      refreshSnapshot(
        sourcesFor(env),
        env.WCDAK_KV as unknown as KVStore,
        Date.now(),
      ).then(() => undefined),
    );
  },
};
```

- [ ] **Step 2: Typecheck the whole Worker**

Run: `pnpm worker:typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full unit suite**

Run: `pnpm test`
Expected: all existing + new worker tests PASS.

- [ ] **Step 4: Commit**

```bash
git add worker/index.ts
git commit -m "feat(worker): add Worker entry wiring fetch and scheduled"
```

---

## Task 10: Repoint the client at the Worker

**Files:**

- Modify: `src/api.ts`
- Modify: `tests/api.test.ts`

The client now fetches already-normalized JSON and revives `kickoff` (the same revival `src/cache.ts` already does). Normalization is gone from the client (it lives in the Worker, Task 5).

- [ ] **Step 1: Rewrite the failing test**

Replace the entire contents of `tests/api.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchTeams, fetchGames } from "../src/api";
import type { Team } from "../src/types";

const team: Team = {
  id: "1",
  name: "Mexico",
  code: "MEX",
  flagUrl: "https://flagcdn.com/w80/mx.png",
  group: "A",
};

// Worker serializes Game.kickoff (a Date) to an ISO string over the wire.
const wireGame = {
  id: "1",
  homeId: "1",
  awayId: "2",
  homeName: "Mexico",
  awayName: "South Africa",
  homeScore: 2,
  awayScore: 0,
  group: "A",
  matchday: 1,
  kickoff: "2026-06-11T19:00:00.000Z",
  finished: true,
  isGroupStage: true,
};

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("fetchTeams", () => {
  it("fetches /get/teams and returns the teams array", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse([team]);
    }) as unknown as typeof fetch;

    const teams = await fetchTeams(fakeFetch);
    expect(calls[0]).toContain("/get/teams");
    expect(teams[0].code).toBe("MEX");
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse([], false, 500)) as unknown as typeof fetch;
    await expect(fetchTeams(fakeFetch)).rejects.toThrow();
  });
});

describe("fetchGames", () => {
  it("fetches /get/games and revives kickoff into a Date", async () => {
    const calls: string[] = [];
    const fakeFetch = (async (url: string) => {
      calls.push(url);
      return fakeResponse([wireGame]);
    }) as unknown as typeof fetch;

    const [g] = await fetchGames(fakeFetch);
    expect(calls[0]).toContain("/get/games");
    expect(g.kickoff).toBeInstanceOf(Date);
    expect(g.kickoff.getUTCFullYear()).toBe(2026);
    expect(g.homeScore).toBe(2);
  });

  it("throws when the response is not ok", async () => {
    const fakeFetch = (async () =>
      fakeResponse([], false, 500)) as unknown as typeof fetch;
    await expect(fetchGames(fakeFetch)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/api.test.ts`
Expected: FAIL — `normalizeTeams`/`normalizeGames` import gone, or shapes mismatch.

- [ ] **Step 3: Rewrite `src/api.ts`**

Replace the entire contents of `src/api.ts`:

```ts
import type { Team, Game } from "./types";

// Points at the Cloudflare Worker data layer. Set VITE_API_BASE in the Render
// build env to the deployed Worker URL; the fallback is for local dev.
const BASE_URL =
  import.meta.env.VITE_API_BASE ?? "https://worldcupdak-data.workers.dev";

function reviveGames(games: Game[]): Game[] {
  // The Worker sends kickoff as an ISO string; revive it to a Date.
  return games.map((g) => ({ ...g, kickoff: new Date(g.kickoff) }));
}

export async function fetchTeams(
  fetchImpl: typeof fetch = fetch,
): Promise<Team[]> {
  const res = await fetchImpl(`${BASE_URL}/get/teams`);
  if (!res.ok) throw new Error(`API error: teams ${res.status}`);
  return (await res.json()) as Team[];
}

export async function fetchGames(
  fetchImpl: typeof fetch = fetch,
): Promise<Game[]> {
  const res = await fetchImpl(`${BASE_URL}/get/games`);
  if (!res.ok) throw new Error(`API error: games ${res.status}`);
  return reviveGames((await res.json()) as Game[]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify the whole suite and the client build still pass**

Run: `pnpm test && pnpm build`
Expected: all unit tests PASS; `tsc && vite build` completes with no errors.
(If `tsc` complains about `import.meta.env.VITE_API_BASE`, add a `src/vite-env.d.ts` containing `/// <reference types="vite/client" />`.)

- [ ] **Step 6: Commit**

```bash
git add src/api.ts tests/api.test.ts src/vite-env.d.ts
git commit -m "feat: point client API at the Worker and drop client-side normalization"
```

---

## Task 11: Deploy & wire-up (manual)

**Files:**

- Modify: `worker/wrangler.toml`
- Modify: `render.yaml`
- Modify: `CLAUDE.md`, `README.md`

This task is operational; verification is by curl + browser smoke test, not unit tests.

- [ ] **Step 1: Authenticate wrangler**

In the session prompt, run: `! pnpm wrangler login`
(Interactive browser login — must be run by the user.)

- [ ] **Step 2: Create the KV namespace and record its id**

Run: `pnpm wrangler kv namespace create WCDAK_KV --config worker/wrangler.toml`
Expected: prints an `id = "…"`. Replace `TASK_11_PLACEHOLDER` in `worker/wrangler.toml` with that id.

- [ ] **Step 3: Set the football-data.org token as a secret**

In the session prompt, run: `! pnpm wrangler secret put FOOTBALL_DATA_TOKEN --config worker/wrangler.toml`
Paste the token when prompted. (Never commit it.)

- [ ] **Step 4: Local smoke test**

Run: `pnpm worker:dev` and, in another shell, `curl -s -D - "http://localhost:8787/get/games" | head -20`
Expected: 200, JSON array of games, `Access-Control-Allow-Origin: https://worldcupdak.onrender.com`, `X-Data-Source` header. First call may take ~15–20s (cold populate from worldcup26.ir); subsequent calls are instant.

- [ ] **Step 5: Deploy the Worker**

Run: `pnpm worker:deploy`
Expected: prints the deployed URL, e.g. `https://worldcupdak-data.<subdomain>.workers.dev`. Note it for the next step.

- [ ] **Step 6: Point the frontend at the deployed Worker via Render**

Edit `render.yaml` to add the env var under the service:

```yaml
envVars:
  - key: VITE_API_BASE
    value: https://worldcupdak-data.<subdomain>.workers.dev
```

(Use the exact URL from Step 5.) Commit and let Render rebuild, or set it in the Render dashboard.

- [ ] **Step 7: Verify the deployed Worker**

Run: `curl -s -D - "https://worldcupdak-data.<subdomain>.workers.dev/get/games" | head -20`
Expected: fast 200 with the games JSON and CORS/source headers.

- [ ] **Step 8: Browser smoke test**

Open the Render site, hard-reload with an empty cache, and confirm the dashboard paints in well under a second (served from the warm Worker cache) instead of the previous multi-second blank.

- [ ] **Step 9: Rotate the football-data.org token**

The token was shared in plaintext during design. Regenerate it on football-data.org, re-run Step 3 with the new value, and redeploy (`pnpm worker:deploy`).

- [ ] **Step 10: Update docs**

In `CLAUDE.md` and `README.md`, document: the Worker data layer (`worker/`), that `BASE_URL` comes from `VITE_API_BASE`, the `pnpm worker:*` scripts, the deploy steps above, and that `FOOTBALL_DATA_TOKEN` is a Worker secret. Run `pnpm format`.

- [ ] **Step 11: Commit**

```bash
git add worker/wrangler.toml render.yaml CLAUDE.md README.md
git commit -m "chore: wire deployed Worker into Render build and document data layer"
```

---

## Self-Review

**Spec coverage:** Worker shape (Tasks 1, 9) ✓; source adapters + mapping (Tasks 5, 6) ✓; single-source-per-refresh consistency + hash-gated writes (Task 7) ✓; request handler + CORS + cold populate + 503 (Task 8) ✓; client change (Task 10) ✓; secrets/config + rotation (Tasks 1, 11) ✓; free-tier write-gate (Task 7) ✓; testing approach — pure functions unit-tested, runtime smoke-tested (Tasks 2–8, 11) ✓.

**Type consistency:** `Source`/`SourceSnapshot` (Task 4) used unchanged in Tasks 5–9; `KVStore`/`KvRecord` defined in Task 7 and imported in Task 8; `RefreshResult` fields (`source`, `teamsWritten`, `gamesWritten`) match the Task 7 tests; `Env.WCDAK_KV` binding name matches `wrangler.toml` (Task 1) and `index.ts` (Task 9); domain `Team`/`Game` from `src/types.ts` are the target of every normalizer.

**Placeholders:** the only literal placeholders are `TASK_11_PLACEHOLDER` (KV id) and `<subdomain>` (deployed URL), both resolved by operational steps in Task 11 — not code gaps.

## Unresolved questions

None.
