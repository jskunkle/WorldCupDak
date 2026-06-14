# URL Parameters + Auto-Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard configurable via URL query parameters and auto-scale ("fit") the content so the selected groups + score feed always fill a fixed panel with no scrolling.

**Architecture:** A new pure `parseConfig(search)` reads `window.location.search` into a typed `DashboardConfig` at startup. Display shaping (group filtering, feed limits, column detail, highlight, grid dimensions, theme) is driven by that config. Auto-scale is a binary search over root `font-size` that finds the largest size where `#app` does not overflow; fit-mode CSS (scoped under `#app[data-fit="on"]`) makes the layout content-sized so overflow is detectable.

**Tech Stack:** TypeScript, Vite, vanilla DOM. Vitest (jsdom) for unit tests, Playwright for e2e. Prettier for formatting (`pnpm format`).

**Conventions (match existing code):**

- Unit tests live in `tests/*.test.ts`, import `{ describe, it, expect }` explicitly from `vitest`.
- e2e specs live in `e2e/*.spec.ts`, import from `@playwright/test`.
- 2-space indent, double quotes, trailing commas (Prettier defaults already in repo).
- Run unit tests: `pnpm test`. Run e2e: `pnpm e2e`. Format: `pnpm format`.

**Branch:** Work continues on `feat/url-params-autoscale` (already created; the design spec is committed there).

---

## File Structure

**Create:**

- `src/config.ts` — `DashboardConfig` interface, `parseConfig(search)`, `deriveGrid(n, cols, rows)`. Pure, no DOM.
- `src/fit.ts` — `binarySearchLargest(...)` (pure) and `fitToViewport(app)` (DOM measurement loop).
- `tests/config.test.ts` — tests for `parseConfig` and `deriveGrid`.
- `tests/fit.test.ts` — tests for `binarySearchLargest`.
- `e2e/params.spec.ts` — e2e for params + no-scroll fit.

**Modify:**

- `src/standings.ts` — add `filterGroups(...)`; make `buildScoreFeed` accept limits.
- `src/render.ts` — `renderStandings` accepts `{ detail, highlight }`; column set + highlight class.
- `src/main.ts` — parse config, apply theme/fit/grid/scores, wire refresh interval + resize fit.
- `src/styles.css` — theme variables, configurable grid vars, fit-mode overrides, highlight + `--strong` var.
- `README.md` — document each parameter with examples.

---

## Task 1: Config types + `parseConfig`

**Files:**

- Create: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config";

