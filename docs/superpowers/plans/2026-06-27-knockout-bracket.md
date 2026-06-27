# Knockout Bracket View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a knockout bracket view that the DAKboard display switches to automatically once the group stage ends, with query-string control over which view/layout is shown.

**Architecture:** Client-only. The Worker already serves all 104 games (group + knockout); the normalized `Game` keeps `matchday`, which encodes the round (4=R32, 5=R16, 6=QF, 7=SF, 8=Third, 9=Final). New pure helpers in `src/bracket.ts` select the view and shape games into a `Bracket`; new renderers in `src/render-bracket.ts` paint a full mirrored bracket (default) or a focused current-round layout; `main.ts` picks the view each refresh.

**Tech Stack:** TypeScript, Vite, Vitest (unit, in `tests/`), Playwright (e2e, in `e2e/`). No UI framework. Run tooling with the real node binary per `CLAUDE.md`.

**Conventions reminder (from `CLAUDE.md`):**

```bash
NODE="C:/Users/shane/AppData/Local/mise/installs/node/22.22.2/node.exe"
"$NODE" node_modules/vitest/vitest.mjs run [path]   # unit tests
"$NODE" node_modules/vite/bin/vite.js build         # build
"$NODE" node_modules/prettier/bin/prettier.cjs --write .   # format
```

Commit messages use Conventional Commits. All work happens on a feature branch (see Task 0).

---

## Task 0: Branch

**Files:** none

- [ ] **Step 1: Create the feature branch**

Run:

```bash
git checkout -b feat/knockout-bracket
```

- [ ] **Step 2: Commit the planning docs**

The spec, plan, and todo were written on `main` and carry over untracked. Commit
them first so the branch starts clean.

```bash
git add docs/superpowers/specs/2026-06-27-knockout-bracket-design.md \
        docs/superpowers/plans/2026-06-27-knockout-bracket.md todo.md
git commit -m "docs(bracket): spec, plan, and task list for knockout view"
```

- [ ] **Step 3: Confirm clean start**

Run: `git status`
Expected: `On branch feat/knockout-bracket`, working tree clean.

---

## Task 1: Config — `view` and `bracket` params

**Files:**

- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/config.test.ts`. First, extend the existing empty-defaults `toEqual` object (in the `"returns documented defaults..."` test) with the two new keys:

```ts
    view: "auto",
    bracket: "full",
