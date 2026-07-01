# Venue-timezone Kickoff Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Worker so worldcup26 kickoff times are stored as the correct absolute UTC instant, computed from each venue's local timezone, so displays show the right local kickoff time.

**Architecture:** worldcup26.ir publishes `local_date` as venue-local wall-clock time. Add a static stadium-id → IANA-timezone map plus a `zonedWallTimeToUtc` helper (offset read via `Intl.DateTimeFormat.formatToParts`), and have `normalizeGames` interpret each `local_date` in its venue's zone instead of the Worker's runtime (UTC) zone.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers (full ICU/Intl tz data available).

Reference spec: `docs/superpowers/specs/2026-07-01-venue-timezone-kickoff-fix-design.md`.

Run tests with the real node binary (mise shims are broken in tool shells):

```bash
NODE="C:/Users/shane/AppData/Local/mise/installs/node/22.22.2/node.exe"
"$NODE" node_modules/vitest/vitest.mjs run worker/sources/
```

---

### Task 1: Stadium timezone module + wall-clock→UTC helper

**Files:**
- Create: `worker/sources/stadium-timezones.ts`
- Test: `worker/sources/stadium-timezones.test.ts`

- [ ] **Step 1: Write the failing test**

Create `worker/sources/stadium-timezones.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stadiumTimeZone, zonedWallTimeToUtc } from "./stadium-timezones";

describe("stadiumTimeZone", () => {
  it("maps known stadium ids to their IANA zones", () => {
    expect(stadiumTimeZone("7")).toBe("America/New_York"); // Atlanta
    expect(stadiumTimeZone("4")).toBe("America/Chicago"); // Dallas
    expect(stadiumTimeZone("1")).toBe("America/Mexico_City"); // Mexico City
    expect(stadiumTimeZone("3")).toBe("America/Monterrey"); // Monterrey
    expect(stadiumTimeZone("16")).toBe("America/Los_Angeles"); // Los Angeles
    expect(stadiumTimeZone("13")).toBe("America/Vancouver"); // Vancouver
  });

  it("falls back to America/New_York for an unknown id", () => {
    expect(stadiumTimeZone("999")).toBe("America/New_York");
  });
});

describe("zonedWallTimeToUtc", () => {
  it("interprets wall-clock time in the given zone (summer offsets)", () => {
    // noon EDT (UTC-4) -> 16:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/New_York").toISOString(),
    ).toBe("2026-07-01T16:00:00.000Z");
    // noon CDT (UTC-5) -> 17:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/Chicago").toISOString(),
    ).toBe("2026-07-01T17:00:00.000Z");
    // noon Mexico City (UTC-6, no DST) -> 18:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/Mexico_City").toISOString(),
    ).toBe("2026-07-01T18:00:00.000Z");
    // noon PDT (UTC-7) -> 19:00Z
    expect(
      zonedWallTimeToUtc(2026, 7, 1, 12, 0, "America/Los_Angeles").toISOString(),
    ).toBe("2026-07-01T19:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `"$NODE" node_modules/vitest/vitest.mjs run worker/sources/stadium-timezones.test.ts`
Expected: FAIL — cannot resolve `./stadium-timezones`.

- [ ] **Step 3: Write minimal implementation**

Create `worker/sources/stadium-timezones.ts`:

```ts
// Static map of worldcup26.ir stadium ids -> IANA timezone.
// Verified against https://worldcup26.ir/get/stadiums (16 fixed 2026 venues).
const STADIUM_TZ: Record<string, string> = {
  "1": "America/Mexico_City", // Mexico City (Estadio Azteca)
  "2": "America/Mexico_City", // Guadalajara
  "3": "America/Monterrey", // Monterrey
  "4": "America/Chicago", // Dallas (Arlington)
  "5": "America/Chicago", // Houston
  "6": "America/Chicago", // Kansas City
  "7": "America/New_York", // Atlanta
  "8": "America/New_York", // Miami
  "9": "America/New_York", // Boston (Foxborough)
  "10": "America/New_York", // Philadelphia
  "11": "America/New_York", // New York / New Jersey
  "12": "America/New_York", // Toronto
  "13": "America/Vancouver", // Vancouver
  "14": "America/Los_Angeles", // Seattle
  "15": "America/Los_Angeles", // San Francisco Bay Area (Santa Clara)
  "16": "America/Los_Angeles", // Los Angeles (Inglewood)
};

/** Returns the venue's IANA timezone, defaulting to Eastern for unknown ids. */
export function stadiumTimeZone(id: string): string {
  return STADIUM_TZ[id] ?? "America/New_York";
}