describe("parseConfig", () => {
  it("returns documented defaults for an empty query string", () => {
    expect(parseConfig("")).toEqual({
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
    });
  });

  it("parses a CSV of group letters, uppercased, A–L only, deduped", () => {
    expect(parseConfig("?groups=a,B,b,Z,C").groups).toEqual(["A", "B", "C"]);
  });

  it("treats an all-invalid groups list as null (show all)", () => {
    expect(parseConfig("?groups=Z,9,").groups).toBeNull();
  });

  it("parses cols/rows as positive integers, else null", () => {
    expect(parseConfig("?cols=3&rows=4")).toMatchObject({ cols: 3, rows: 4 });
    expect(parseConfig("?cols=0&rows=-2")).toMatchObject({
      cols: null,
      rows: null,
    });
    expect(parseConfig("?cols=abc")).toMatchObject({ cols: null });
  });

  it("parses detail (only 'compact' switches off 'full')", () => {
    expect(parseConfig("?detail=compact").detail).toBe("compact");
    expect(parseConfig("?detail=anything").detail).toBe("full");
  });

  it("disables the feed only on scores=off", () => {
    expect(parseConfig("?scores=off").scores).toBe(false);
    expect(parseConfig("?scores=on").scores).toBe(true);
  });

  it("parses upcoming/finished as non-negative ints, else default", () => {
    expect(parseConfig("?upcoming=3&finished=10")).toMatchObject({
      upcoming: 3,
      finished: 10,
    });
    expect(parseConfig("?upcoming=-1&finished=x")).toMatchObject({
      upcoming: 5,
      finished: 8,
    });
    expect(parseConfig("?upcoming=0").upcoming).toBe(0);
  });

  it("parses refresh seconds into ms and clamps to a 30s minimum", () => {
    expect(parseConfig("?refresh=120").refreshMs).toBe(120_000);
    expect(parseConfig("?refresh=10").refreshMs).toBe(30_000);
    expect(parseConfig("?refresh=junk").refreshMs).toBe(90_000);
  });

  it("parses theme (only 'light' switches off 'dark')", () => {
    expect(parseConfig("?theme=light").theme).toBe("light");
    expect(parseConfig("?theme=neon").theme).toBe("dark");
  });

  it("parses highlight as uppercased, trimmed, non-empty codes", () => {
    expect(parseConfig("?highlight=usa, mex ,,can").highlight).toEqual([
      "USA",
      "MEX",
      "CAN",
    ]);
  });

  it("disables fit only on fit=off", () => {
    expect(parseConfig("?fit=off").fit).toBe(false);
    expect(parseConfig("?fit=on").fit).toBe(true);
  });

  it("ignores unknown params", () => {
    expect(() => parseConfig("?bogus=1&groups=A")).not.toThrow();
    expect(parseConfig("?bogus=1&groups=A").groups).toEqual(["A"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/config.test.ts`
Expected: FAIL — `Failed to resolve import "../src/config"` / `parseConfig is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/config.ts`:

```ts
export interface DashboardConfig {
  groups: string[] | null; // null = show all groups
  cols: number | null; // null = derive from group count
  rows: number | null; // null = derive from group count
  detail: "compact" | "full";
  scores: boolean;
  upcoming: number;
  finished: number;
  refreshMs: number;
  theme: "dark" | "light";
  highlight: string[]; // FIFA codes, uppercased
  fit: boolean;
}

const DEFAULTS: DashboardConfig = {
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
};

const MIN_REFRESH_MS = 30_000;

function positiveInt(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function nonNegativeInt(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function csvCodes(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
}

export function parseConfig(search: string): DashboardConfig {
  const p = new URLSearchParams(search);

  const groupLetters = csvCodes(p.get("groups")).filter((s) =>
    /^[A-L]$/.test(s),
  );
  const groups = [...new Set(groupLetters)];

  const refreshRaw = p.get("refresh");
  const refreshSec =
    refreshRaw === null ? null : Number.parseInt(refreshRaw, 10);
  const refreshMs =
    refreshSec !== null && Number.isInteger(refreshSec)
      ? Math.max(MIN_REFRESH_MS, refreshSec * 1000)
      : DEFAULTS.refreshMs;

  return {
    groups: groups.length > 0 ? groups : null,
    cols: positiveInt(p.get("cols")),
    rows: positiveInt(p.get("rows")),
    detail: p.get("detail") === "compact" ? "compact" : "full",
    scores: p.get("scores") !== "off",
    upcoming: nonNegativeInt(p.get("upcoming"), DEFAULTS.upcoming),
    finished: nonNegativeInt(p.get("finished"), DEFAULTS.finished),
    refreshMs,
    theme: p.get("theme") === "light" ? "light" : "dark",
    highlight: csvCodes(p.get("highlight")),
    fit: p.get("fit") !== "off",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/config.test.ts`
Expected: PASS (all parseConfig cases green).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add parseConfig for URL query parameters"
```

---

## Task 2: `deriveGrid` helper

**Files:**

- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/config.test.ts`:

```ts
import { deriveGrid } from "../src/config";

describe("deriveGrid", () => {
  it("defaults to 2 columns and preserves 2x6 for 12 groups", () => {
    expect(deriveGrid(12, null, null)).toEqual({ cols: 2, rows: 6 });
  });

  it("uses a single column for a single group", () => {
    expect(deriveGrid(1, null, null)).toEqual({ cols: 1, rows: 1 });
  });

  it("derives rows from an explicit column count", () => {
    expect(deriveGrid(8, 4, null)).toEqual({ cols: 4, rows: 2 });
    expect(deriveGrid(7, 3, null)).toEqual({ cols: 3, rows: 3 });
  });

  it("derives columns from an explicit row count", () => {
    expect(deriveGrid(6, null, 2)).toEqual({ cols: 3, rows: 2 });
  });

  it("honors both when given", () => {
    expect(deriveGrid(4, 4, 1)).toEqual({ cols: 4, rows: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/config.test.ts`
Expected: FAIL — `deriveGrid is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/config.ts`:

```ts
export function deriveGrid(
  n: number,
  cols: number | null,
  rows: number | null,
): { cols: number; rows: number } {
  const count = Math.max(1, n);
  if (cols && rows) return { cols, rows };
  if (cols) return { cols, rows: Math.ceil(count / cols) };
  if (rows) return { rows, cols: Math.ceil(count / rows) };
  const c = Math.min(2, count);
  return { cols: c, rows: Math.ceil(count / c) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add deriveGrid for configurable grid dimensions"
```

---

## Task 3: `binarySearchLargest` (auto-scale math)

**Files:**

- Create: `src/fit.ts`
- Test: `tests/fit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/fit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { binarySearchLargest } from "../src/fit";

describe("binarySearchLargest", () => {
  it("finds the largest value satisfying a monotone predicate", () => {
    const best = binarySearchLargest(1, 100, 30, (v) => v <= 10);
    expect(best).toBeLessThanOrEqual(10);
    expect(best).toBeGreaterThan(9.99);
  });

  it("returns the low bound when nothing fits", () => {
    expect(binarySearchLargest(5, 100, 20, () => false)).toBe(5);
  });

  it("returns near the high bound when everything fits", () => {
    const best = binarySearchLargest(1, 50, 30, () => true);
    expect(best).toBeGreaterThan(49.99);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/fit.test.ts`
Expected: FAIL — `Failed to resolve import "../src/fit"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/fit.ts`:

```ts
/**
 * Largest `value` in [lo, hi] for which `fits(value)` is true, assuming `fits`
 * is monotone (true below a threshold, false above it). Runs a fixed number of
 * binary-search iterations. Returns `lo` if nothing fits.
 */
export function binarySearchLargest(
  lo: number,
  hi: number,
  iterations: number,
  fits: (value: number) => boolean,
): number {
  let best = lo;
  let low = lo;
  let high = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  return best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/fit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fit.ts tests/fit.test.ts
git commit -m "feat: add binarySearchLargest for auto-scale fitting"
```

---

## Task 4: Group filtering + configurable feed limits

**Files:**

- Modify: `src/standings.ts`
- Test: `tests/standings.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/standings.test.ts`:

```ts
import { filterGroups } from "../src/standings";
import type { GroupTable } from "../src/types";

describe("filterGroups", () => {
  const tables: GroupTable[] = ["A", "B", "C"].map((group) => ({
    group,
    rows: [],
  }));

  it("returns all tables when the filter is null", () => {
    expect(filterGroups(tables, null).map((t) => t.group)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("returns all tables when the filter is empty", () => {
    expect(filterGroups(tables, []).map((t) => t.group)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("keeps only the requested groups, preserving A..L order", () => {
    expect(filterGroups(tables, ["C", "A"]).map((t) => t.group)).toEqual([
      "A",
      "C",
    ]);
  });
});

describe("buildScoreFeed limits", () => {
  const now = new Date(2026, 5, 14, 18, 0);
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

  it("respects custom upcoming/finished limits", () => {
    const games = [
      ...Array.from({ length: 6 }, (_, i) =>
        fg(`u${i}`, { kickoff: new Date(2026, 5, 15, 12 + i, 0) }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        fg(`f${i}`, {
          finished: true,
          kickoff: new Date(2026, 5, 10 + i, 12, 0),
        }),
      ),
    ];
    const feed = buildScoreFeed(games, now, { maxUpcoming: 2, maxFinished: 3 });
    expect(feed.filter((m) => m.kind === "upcoming")).toHaveLength(2);
    expect(feed.filter((m) => m.kind === "finished")).toHaveLength(3);
  });
});
```

Note: `Game` is already imported at the top of this test file (`import type { Team, Game }`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/standings.test.ts`
Expected: FAIL — `filterGroups is not a function` and the limits test (extra arg ignored) failing on counts.

- [ ] **Step 3: Write minimal implementation**

In `src/standings.ts`, add `GroupTable` to the type import if not present (it is already imported). Add the `filterGroups` export near the other exports:

```ts
export function filterGroups(
  tables: GroupTable[],
  letters: string[] | null,
): GroupTable[] {
  if (!letters || letters.length === 0) return tables;
  const want = new Set(letters);
  return tables.filter((t) => want.has(t.group));
}
```

Change the `buildScoreFeed` signature and slicing (replace lines 100 and 116–120):

```ts
export function buildScoreFeed(
  games: Game[],
  now: Date,
  limits: { maxFinished?: number; maxUpcoming?: number } = {},
): FeedMatch[] {
  const maxFinished = limits.maxFinished ?? MAX_FINISHED;
  const maxUpcoming = limits.maxUpcoming ?? MAX_UPCOMING;
```

and the return:

```ts
return [
  ...live,
  ...finished.slice(0, maxFinished),
  ...upcoming.slice(0, maxUpcoming),
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/standings.test.ts`
Expected: PASS (existing buildScoreFeed tests still green — defaults unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/standings.ts tests/standings.test.ts
git commit -m "feat: add group filtering and configurable feed limits"
```

---

## Task 5: Render column detail + highlight

**Files:**

- Modify: `src/render.ts`
- Test: `tests/render.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/render.test.ts`:

```ts
describe("renderStandings options", () => {
  it("renders the full 11-column table by default", () => {
    const container = document.createElement("div");
    renderStandings(container, makeGroups());
    const ths = container.querySelectorAll('[data-group="A"] th');
    expect(ths).toHaveLength(11);
  });

  it("renders a compact 5-column table when detail is compact", () => {
    const container = document.createElement("div");
    renderStandings(container, makeGroups(), { detail: "compact" });
    const a = container.querySelector('[data-group="A"]')!;
    const headers = [...a.querySelectorAll("th")].map((th) => th.textContent);
    expect(headers).toEqual(["#", "", "Team", "GD", "Pts"]);
    expect(
      a.querySelector('[data-team="T1"]')?.querySelectorAll("td"),
    ).toHaveLength(5);
  });

  it("adds a highlight class to rows whose code is listed", () => {
    const container = document.createElement("div");
    renderStandings(container, makeGroups(), { highlight: ["T1"] });
    const a = container.querySelector('[data-group="A"]')!;
    expect(
      a.querySelector('[data-team="T1"]')?.classList.contains("row--highlight"),
    ).toBe(true);
    expect(
      a.querySelector('[data-team="T2"]')?.classList.contains("row--highlight"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/render.test.ts`
Expected: FAIL — compact headers/cell counts wrong, highlight class absent.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `renderStandings` in `src/render.ts` (lines 10–56) with:

```ts
interface StatColumn {
  header: string;
  get: (r: StandingRow) => number;
  className?: string;
}

const FULL_STATS: StatColumn[] = [
  { header: "GP", get: (r) => r.gp },
  { header: "W", get: (r) => r.w },
  { header: "D", get: (r) => r.d },
  { header: "L", get: (r) => r.l },
  { header: "GF", get: (r) => r.gf },
  { header: "GA", get: (r) => r.ga },
  { header: "GD", get: (r) => r.gd },
  { header: "Pts", get: (r) => r.pts, className: "pts" },
];

const COMPACT_STATS: StatColumn[] = [
  { header: "GD", get: (r) => r.gd },
  { header: "Pts", get: (r) => r.pts, className: "pts" },
];

export function renderStandings(
  container: HTMLElement,
  groups: GroupTable[],
  options: { detail?: "compact" | "full"; highlight?: string[] } = {},
): void {
  container.replaceChildren(); // in-place refresh: clear then repaint

  const stats = options.detail === "compact" ? COMPACT_STATS : FULL_STATS;
  const highlight = new Set(options.highlight ?? []);

  for (const g of groups) {
    const card = el("section", "group-card");
    card.setAttribute("data-group", g.group);
    card.appendChild(el("h2", "group-title", `Group ${g.group}`));

    const table = el("table", "standings");
    const head = el("tr", "head");
    ["#", "", "Team", ...stats.map((s) => s.header)].forEach((h) =>
      head.appendChild(el("th", undefined, h)),
    );
    table.appendChild(head);

    g.rows.forEach((r) => {
      const classes = ["row"];
      if (r.rank <= 2) classes.push("advancing");
      if (highlight.has(r.code)) classes.push("row--highlight");
      const tr = el("tr", classes.join(" "));
      tr.setAttribute("data-team", r.code);

      tr.appendChild(el("td", "rank", String(r.rank)));

      const flagCell = el("td", "flag-cell");
      const flag = document.createElement("img");
      flag.className = "flag";
      flag.src = r.flagUrl;
      flag.alt = r.name;
      flag.addEventListener("error", () => {
        flagCell.replaceChildren(el("span", "flag-fallback", r.code));
      });
      flagCell.appendChild(flag);
      tr.appendChild(flagCell);

      tr.appendChild(el("td", "team", r.code));
      stats.forEach((s) =>
        tr.appendChild(el("td", s.className, String(s.get(r)))),
      );
      table.appendChild(tr);
    });

    card.appendChild(table);
    container.appendChild(card);
  }
}
```

Update the type import at the top of `src/render.ts` to include `StandingRow`:

```ts
import type { GroupTable, FeedMatch, StandingRow } from "./types";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/render.test.ts`
Expected: PASS. The existing "marks the top two rows as advancing" test still passes (the `advancing` class is still applied). The existing points-in-row test still passes (Pts column present in both modes).

- [ ] **Step 5: Commit**

```bash
git add src/render.ts tests/render.test.ts
git commit -m "feat: support compact column detail and row highlighting"
```

---

## Task 6: CSS — theme, configurable grid, fit-mode, highlight

**Files:**

- Modify: `src/styles.css`

No unit test (pure styling; verified by e2e in Task 9 and manual review).

- [ ] **Step 1: Add a base root font-size, a `--strong` var, and a light theme**

Replace the `:root { ... }` block at the top of `src/styles.css` (lines 1–9) with:

```css
:root {
  font-size: 16px;
  --bg: #0b0f17;
  --panel: #111827;
  --line: #1b2433;
  --text: #e8edf5;
  --muted: #56708f;
  --accent: #ffd25a;
  --live: #ff5a5a;
  --strong: #ffffff;
}

:root[data-theme="light"] {
  --bg: #f4f6fb;
  --panel: #ffffff;
  --line: #d7deea;
  --text: #1a2230;
  --muted: #5a6b82;
  --accent: #b8860b;
  --live: #d62828;
  --strong: #0b0f17;
}
```

- [ ] **Step 2: Make the grid dimensions configurable**

Replace the `.groups { ... }` block (lines 32–39) with:

```css
.groups {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), 1fr);
  grid-template-rows: repeat(var(--rows, 6), 1fr);
  gap: 0.6vh 2vw;
  min-height: 0;
}
```

- [ ] **Step 3: Replace hardcoded white with the `--strong` var**

Change `.standings tr.advancing td` (lines 90–92):

```css
.standings tr.advancing td {
  color: var(--strong);
}
```

Change `.match .score` (lines 127–130):

```css
.match .score {
  font-weight: 700;
  color: var(--strong);
}
```

- [ ] **Step 4: Add highlight styling and fit-mode overrides**

Append to the end of `src/styles.css`:

```css
.standings tr.row--highlight td {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.standings tr.row--highlight td.team {
  box-shadow: inset 3px 0 0 var(--accent);
}

/* Auto-scale (fit) mode: size everything in rem/em off the root font-size,
   which fitToViewport() adjusts. Content-sized rows let #app overflow so the
   binary search can detect the largest font that fits. */
#app[data-fit="on"] {
  overflow: hidden;
}
#app[data-fit="on"] .groups {
  flex: 0 0 auto;
  grid-template-rows: repeat(var(--rows, 6), min-content);
  align-content: start;
}
#app[data-fit="on"] .group-title {
  font-size: 1.05rem;
}
#app[data-fit="on"] .standings th {
  font-size: 0.7rem;
}
#app[data-fit="on"] .standings td {
  font-size: 0.95rem;
}
#app[data-fit="on"] .match {
  font-size: 1.05rem;
}
```

- [ ] **Step 5: Verify the build still compiles**

Run: `pnpm build`
Expected: `tsc` passes and Vite build succeeds (CSS is not type-checked, but this confirms no syntax break elsewhere).

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "feat: add theme, configurable grid, fit-mode, and highlight styles"
```

---

## Task 7: `fitToViewport` DOM routine

**Files:**

- Modify: `src/fit.ts`

Covered by e2e (Task 9); jsdom has no layout engine so this is not unit-tested.

- [ ] **Step 1: Add the DOM measurement loop**

Append to `src/fit.ts`:

```ts
const MIN_FONT_PX = 6;
const MAX_FONT_PX = 160;
const FIT_ITERATIONS = 14;

/**
 * Sets the root font-size to the largest value at which `#app` does not
 * overflow its viewport box in either axis. All fit-mode sizes are expressed
 * in rem/em, so this scales the whole board. Safe to call repeatedly.
 */
export function fitToViewport(app: HTMLElement): void {
  const root = document.documentElement;
  const fits = (fontPx: number): boolean => {
    root.style.fontSize = `${fontPx}px`;
    return (
      app.scrollHeight <= app.clientHeight && app.scrollWidth <= app.clientWidth
    );
  };
  const best = binarySearchLargest(
    MIN_FONT_PX,
    MAX_FONT_PX,
    FIT_ITERATIONS,
    fits,
  );
  root.style.fontSize = `${best}px`;
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/fit.ts
git commit -m "feat: add fitToViewport auto-scale routine"
```

---

## Task 8: Wire config into `main.ts`

**Files:**

- Modify: `src/main.ts`

- [ ] **Step 1: Replace `src/main.ts` with the config-driven version**

```ts
import { fetchData } from "./api";
import { computeStandings, buildScoreFeed, filterGroups } from "./standings";
import { renderStandings, renderScoreFeed } from "./render";
import { parseConfig, deriveGrid } from "./config";
import { fitToViewport } from "./fit";
import type { Snapshot } from "./types";

const config = parseConfig(window.location.search);

const appEl = document.getElementById("app")!;
const groupsEl = document.getElementById("groups")!;
const scoresEl = document.getElementById("scores")!;

// Apply one-time config to the DOM.
document.documentElement.setAttribute("data-theme", config.theme);
appEl.setAttribute("data-fit", config.fit ? "on" : "off");
if (!config.scores) scoresEl.style.display = "none";

let lastGood: Snapshot | null = null;
let timer: number | undefined;
let resizeTimer: number | undefined;

async function refresh(): Promise<void> {
  try {
    const { teams, games } = await fetchData();
    lastGood = {
      groups: filterGroups(computeStandings(teams, games), config.groups),
      feed: buildScoreFeed(games, new Date(), {
        maxUpcoming: config.upcoming,
        maxFinished: config.finished,
      }),
    };
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

void refresh();
start();
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm build`
Expected: PASS (no unused imports, no type errors).

- [ ] **Step 3: Run the full unit suite**

Run: `pnpm test`
Expected: PASS — all config, fit, standings, render, api tests green.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: drive dashboard from URL config and auto-scale"
```

---

## Task 9: End-to-end tests

**Files:**

- Create: `e2e/params.spec.ts`

These run against the real upstream API (same as the existing e2e). Keep assertions resilient to live data.

- [ ] **Step 1: Write the e2e spec**

Create `e2e/params.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("groups param shows only the requested groups", async ({ page }) => {
  await page.goto("/?groups=A,B");
  await expect(page.locator('[data-group="A"]')).toBeVisible();
  await expect(page.locator('[data-group="B"]')).toBeVisible();
  await expect(page.locator("[data-group]")).toHaveCount(2);
});

test("scores=off hides the score feed", async ({ page }) => {
  await page.goto("/?scores=off");
  await expect(page.locator("#scores")).toBeHidden();
});

test("theme=light sets the light theme", async ({ page }) => {
  await page.goto("/?theme=light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("detail=compact renders five columns per table", async ({ page }) => {
  await page.goto("/?groups=A&detail=compact");
  await expect(page.locator('[data-group="A"] th')).toHaveCount(5);
});

test("highlight only marks the named team rows", async ({ page }) => {
  await page.goto("/?highlight=USA");
  // Wait for data to render.
  await expect(page.locator("[data-team]").first()).toBeVisible();
  const highlighted = page.locator("tr.row--highlight");
  const count = await highlighted.count();
  for (let i = 0; i < count; i++) {
    await expect(highlighted.nth(i)).toHaveAttribute("data-team", "USA");
  }
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`fit keeps content within the viewport (${size.width}x${size.height}, few groups)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/?groups=A,B");
    await expect(page.locator('[data-group="A"]')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const app = document.getElementById("app")!;
      return {
        dh: app.scrollHeight - app.clientHeight,
        dw: app.scrollWidth - app.clientWidth,
      };
    });
    expect(overflow.dh).toBeLessThanOrEqual(1);
    expect(overflow.dw).toBeLessThanOrEqual(1);
  });

  test(`fit keeps content within the viewport (${size.width}x${size.height}, all groups)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto("/");
    await expect(page.locator('[data-group="L"]')).toBeVisible();
    const overflow = await page.evaluate(() => {
      const app = document.getElementById("app")!;
      return {
        dh: app.scrollHeight - app.clientHeight,
        dw: app.scrollWidth - app.clientWidth,
      };
    });
    expect(overflow.dh).toBeLessThanOrEqual(1);
    expect(overflow.dw).toBeLessThanOrEqual(1);
  });
}
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm e2e`
Expected: PASS. (Playwright builds + previews automatically per `playwright.config.ts`.) If the upstream API is unreachable, the data-dependent tests may fail — re-run when the source is available.

- [ ] **Step 3: Commit**

```bash
git add e2e/params.spec.ts
git commit -m "test: e2e coverage for URL params and auto-scale fit"
```

---

## Task 10: Documentation

**Files:**

- Modify: `README.md` (create if absent)

- [ ] **Step 1: Add a parameters section**

Add the following section to `README.md` (place it after any existing intro/usage section; if `README.md` does not exist, create it with a top-level `# WorldCupDak` heading followed by this section):

```markdown
## URL parameters

Append query parameters to the dashboard URL to customize it (works great as a Dakboard custom URL). All parameters are optional.

| Parameter   | Values                          | Default  | Description                                             |
| ----------- | ------------------------------- | -------- | ------------------------------------------------------- |
| `groups`    | comma-separated letters `A`–`L` | all 12   | Which groups to show, e.g. `groups=A,B,C,D`             |
| `cols`      | integer                         | auto (2) | Number of grid columns                                  |
| `rows`      | integer                         | auto     | Number of grid rows                                     |
| `detail`    | `full` \| `compact`             | `full`   | `compact` shows only Rank, Flag, Team, GD, Pts          |
| `scores`    | `on` \| `off`                   | `on`     | Show or hide the live score feed                        |
| `upcoming`  | integer                         | `5`      | Max upcoming matches in the feed                        |
| `finished`  | integer                         | `8`      | Max finished matches in the feed                        |
| `refresh`   | seconds                         | `90`     | Data refresh interval (minimum 30)                      |
| `theme`     | `dark` \| `light`               | `dark`   | Color theme                                             |
| `highlight` | comma-separated FIFA codes      | none     | Emphasize specific teams, e.g. `highlight=USA,MEX,CAN`  |
| `fit`       | `on` \| `off`                   | `on`     | Auto-scale content to fill the screen with no scrolling |

### Examples

- Hosts' groups only, highlighted, compact: `?groups=B,D,F&highlight=USA,MEX,CAN&detail=compact`
- Light theme, no score feed, gentle refresh: `?theme=light&scores=off&refresh=300`
- A tall two-up layout on a portrait screen: `?groups=A,B,C,D&cols=1`

Invalid or unknown parameters are ignored and fall back to defaults — the dashboard never breaks on a bad URL.
```

- [ ] **Step 2: Update CLAUDE.md if present**

If a `CLAUDE.md` exists at the repo root, add a one-line note under its features/usage section: "Dashboard is configurable via URL query params (see README → URL parameters); auto-scale is on by default." Skip if no root `CLAUDE.md`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document URL parameters and auto-scale"
```

---

## Final Verification

- [ ] **Step 1: Format**

Run: `pnpm format`

- [ ] **Step 2: Full unit suite**

Run: `pnpm test`
Expected: all suites PASS.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4: e2e**

Run: `pnpm e2e`
Expected: PASS.

- [ ] **Step 5: Manual smoke (optional but recommended)**

Run: `pnpm dev`, then open:

- `/` — all 12 groups, auto-scaled, no scrollbar.
- `/?groups=A,B&theme=light&detail=compact` — two light compact tables filling the screen.
- `/?highlight=USA,MEX,CAN` — host rows emphasized.

- [ ] **Step 6: Commit any formatting changes**

```bash
git add -A
git commit -m "chore: format"
```

---

## Self-Review Notes (author check — completed)

- **Spec coverage:** Every spec parameter (`groups`, `cols`, `rows`, `detail`, `scores`, `upcoming`, `finished`, `refresh`, `theme`, `highlight`, `fit`) is parsed in Task 1 and wired in Task 8. Auto-scale: Tasks 3, 6, 7, 8. Grid derivation: Task 2. Filtering/limits: Task 4. Column detail/highlight: Task 5. Testing: Tasks 1–5 (unit), Task 9 (e2e). Docs: Task 10.
- **Type consistency:** `DashboardConfig` fields used in `main.ts` match Task 1 (`refreshMs`, `groups`, `highlight`, etc.). `renderStandings(container, groups, { detail, highlight })`, `buildScoreFeed(games, now, { maxUpcoming, maxFinished })`, `filterGroups(tables, letters)`, `deriveGrid(n, cols, rows)`, `binarySearchLargest(lo, hi, iterations, fits)`, `fitToViewport(app)` — signatures are identical everywhere referenced.
- **No placeholders:** every code step contains full code.
- **Note on grid default:** `deriveGrid` uses `cols = min(2, n)` when neither dimension is given — this preserves the current 2×6 layout for the default 12 groups (the spec's firm constraint) and is simpler than the spec's illustrative "near-square" example.

## Unresolved questions

None.