```

Then add a new `describe` block at the end of the file:

```ts
describe("parseConfig view/bracket", () => {
  it("defaults view to auto and bracket to full", () => {
    expect(parseConfig("")).toMatchObject({ view: "auto", bracket: "full" });
  });

  it("parses view as auto | standings | bracket, else auto", () => {
    expect(parseConfig("?view=standings").view).toBe("standings");
    expect(parseConfig("?view=bracket").view).toBe("bracket");
    expect(parseConfig("?view=nonsense").view).toBe("auto");
  });

  it("parses bracket as full | focused, else full", () => {
    expect(parseConfig("?bracket=focused").bracket).toBe("focused");
    expect(parseConfig("?bracket=full").bracket).toBe("full");
    expect(parseConfig("?bracket=weird").bracket).toBe("full");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/config.test.ts`
Expected: FAIL — `view`/`bracket` undefined on the config object.

- [ ] **Step 3: Implement**

In `src/config.ts`, add to the `DashboardConfig` interface:

```ts
view: "auto" | "standings" | "bracket";
bracket: "full" | "focused";
```

Add to `DEFAULTS`:

```ts
  view: "auto",
  bracket: "full",
```

In `parseConfig`, add to the returned object:

```ts
    view:
      p.get("view") === "standings"
        ? "standings"
        : p.get("view") === "bracket"
          ? "bracket"
          : "auto",
    bracket: p.get("bracket") === "focused" ? "focused" : "full",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(config): add view and bracket query params"
```

---

## Task 2: Export `classify` from standings

**Files:**

- Modify: `src/standings.ts`

`buildBracket` (Task 4) reuses the existing match classifier. It is currently module-private.

- [ ] **Step 1: Export it**

In `src/standings.ts`, change:

```ts
function classify(g: Game, now: Date): FeedKind {
```

to:

```ts
export function classify(g: Game, now: Date): FeedKind {
```

- [ ] **Step 2: Verify nothing broke**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/standings.test.ts`
Expected: PASS (no behavior change).

- [ ] **Step 3: Commit**

```bash
git add src/standings.ts
git commit -m "refactor(standings): export classify for reuse"
```

---

## Task 3: Bracket types

**Files:**

- Modify: `src/types.ts`

- [ ] **Step 1: Add the types**

Append to `src/types.ts`:

```ts
export type KnockoutRound = "r32" | "r16" | "qf" | "sf" | "final" | "third";

export interface BracketSlot {
  tbd: boolean;
  name: string; // "TBD" when tbd
  code: string; // "" when tbd or unknown
  flagUrl: string; // "" when tbd or unknown
  score: number;
}

export interface BracketMatch {
  id: string;
  round: KnockoutRound;
  status: FeedKind; // "live" | "finished" | "upcoming"
  kickoff: Date;
  home: BracketSlot;
  away: BracketSlot;
}

export interface Bracket {
  // Each side holds four columns ordered r32, r16, qf, sf (outer → inner).
  left: BracketMatch[][];
  right: BracketMatch[][];
  final: BracketMatch | null;
  third: BracketMatch | null;
  // All matches per round, id-ordered — used by the focused view and progress rail.
  rounds: Record<KnockoutRound, BracketMatch[]>;
}
```

- [ ] **Step 2: Typecheck**

Run: `"$NODE" node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
Expected: PASS (if no root `tsconfig.json`, skip — `vite build` in Task 9 will catch type errors).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add bracket model types"
```

---

## Task 4: `buildBracket` (pure)

**Files:**

- Create: `src/bracket.ts`
- Test: `tests/bracket.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/bracket.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { roundOf, buildBracket } from "../src/bracket";
import type { Team, Game } from "../src/types";

function team(id: string, code: string): Team {
  return { id, code, name: code, flagUrl: `flag/${code}.png`, group: "A" };
}

function ko(
  id: string,
  matchday: number,
  homeId: string,
  awayId: string,
  opts: Partial<Game> = {},
): Game {
  return {
    id,
    homeId,
    awayId,
    homeName: homeId === "0" ? "" : homeId,
    awayName: awayId === "0" ? "" : awayId,
    homeScore: 0,
    awayScore: 0,
    group: "R32",
    matchday,
    kickoff: new Date(2026, 6, 1, 12, 0),
    finished: false,
    isGroupStage: false,
    ...opts,
  };
}

const now = new Date(2026, 6, 1, 18, 0);

describe("roundOf", () => {
  it("maps matchday to knockout round", () => {
    expect(roundOf(4)).toBe("r32");
    expect(roundOf(5)).toBe("r16");
    expect(roundOf(6)).toBe("qf");
    expect(roundOf(7)).toBe("sf");
    expect(roundOf(8)).toBe("third");
    expect(roundOf(9)).toBe("final");
  });

  it("returns null for group matchdays", () => {
    expect(roundOf(1)).toBeNull();
    expect(roundOf(3)).toBeNull();
  });
});

describe("buildBracket", () => {
  it("skips group-stage games", () => {
    const groupGame = ko("1", 1, "a", "b", { isGroupStage: true });
    const b = buildBracket([groupGame], [team("a", "AAA")], now);
    expect(b.rounds.r32).toHaveLength(0);
  });

  it("buckets knockout games by round and id-orders them", () => {
    const games = [
      ko("88", 4, "0", "0"),
      ko("73", 4, "a", "b"),
      ko("89", 5, "0", "0"),
    ];
    const b = buildBracket(games, [team("a", "AAA"), team("b", "BBB")], now);
    expect(b.rounds.r32.map((m) => m.id)).toEqual(["73", "88"]);
    expect(b.rounds.r16.map((m) => m.id)).toEqual(["89"]);
  });

  it("splits each round into left (first half) and right (second half)", () => {
    // 4 R32 games → 2 left, 2 right.
    const games = [73, 74, 75, 76].map((n) => ko(String(n), 4, "0", "0"));
    const b = buildBracket(games, [], now);
    expect(b.left[0].map((m) => m.id)).toEqual(["73", "74"]);
    expect(b.right[0].map((m) => m.id)).toEqual(["75", "76"]);
  });

  it("joins real teams to flags and marks id '0' as TBD", () => {
    const game = ko("73", 4, "a", "0", {
      homeScore: 2,
      awayScore: 1,
      finished: true,
    });
    const b = buildBracket(game ? [game] : [], [team("a", "AAA")], now);
    const m = b.rounds.r32[0];
    expect(m.home).toMatchObject({
      tbd: false,
      name: "AAA",
      code: "AAA",
      flagUrl: "flag/AAA.png",
      score: 2,
    });
    expect(m.away).toMatchObject({ tbd: true, name: "TBD" });
  });

  it("classifies status from finished/kickoff", () => {
    const finished = ko("73", 4, "a", "b", { finished: true });
    const live = ko("74", 4, "a", "b", {
      kickoff: new Date(2026, 6, 1, 17, 0),
    });
    const upcoming = ko("75", 4, "a", "b", {
      kickoff: new Date(2026, 6, 1, 20, 0),
    });
    const b = buildBracket([finished, live, upcoming], [], now);
    expect(b.rounds.r32.map((m) => m.status)).toEqual([
      "finished",
      "live",
      "upcoming",
    ]);
  });

  it("exposes the final and third-place games", () => {
    const games = [ko("104", 9, "0", "0"), ko("103", 8, "0", "0")];
    const b = buildBracket(games, [], now);
    expect(b.final?.id).toBe("104");
    expect(b.third?.id).toBe("103");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/bracket.test.ts`
Expected: FAIL — `src/bracket.ts` does not exist.

- [ ] **Step 3: Implement**

Create `src/bracket.ts`:

```ts
import type {
  Team,
  Game,
  Bracket,
  BracketMatch,
  BracketSlot,
  KnockoutRound,
} from "./types";
import { classify } from "./standings";

const ROUND_BY_MATCHDAY: Record<number, KnockoutRound> = {
  4: "r32",
  5: "r16",
  6: "qf",
  7: "sf",
  8: "third",
  9: "final",
};

export function roundOf(matchday: number): KnockoutRound | null {
  return ROUND_BY_MATCHDAY[matchday] ?? null;
}

function slot(
  id: string,
  name: string,
  score: number,
  byId: Map<string, Team>,
): BracketSlot {
  const team = byId.get(id);
  if (id === "0" || (!team && !name)) {
    return { tbd: true, name: "TBD", code: "", flagUrl: "", score: 0 };
  }
  if (team) {
    return {
      tbd: false,
      name: team.name,
      code: team.code,
      flagUrl: team.flagUrl,
      score,
    };
  }
  return { tbd: false, name, code: "", flagUrl: "", score };
}

function toMatch(
  g: Game,
  round: KnockoutRound,
  byId: Map<string, Team>,
  now: Date,
): BracketMatch {
  return {
    id: g.id,
    round,
    status: classify(g, now),
    kickoff: g.kickoff,
    home: slot(g.homeId, g.homeName, g.homeScore, byId),
    away: slot(g.awayId, g.awayName, g.awayScore, byId),
  };
}

function half(arr: BracketMatch[]): [BracketMatch[], BracketMatch[]] {
  const mid = Math.ceil(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

export function buildBracket(games: Game[], teams: Team[], now: Date): Bracket {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rounds: Record<KnockoutRound, BracketMatch[]> = {
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    final: [],
    third: [],
  };

  for (const g of games) {
    if (g.isGroupStage) continue;
    const round = roundOf(g.matchday);
    if (!round) continue;
    rounds[round].push(toMatch(g, round, byId, now));
  }
  for (const r of Object.keys(rounds) as KnockoutRound[]) {
    rounds[r].sort((a, b) => Number(a.id) - Number(b.id));
  }

  const [r32L, r32R] = half(rounds.r32);
  const [r16L, r16R] = half(rounds.r16);
  const [qfL, qfR] = half(rounds.qf);
  const [sfL, sfR] = half(rounds.sf);

  return {
    left: [r32L, r16L, qfL, sfL],
    right: [r32R, r16R, qfR, sfR],
    final: rounds.final[0] ?? null,
    third: rounds.third[0] ?? null,
    rounds,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/bracket.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bracket.ts tests/bracket.test.ts
git commit -m "feat(bracket): shape knockout games into a bracket model"
```

---

## Task 5: `selectView` and `activeRound` (pure)

**Files:**

- Modify: `src/bracket.ts`
- Test: `tests/bracket.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/bracket.test.ts`:

```ts
import { selectView, activeRound } from "../src/bracket";
import type { DashboardConfig } from "../src/config";

const baseConfig: DashboardConfig = {
  groups: null,
  cols: null,
  rows: null,
  detail: "full",
  scores: true,
  upcoming: 5,
  finished: 8,
  refreshMs: 90_000,
  theme: "dark",
  highlight: [],
  fit: true,
  view: "auto",
  bracket: "full",
};

function gGame(id: string, finished: boolean): Game {
  return ko(id, 1, "a", "b", { isGroupStage: true, finished });
}

describe("selectView", () => {
  const t0 = new Date(2026, 6, 1, 12, 0);

  it("honors an explicit view override", () => {
    const games = [gGame("1", false)];
    expect(selectView(games, t0, { ...baseConfig, view: "bracket" })).toBe(
      "bracket",
    );
    expect(selectView([], t0, { ...baseConfig, view: "standings" })).toBe(
      "standings",
    );
  });

  it("auto: standings while any group game is unfinished and no knockout has kicked off", () => {
    const games = [gGame("1", true), gGame("2", false), ko("73", 4, "0", "0")];
    expect(selectView(games, t0, baseConfig)).toBe("standings");
  });

  it("auto: bracket once every group game is finished", () => {
    const games = [gGame("1", true), gGame("2", true), ko("73", 4, "0", "0")];
    expect(selectView(games, t0, baseConfig)).toBe("bracket");
  });

  it("auto: bracket once now is past the earliest knockout kickoff (safety net)", () => {
    const games = [
      gGame("1", false),
      ko("73", 4, "0", "0", { kickoff: new Date(2026, 6, 1, 10, 0) }),
    ];
    expect(selectView(games, t0, baseConfig)).toBe("bracket");
  });

  it("auto: never bracket when there are no group games (empty data guard)", () => {
    expect(selectView([], t0, baseConfig)).toBe("standings");
  });
});

describe("activeRound", () => {
  it("returns the earliest round with an unfinished match", () => {
    const games = [
      ko("73", 4, "a", "b", { finished: true }),
      ko("74", 4, "a", "b", { finished: true }),
      ko("89", 5, "a", "b", { finished: false }),
    ];
    const b = buildBracket(games, [], new Date(2026, 6, 1, 18, 0));
    expect(activeRound(b)).toBe("r16");
  });

  it("falls back to final when every match is finished", () => {
    const games = [ko("104", 9, "a", "b", { finished: true })];
    const b = buildBracket(games, [], new Date(2026, 6, 20, 18, 0));
    expect(activeRound(b)).toBe("final");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/bracket.test.ts`
Expected: FAIL — `selectView`/`activeRound` not exported.

- [ ] **Step 3: Implement**

Append to `src/bracket.ts` (add `DashboardConfig` to the imports at the top: `import type { DashboardConfig } from "./config";`):

```ts
export function selectView(
  games: Game[],
  now: Date,
  config: DashboardConfig,
): "standings" | "bracket" {
  if (config.view === "bracket" || config.view === "standings") {
    return config.view;
  }
  const groupGames = games.filter((g) => g.isGroupStage);
  const allGroupDone =
    groupGames.length > 0 && groupGames.every((g) => g.finished);

  const knockoffs = games
    .filter((g) => !g.isGroupStage)
    .map((g) => g.kickoff.getTime());
  const earliest = knockoffs.length ? Math.min(...knockoffs) : null;
  const pastFirstKnockout = earliest !== null && now.getTime() >= earliest;

  return allGroupDone || pastFirstKnockout ? "bracket" : "standings";
}

const ACTIVE_ROUND_ORDER: KnockoutRound[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "third",
  "final",
];

export function activeRound(bracket: Bracket): KnockoutRound {
  for (const r of ACTIVE_ROUND_ORDER) {
    const matches = bracket.rounds[r];
    if (matches.length && matches.some((m) => m.status !== "finished")) {
      return r;
    }
  }
  return "final";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/bracket.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bracket.ts tests/bracket.test.ts
git commit -m "feat(bracket): add view selection and active-round helpers"
```

---

## Task 6: Bracket container + styles

**Files:**

- Modify: `index.html`
- Modify: `src/styles.css`

No automated test (pure CSS/markup); verified visually in Task 9's e2e + manual check.

- [ ] **Step 1: Add the container**

In `index.html`, inside `<div id="app">`, after the `<footer id="scores">` line, add:

```html
<section id="bracket" class="bracket-view" style="display: none"></section>
```

- [ ] **Step 2: Add styles**

Append to `src/styles.css`:

```css
/* ---- Knockout bracket view ---- */
#app[data-view="bracket"] #groups,
#app[data-view="bracket"] #scores {
  display: none !important;
}

.bracket-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  color: var(--text);
}
.bracket-title {
  font-size: clamp(11px, 1.6vh, 20px);
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--title);
  text-align: center;
  margin: 0 0 0.6vh;
}
.bboard {
  flex: 1;
  display: flex;
  min-height: 0;
}
.bside {
  display: flex;
  flex: 1;
  min-height: 0;
}
.bcol {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.bcol.r32 {
  flex: 1.5;
}
.bcol.final {
  flex: 1.1;
}
.bcol-label {
  text-align: center;
  font-size: clamp(7px, 1vh, 11px);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 0.3vh;
  height: 1.2em;
}
.bcol-cells {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.bcell {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
  padding: 0.3vh 0.4vw;
  min-height: 0;
}
.bm {
  width: 100%;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 5px;
  overflow: hidden;
}
.bm.live {
  border-color: var(--live);
}
.bm.final-box {
  border-color: var(--accent);
}
.bm-row {
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.25vh 0.4vw;
  font-size: clamp(8px, 1.15vh, 14px);
  line-height: 1.15;
}
.bm-row + .bm-row {
  border-top: 1px solid var(--line);
}
.bm-flag {
  width: 1.5em;
  height: 1em;
  object-fit: cover;
  border-radius: 2px;
  flex: none;
}
.bm-flagph {
  width: 1.5em;
  height: 1em;
  border-radius: 2px;
  background: var(--line);
  flex: none;
}
.bm-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bm-row.tbd .bm-name {
  color: var(--muted);
  font-style: italic;
}
.bm-score {
  color: var(--strong);
  font-variant-numeric: tabular-nums;
  min-width: 1em;
  text-align: right;
}
.bm.live .bm-score {
  color: var(--live);
  font-weight: 700;
}

/* center final column */
.bcol.final .bcol-cells {
  justify-content: center;
}
.bfinal-cell {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6vh;
}
.btrophy {
  font-size: clamp(16px, 3vh, 28px);
}
.bthird {
  font-size: clamp(7px, 1vh, 11px);
  color: var(--muted);
}

/* connectors */
.bside.left .bcol:not(.r32) .bcell::before,
.bside.right .bcol:not(.r32) .bcell::before {
  content: "";
  position: absolute;
  top: 50%;
  width: 0.4vw;
  height: 2px;
  background: var(--line);
}
.bside.left .bcol:not(.r32) .bcell::before {
  left: 0;
}
.bside.right .bcol:not(.r32) .bcell::before {
  right: 0;
}
.bside.left .bcol:not(.sf) .bcell:nth-child(odd)::after,
.bside.right .bcol:not(.sf) .bcell:nth-child(odd)::after {
  content: "";
  position: absolute;
  top: 50%;
  height: 100%;
  width: 2px;
  background: var(--line);
}
.bside.left .bcol:not(.sf) .bcell:nth-child(odd)::after {
  right: 0;
}
.bside.right .bcol:not(.sf) .bcell:nth-child(odd)::after {
  left: 0;
}

/* ---- Focused layout ---- */
.bfocus {
  flex: 1;
  display: flex;
  gap: 1vw;
  min-height: 0;
}
.bfocus-main {
  flex: 2.4;
  display: flex;
  flex-direction: column;
  gap: 1vh;
  min-height: 0;
  justify-content: center;
}
.bfocus-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 1.4vh 1.4vw;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1vw;
}
.bfocus-card.live {
  border-color: var(--live);
}
.bfocus-side {
  display: flex;
  align-items: center;
  gap: 0.6em;
  font-size: clamp(14px, 2.4vh, 26px);
  font-weight: 600;
  flex: 1;
}
.bfocus-side.away {
  justify-content: flex-end;
  text-align: right;
}
.bfocus-side img {
  width: 1.6em;
  height: 1.1em;
  object-fit: cover;
  border-radius: 2px;
}
.bfocus-mid {
  text-align: center;
  min-width: 5em;
}
.bfocus-vs {
  font-size: clamp(16px, 2.8vh, 30px);
  font-weight: 700;
  color: var(--strong);
}
.bfocus-card.live .bfocus-vs {
  color: var(--live);
}
.bfocus-when {
  font-size: clamp(8px, 1.1vh, 13px);
  color: var(--muted);
  margin-top: 0.3vh;
}
.bfocus-rail {
  flex: 1;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 1vh;
  display: flex;
  flex-direction: column;
  gap: 0.2vh;
}
.brail-round {
  font-size: clamp(7px, 1vh, 11px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin-top: 0.6vh;
}
.brail-dots {
  display: flex;
  gap: 0.3vw;
  flex-wrap: wrap;
}
.brail-dot {
  width: 0.8vw;
  height: 0.8vw;
  min-width: 8px;
  min-height: 8px;
  border-radius: 2px;
  background: var(--line);
}
.brail-dot.done {
  background: var(--muted);
}
.brail-dot.live {
  background: var(--live);
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html src/styles.css
git commit -m "feat(bracket): add bracket container and styles"
```

---

## Task 7: Full bracket renderer

**Files:**

- Create: `src/render-bracket.ts`
- Test: `tests/render-bracket.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/render-bracket.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderFullBracket } from "../src/render-bracket";
import { buildBracket } from "../src/bracket";
import type { Team, Game } from "../src/types";

function team(id: string, code: string): Team {
  return { id, code, name: code, flagUrl: `flag/${code}.png`, group: "A" };
}
function ko(
  id: string,
  matchday: number,
  h: string,
  a: string,
  o: Partial<Game> = {},
): Game {
  return {
    id,
    homeId: h,
    awayId: a,
    homeName: h === "0" ? "" : h,
    awayName: a === "0" ? "" : a,
    homeScore: 0,
    awayScore: 0,
    group: "R",
    matchday,
    kickoff: new Date(2026, 6, 1, 12, 0),
    finished: false,
    isGroupStage: false,
    ...o,
  };
}

// A minimal but full-shaped bracket: 2 R32, 0 of the rest, no final.
function sampleBracket() {
  const games = [
    ko("73", 4, "a", "0", { homeScore: 2, awayScore: 1, finished: true }),
    ko("74", 4, "0", "0", { kickoff: new Date(2026, 6, 1, 17, 0) }),
  ];
  return buildBracket(games, [team("a", "BRA")], new Date(2026, 6, 1, 18, 0));
}

describe("renderFullBracket", () => {
  it("renders a column per round with a data-round attribute", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    expect(c.querySelector('[data-round="r32"]')).toBeTruthy();
  });

  it("renders a match tagged by id with both teams", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    const m = c.querySelector('[data-match="73"]')!;
    expect(m).toBeTruthy();
    expect(m.querySelector('[data-team="BRA"]')).toBeTruthy();
    expect(m.textContent).toContain("BRA");
  });

  it("renders TBD for unresolved slots", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    const m = c.querySelector('[data-match="73"]')!;
    expect(m.textContent).toContain("TBD"); // away side
  });

  it("shows scores for finished matches and marks live ones", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    expect(c.querySelector('[data-match="73"]')!.textContent).toContain("2");
    expect(
      c.querySelector('[data-match="74"]')!.classList.contains("live"),
    ).toBe(true);
  });

  it("falls back to a placeholder when a flag image fails", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    const img = c.querySelector(
      '[data-match="73"] img.bm-flag',
    ) as HTMLImageElement;
    expect(img).toBeTruthy();
    img.dispatchEvent(new Event("error"));
    expect(c.querySelector('[data-match="73"] .bm-flagph')).toBeTruthy();
  });

  it("repaints in place without stacking columns", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    renderFullBracket(c, sampleBracket());
    expect(c.querySelectorAll('[data-round="r32"]')).toHaveLength(2); // one per side
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: FAIL — `src/render-bracket.ts` does not exist.

- [ ] **Step 3: Implement**

Create `src/render-bracket.ts`:

```ts
import type {
  Bracket,
  BracketMatch,
  BracketSlot,
  KnockoutRound,
} from "./types";

const ROUND_LABEL: Record<KnockoutRound, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarterfinals",
  sf: "Semifinals",
  final: "Final",
  third: "Third place",
};

const LEFT_COLUMN_ROUNDS: KnockoutRound[] = ["r32", "r16", "qf", "sf"];

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showScore(m: BracketMatch, slot: BracketSlot): boolean {
  return !slot.tbd && (m.status === "finished" || m.status === "live");
}

function slotRow(m: BracketMatch, slot: BracketSlot): HTMLElement {
  const row = el("div", slot.tbd ? "bm-row tbd" : "bm-row");
  if (!slot.tbd) row.setAttribute("data-team", slot.code);

  if (slot.tbd || !slot.flagUrl) {
    row.appendChild(el("span", "bm-flagph"));
  } else {
    const img = document.createElement("img");
    img.className = "bm-flag";
    img.src = slot.flagUrl;
    img.alt = slot.code;
    img.addEventListener("error", () =>
      img.replaceWith(el("span", "bm-flagph")),
    );
    row.appendChild(img);
  }

  row.appendChild(el("span", "bm-name", slot.tbd ? "TBD" : slot.name));
  if (showScore(m, slot)) {
    row.appendChild(el("span", "bm-score", String(slot.score)));
  }
  return row;
}

function matchEl(m: BracketMatch, extraClass = ""): HTMLElement {
  const box = el("div", `bm${m.status === "live" ? " live" : ""}${extraClass}`);
  box.setAttribute("data-match", m.id);
  box.appendChild(slotRow(m, m.home));
  box.appendChild(slotRow(m, m.away));
  return box;
}

function columnEl(matches: BracketMatch[], round: KnockoutRound): HTMLElement {
  const col = el("div", `bcol ${round}`);
  col.setAttribute("data-round", round);
  col.appendChild(el("div", "bcol-label", ROUND_LABEL[round]));
  const cells = el("div", "bcol-cells");
  for (const m of matches) {
    const cell = el("div", "bcell");
    cell.appendChild(matchEl(m));
    cells.appendChild(cell);
  }
  col.appendChild(cells);
  return col;
}

function sideEl(
  columns: BracketMatch[][],
  side: "left" | "right",
): HTMLElement {
  const wrap = el("div", `bside ${side}`);
  // left renders outer→inner (r32..sf); right renders inner→outer (sf..r32).
  const order =
    side === "left"
      ? LEFT_COLUMN_ROUNDS.map((_, i) => i)
      : LEFT_COLUMN_ROUNDS.map((_, i) => LEFT_COLUMN_ROUNDS.length - 1 - i);
  for (const i of order) {
    wrap.appendChild(columnEl(columns[i], LEFT_COLUMN_ROUNDS[i]));
  }
  return wrap;
}

function finalColumn(bracket: Bracket): HTMLElement {
  const col = el("div", "bcol final");
  col.setAttribute("data-round", "final");
  col.appendChild(el("div", "bcol-label", ROUND_LABEL.final));
  const cells = el("div", "bcol-cells");
  const cell = el("div", "bcell bfinal-cell");
  cell.appendChild(el("div", "btrophy", "🏆"));
  if (bracket.final) {
    cell.appendChild(matchEl(bracket.final, " final-box"));
  }
  const thirdText = bracket.third
    ? thirdLabel(bracket.third)
    : "3rd place · TBD";
  cell.appendChild(el("div", "bthird", thirdText));
  cells.appendChild(cell);
  col.appendChild(cells);
  return col;
}

function thirdLabel(m: BracketMatch): string {
  const name = (s: BracketSlot) => (s.tbd ? "TBD" : s.code || s.name);
  if (m.status === "finished" || m.status === "live") {
    return `3rd: ${name(m.home)} ${m.home.score}–${m.away.score} ${name(m.away)}`;
  }
  return `3rd: ${name(m.home)} v ${name(m.away)}`;
}

export function renderFullBracket(
  container: HTMLElement,
  bracket: Bracket,
): void {
  container.replaceChildren();
  container.appendChild(
    el("h2", "bracket-title", "FIFA World Cup 2026 — Knockout Bracket"),
  );
  const board = el("div", "bboard");
  board.appendChild(sideEl(bracket.left, "left"));
  board.appendChild(finalColumn(bracket));
  board.appendChild(sideEl(bracket.right, "right"));
  container.appendChild(board);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render-bracket.ts tests/render-bracket.test.ts
git commit -m "feat(bracket): full bracket renderer"
```

---

## Task 8: Focused bracket renderer

**Files:**

- Modify: `src/render-bracket.ts`
- Test: `tests/render-bracket.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/render-bracket.test.ts`:

```ts
import { renderFocusedBracket } from "../src/render-bracket";

describe("renderFocusedBracket", () => {
  function focusBracket() {
    const games = [
      ko("73", 4, "a", "b", {
        homeScore: 1,
        awayScore: 0,
        kickoff: new Date(2026, 6, 1, 17, 0),
      }),
      ko("74", 4, "0", "0", { kickoff: new Date(2026, 6, 1, 20, 0) }),
    ];
    return buildBracket(
      games,
      [team("a", "BRA"), team("b", "JPN")],
      new Date(2026, 6, 1, 18, 0),
    );
  }

  it("renders a large card per active-round match with both sides", () => {
    const c = document.createElement("div");
    renderFocusedBracket(c, focusBracket(), 0);
    expect(c.querySelector('[data-match="73"]')).toBeTruthy();
    expect(c.textContent).toContain("BRA");
    expect(c.textContent).toContain("JPN");
  });

  it("marks live matches and shows their score", () => {
    const c = document.createElement("div");
    renderFocusedBracket(c, focusBracket(), 0);
    const card = c.querySelector(".bfocus-card.live")!;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain("1");
  });

  it("renders a progress rail with a dot per round", () => {
    const c = document.createElement("div");
    renderFocusedBracket(c, focusBracket(), 0);
    expect(c.querySelector(".bfocus-rail")).toBeTruthy();
    expect(c.querySelectorAll(".brail-dot").length).toBeGreaterThan(0);
  });

  it("repaints in place", () => {
    const c = document.createElement("div");
    renderFocusedBracket(c, focusBracket(), 0);
    renderFocusedBracket(c, focusBracket(), 1);
    expect(c.querySelectorAll(".bfocus-main")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: FAIL — `renderFocusedBracket` not exported.

- [ ] **Step 3: Implement**

Add to the imports at the top of `src/render-bracket.ts`:

```ts
import { activeRound } from "./bracket";
```

Append to `src/render-bracket.ts`:

```ts
const FOCUS_PAGE_SIZE = 4;
const RAIL_ROUNDS: KnockoutRound[] = ["r32", "r16", "qf", "sf", "final"];

const STATUS_RANK: Record<string, number> = {
  live: 0,
  upcoming: 1,
  finished: 2,
};

function orderForFocus(matches: BracketMatch[]): BracketMatch[] {
  return [...matches].sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    // upcoming soonest-first; finished/live most-recent-first.
    const dir = a.status === "upcoming" ? 1 : -1;
    return dir * (a.kickoff.getTime() - b.kickoff.getTime());
  });
}

function whenText(m: BracketMatch): string {
  if (m.status === "live") return "LIVE";
  const opts: Intl.DateTimeFormatOptions =
    m.status === "finished"
      ? { weekday: "short" }
      : { weekday: "short", hour: "numeric", minute: "2-digit" };
  return m.kickoff.toLocaleString(undefined, opts);
}

function focusSide(slot: BracketSlot, side: "home" | "away"): HTMLElement {
  const wrap = el("div", `bfocus-side ${side}`);
  const name = el("span", undefined, slot.tbd ? "TBD" : slot.code || slot.name);
  if (!slot.tbd && slot.flagUrl) {
    const img = document.createElement("img");
    img.src = slot.flagUrl;
    img.alt = slot.code;
    img.addEventListener("error", () => img.remove());
    // Flag before name on the home side, after on the away side.
    if (side === "home") {
      wrap.appendChild(img);
      wrap.appendChild(name);
    } else {
      wrap.appendChild(name);
      wrap.appendChild(img);
    }
  } else {
    wrap.appendChild(name);
  }
  return wrap;
}

function focusCard(m: BracketMatch): HTMLElement {
  const card = el("div", `bfocus-card${m.status === "live" ? " live" : ""}`);
  card.setAttribute("data-match", m.id);
  card.appendChild(focusSide(m.home, "home"));

  const mid = el("div", "bfocus-mid");
  const scored = m.status === "finished" || m.status === "live";
  mid.appendChild(
    el("div", "bfocus-vs", scored ? `${m.home.score} – ${m.away.score}` : "vs"),
  );
  mid.appendChild(el("div", "bfocus-when", whenText(m)));
  card.appendChild(mid);

  card.appendChild(focusSide(m.away, "away"));
  return card;
}

function progressRail(bracket: Bracket): HTMLElement {
  const rail = el("div", "bfocus-rail");
  rail.appendChild(el("div", "brail-round", "Bracket progress"));
  for (const round of RAIL_ROUNDS) {
    const matches = bracket.rounds[round];
    if (!matches.length) continue;
    rail.appendChild(el("div", "brail-round", ROUND_LABEL[round]));
    const dots = el("div", "brail-dots");
    for (const m of matches) {
      const cls =
        m.status === "live"
          ? "brail-dot live"
          : m.status === "finished"
            ? "brail-dot done"
            : "brail-dot";
      dots.appendChild(el("span", cls));
    }
    rail.appendChild(dots);
  }
  return rail;
}

export function renderFocusedBracket(
  container: HTMLElement,
  bracket: Bracket,
  pageIndex = 0,
): void {
  container.replaceChildren();
  const round = activeRound(bracket);
  const matches = orderForFocus(bracket.rounds[round]);
  const pages = Math.max(1, Math.ceil(matches.length / FOCUS_PAGE_SIZE));
  const page = ((pageIndex % pages) + pages) % pages;
  const shown = matches.slice(
    page * FOCUS_PAGE_SIZE,
    page * FOCUS_PAGE_SIZE + FOCUS_PAGE_SIZE,
  );

  container.appendChild(
    el(
      "div",
      "bfocus-title",
      `${ROUND_LABEL[round]}${pages > 1 ? ` · ${page + 1}/${pages}` : ""}`,
    ),
  );

  const focus = el("div", "bfocus");
  const main = el("div", "bfocus-main");
  for (const m of shown) main.appendChild(focusCard(m));
  focus.appendChild(main);
  focus.appendChild(progressRail(bracket));
  container.appendChild(focus);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render-bracket.ts tests/render-bracket.test.ts
git commit -m "feat(bracket): focused current-round renderer"
```

---

## Task 9: Wire into main.ts

**Files:**

- Modify: `src/main.ts`

No new unit test (this is runtime wiring; covered by e2e in Task 10). Keep edits minimal and follow the existing structure.

- [ ] **Step 1: Update imports and module state**

In `src/main.ts`, extend the imports:

```ts
import { computeStandings, buildScoreFeed, filterGroups } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import { selectView, buildBracket } from "./bracket";
import { renderFullBracket, renderFocusedBracket } from "./render-bracket";
```

Grab the bracket element near the other element lookups:

```ts
const bracketEl = document.getElementById("bracket")!;
```

Add focused-rotation state near the other `let` declarations:

```ts
let lastGames: Game[] = [];
let focusTimer: number | undefined;
let focusPage = 0;
const FOCUS_ROTATE_MS = 10_000;
```

- [ ] **Step 2: Keep the latest games around**

In `refresh()`, after `const games = await fetchGames();`, add:

```ts
lastGames = games;
```

In `seedFromCache()`, after `cachedTeams = cached.teams;`, add:

```ts
lastGames = cached.games;
```

- [ ] **Step 3: Replace `paint` with view-aware painting**

Replace the existing `paint` function body with:

```ts
function paint(s: Snapshot): void {
  const view = selectView(lastGames, new Date(), config);
  appEl.setAttribute("data-view", view);

  if (view === "bracket") {
    paintBracket();
    return;
  }

  stopFocusRotation();
  bracketEl.style.display = "none";
  groupsEl.style.display = "";
  if (config.scores) scoresEl.style.display = "";

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

function paintBracket(): void {
  groupsEl.style.display = "none";
  scoresEl.style.display = "none";
  bracketEl.style.display = "";

  const bracket = buildBracket(lastGames, cachedTeams ?? [], new Date());

  if (config.bracket === "focused") {
    renderFocusedBracket(bracketEl, bracket, focusPage);
    startFocusRotation();
  } else {
    stopFocusRotation();
    renderFullBracket(bracketEl, bracket);
  }
}

function startFocusRotation(): void {
  if (focusTimer !== undefined) return;
  focusTimer = window.setInterval(() => {
    focusPage += 1;
    const bracket = buildBracket(lastGames, cachedTeams ?? [], new Date());
    renderFocusedBracket(bracketEl, bracket, focusPage);
  }, FOCUS_ROTATE_MS);
}

function stopFocusRotation(): void {
  if (focusTimer === undefined) return;
  window.clearInterval(focusTimer);
  focusTimer = undefined;
}
```

- [ ] **Step 4: Stop rotation when the tab is hidden**

In the existing `visibilitychange` handler, in the `if (document.hidden)` branch, add `stopFocusRotation();` alongside `stop();`:

```ts
  if (document.hidden) {
    stop();
    stopFocusRotation();
  } else {
```

- [ ] **Step 5: Typecheck + build**

Run: `"$NODE" node_modules/vite/bin/vite.js build`
Expected: builds with no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat(bracket): select and render the bracket view in main"
```

---

## Task 10: E2E tests

**Files:**

- Create: `e2e/bracket.spec.ts`

These run against the dev server with live Worker data. Force the view so the test is deterministic regardless of tournament state. Assert on structure (round columns, cards), not specific team names, since live data changes.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/bracket.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("view=bracket shows the full bracket with round columns", async ({
  page,
}) => {
  await page.goto("/?view=bracket");
  await expect(page.locator("#bracket")).toBeVisible();
  await expect(page.locator("#groups")).toBeHidden();
  // All six round columns render (r32/r16/qf/sf on both sides + final).
  await expect(page.locator('[data-round="r32"]').first()).toBeVisible();
  await expect(page.locator('[data-round="final"]')).toBeVisible();
  // At least one R32 match box is present.
  await expect(page.locator(".bm").first()).toBeVisible();
});

test("view=bracket&bracket=focused shows large match cards", async ({
  page,
}) => {
  await page.goto("/?view=bracket&bracket=focused");
  await expect(page.locator(".bfocus-main")).toBeVisible();
  await expect(page.locator(".bfocus-card").first()).toBeVisible();
  await expect(page.locator(".bfocus-rail")).toBeVisible();
});

test("view=standings still shows group tables", async ({ page }) => {
  await page.goto("/?view=standings");
  await expect(page.locator("[data-group]").first()).toBeVisible();
  await expect(page.locator("#bracket")).toBeHidden();
});
```

- [ ] **Step 2: Run e2e**

Run: `"$NODE" node_modules/@playwright/test/cli.js test e2e/bracket.spec.ts`
(If the runner needs the package script, use `pnpm e2e` per `CLAUDE.md` once shims work; otherwise the direct path above.)
Expected: 3 passed. If the focused/full cards depend on data the live Worker hasn't populated, the structural locators above still resolve because forced `view=bracket` always renders columns/cards (TBD slots included).

- [ ] **Step 3: Commit**

```bash
git add e2e/bracket.spec.ts
git commit -m "test(bracket): e2e for forced bracket and focused views"
```

---

## Task 11: Docs, format, full suite

**Files:**

- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Document the params**

In `README.md`, in the URL-params section, add rows/entries:

- `view` — `auto` (default) | `standings` | `bracket`. `auto` shows group standings until every group match is finished (or the first knockout has kicked off), then the knockout bracket.
- `bracket` — `full` (default) | `focused`. `full` is the whole mirrored bracket; `focused` shows large cards for the current round and rotates pages every 10s.

In `CLAUDE.md`, under Architecture, add one line:

> The client also derives a knockout `Bracket` from the same games
> (`bracket.ts`, round inferred from `matchday`) and `main.ts` auto-switches
> standings → bracket via `selectView`. Layouts in `render-bracket.ts`.

- [ ] **Step 2: Format**

Run: `"$NODE" node_modules/prettier/bin/prettier.cjs --write .`
Expected: files reformatted/clean.

- [ ] **Step 3: Run the full unit suite**

Run: `"$NODE" node_modules/vitest/vitest.mjs run`
Expected: all suites PASS.

- [ ] **Step 4: Build**

Run: `"$NODE" node_modules/vite/bin/vite.js build`
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(bracket): document view/bracket params and architecture"
```

---

## Task 12: Manual verification + open the PR

- [ ] **Step 1: Manual smoke test**

Run the dev server (`pnpm dev` or `"$NODE" node_modules/vite/bin/vite.js`) and check:

- `/?view=bracket` — full bracket renders, R32 shows real teams + flags, later rounds TBD, connectors align, fits the viewport without scrollbars.
- `/?view=bracket&bracket=focused` — large cards rotate every 10s, progress rail shows dots.
- `/?view=standings` — unchanged standings.
- `/` (auto) — standings now; will flip to bracket once group games finish.

- [ ] **Step 2: Push and open PR** (only when the user asks)

```bash
git push -u origin feat/knockout-bracket
```

Then use the `new-pr` skill / repo PR template.

---

## Notes / risks (carried from the spec)

- **Bracket linkage assumption:** connector positions assume the source numbers
  knockout games in bracket order (adjacent id pairs feed the next round). Team
  names are always source-provided, so a wrong assumption is cosmetic. The only
  ordering logic lives in `buildBracket` (`half()` + id sort) — fix there if
  verification after R32 shows otherwise.
- **Round from matchday:** `roundOf` maps 4→r32 … 9→final. This is correct for
  the worldcup26.ir source. If the football-data.org fallback ever serves
  knockout games with different matchday numbering, knockout games would be
  miscategorized; acceptable since the fallback is rarely used and primary
  carries the full bracket.
- **Score ticker hidden in bracket mode** and **focused rotation = 10s** are the
  approved defaults.

```

```