/** Offset (ms) that `timeZone`'s wall clock is ahead of UTC at instant `atMs`. */
function tzOffsetMs(timeZone: string, atMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(atMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return localAsUtc - atMs;
}

/**
 * Interprets the wall-clock components as occurring in `timeZone` and returns
 * the true UTC instant. `month` is 1-12. One-pass offset lookup is exact for
 * the WC2026 window (no venue crosses a DST transition Jun 11 - Jul 19 2026).
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(naiveUtc - tzOffsetMs(timeZone, naiveUtc));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `"$NODE" node_modules/vitest/vitest.mjs run worker/sources/stadium-timezones.test.ts`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Commit**

```bash
git add worker/sources/stadium-timezones.ts worker/sources/stadium-timezones.test.ts
git commit -m "feat(worker): add stadium timezone map and zoned wall-clock helper"
```

---

### Task 2: Wire venue timezone into worldcup26 kickoff parsing

**Files:**
- Modify: `src/types.ts` (add `stadium_id` to `RawGame`)
- Modify: `worker/sources/worldcup26.ts` (`parseKickoff`, `normalizeGames`)
- Test: `worker/sources/worldcup26.test.ts`

- [ ] **Step 1: Write the failing tests**

In `worker/sources/worldcup26.test.ts`, add `stadium_id: "1"` to the existing
`finishedGame` fixture (so it type-checks once `stadium_id` is required) — the
fixture object becomes:

```ts
const finishedGame: RawGame = {
  id: "1",
  home_team_id: "1",
  away_team_id: "2",
  home_score: "2",
  away_score: "0",
  group: "A",
  matchday: "1",
  local_date: "06/11/2026 13:00",
  stadium_id: "1",
  finished: "TRUE",
  time_elapsed: "finished",
  type: "group",
  home_team_name_en: "Mexico",
  away_team_name_en: "South Africa",
  home_team_label: "Winner Group A",
  away_team_label: "Runner-up Group A",
};
```

Replace the three machine-timezone-dependent kickoff assertions in the
"coerces strings to numbers/booleans and parses the date" test:

```ts
    expect(g.kickoff.getFullYear()).toBe(2026);
    expect(g.kickoff.getMonth()).toBe(5);
    expect(g.kickoff.getDate()).toBe(11);
```

with a single deterministic assertion (Azteca 13:00 CST, UTC-6 -> 19:00Z):

```ts
    expect(g.kickoff.toISOString()).toBe("2026-06-11T19:00:00.000Z");
```

Then add a new test that pins the venue-specific conversion:

```ts
  it("converts local_date using the venue's timezone", () => {
    const byStadium = (stadium_id: string, local_date: string) =>
      normalizeGames([{ ...finishedGame, stadium_id, local_date }])[0].kickoff
        .toISOString();
    // noon local at each venue -> correct UTC instant
    expect(byStadium("7", "07/01/2026 12:00")).toBe("2026-07-01T16:00:00.000Z"); // Atlanta EDT
    expect(byStadium("4", "07/01/2026 12:00")).toBe("2026-07-01T17:00:00.000Z"); // Dallas CDT
    expect(byStadium("1", "07/01/2026 12:00")).toBe("2026-07-01T18:00:00.000Z"); // Mexico City
    expect(byStadium("16", "07/01/2026 12:00")).toBe("2026-07-01T19:00:00.000Z"); // LA PDT
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run worker/sources/worldcup26.test.ts`
Expected: FAIL — the venue test's Central/Western/Mexico cases produce the wrong
instant (current code binds wall-clock to the runtime zone), and `RawGame` has
no `stadium_id` yet (type error).

- [ ] **Step 3: Add `stadium_id` to `RawGame`**

In `src/types.ts`, inside `interface RawGame`, add the field after `local_date`:

```ts
  local_date: string;
  stadium_id: string;
```

- [ ] **Step 4: Update `worldcup26.ts` to use the venue timezone**

In `worker/sources/worldcup26.ts`, add the import near the top:

```ts
import { stadiumTimeZone, zonedWallTimeToUtc } from "./stadium-timezones";
```

Replace `parseKickoff` with:

```ts
// Parses "MM/DD/YYYY HH:mm" as a wall-clock time in the venue's timezone.
function parseKickoff(s: string, timeZone: string): Date {
  const [datePart, timePart = "00:00"] = s.trim().split(" ");
  const [mm, dd, yyyy] = datePart.split("/").map(Number);
  const [hh, min] = timePart.split(":").map(Number);
  return zonedWallTimeToUtc(yyyy, mm, dd, hh, min, timeZone);
}
```

In `normalizeGames`, change the `kickoff` line to pass the venue zone:

```ts
    kickoff: parseKickoff(g.local_date, stadiumTimeZone(g.stadium_id)),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run worker/sources/worldcup26.test.ts`
Expected: PASS (all tests, including the new venue-conversion test).

- [ ] **Step 6: Typecheck the worker**

Run: `"$NODE" node_modules/typescript/bin/tsc --noEmit -p worker/tsconfig.json`
Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/types.ts worker/sources/worldcup26.ts worker/sources/worldcup26.test.ts
git commit -m "fix(worker): parse worldcup26 kickoff in the venue's timezone"
```

---

### Task 3: Full verification, docs, format

**Files:**
- Modify: `worker/sources/worldcup26.ts` (doc comment only, if needed)
- Modify: `CLAUDE.md` (architecture note)

- [ ] **Step 1: Run the full unit suite**

Run: `"$NODE" node_modules/vitest/vitest.mjs run`
Expected: PASS — all suites green (worker + client).

- [ ] **Step 2: Full build typecheck (matches Render)**

Run:
```bash
"$NODE" node_modules/typescript/bin/tsc && "$NODE" node_modules/vite/bin/vite.js build
```
Expected: type-check clean, build succeeds to `dist/`.

- [ ] **Step 3: Add an architecture note to `CLAUDE.md`**

In `CLAUDE.md`, under the `worker/` bullet in the Architecture section, append a
sentence noting the timezone handling:

```
worldcup26 `local_date` is venue-local wall-clock time; the adapter converts it
to a true UTC instant via a static stadium-id→IANA-timezone map
(`worker/sources/stadium-timezones.ts`), so the Worker's UTC runtime does not
skew kickoff times. football-data uses `utcDate` directly.
```

- [ ] **Step 4: Format**

Run: `"$NODE" node_modules/prettier/bin/prettier.cjs --write .`
Expected: files formatted.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note venue-timezone kickoff handling in worker"
```

---

## Notes

- No client changes: `kickoffCaption` / `whenLabel` already format via
  `toLocaleString(undefined, …)`, so a correctly-configured display renders the
  right local time once `kickoff` is the correct instant.
- Fallback source `football-data.ts` already uses `new Date(m.utcDate)` (a true
  UTC instant) — unaffected.
- No e2e change needed; the bug is in data normalization, covered by unit tests.
