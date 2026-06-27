# Scrolling Score Ticker + Right Padding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static, edge-clipped live-scores strip into a slowly scrolling, seamlessly looping ticker, and add a small right padding so the grid no longer touches the screen edge.

**Architecture:** `renderScoreFeed` builds a `.ticker-track` containing two identical copies of the match list (second `aria-hidden`); CSS animates the track `translateX(0 → -50%)` for a seamless loop, with a count-based `--ticker-duration` for roughly constant speed and a `prefers-reduced-motion` fallback. `#app` gets a larger right padding.

**Tech Stack:** TypeScript, Vite, vanilla DOM, CSS animations. Vitest (jsdom) for unit tests, Playwright for e2e.

**Conventions:** 2-space indent, double quotes, trailing commas. Tests in `tests/*.test.ts` import from `vitest`.
Commands (if `pnpm` errors with "mise"):

- unit: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run`
- typecheck: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc --noEmit`
- build: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc && mise exec node@22.22.2 -- node node_modules/vite/bin/vite.js build`
- e2e: `mise exec node@22.22.2 -- node node_modules/@playwright/test/cli.js test`
- format: `mise exec node@22.22.2 -- node node_modules/prettier/bin/prettier.cjs --write "src/**/*.{ts,css}" "tests/**/*.ts"`

**Branch:** Work continues on `feat/scores-ticker` (already created; spec committed there).

---

## File Structure

**Modify:**

- `src/render.ts` — rewrite `renderScoreFeed` to emit a two-copy `.ticker-track`; add a small `makeMatch` helper and a `SECONDS_PER_MATCH` constant.
- `tests/render.test.ts` — add ticker assertions (existing renderScoreFeed tests stay and must keep passing).
- `src/styles.css` — right padding; ticker animation + keyframes + reduced-motion; per-match margin for seam-uniform spacing.

---

## Task 1: Ticker rendering in `renderScoreFeed`

**Files:**

- Modify: `src/render.ts`
- Test: `tests/render.test.ts`

- [ ] **Step 1: Append ticker tests to `tests/render.test.ts`**

Add this new describe block at the END of the file (after the existing `describe("renderScoreFeed", ...)`):

```ts
describe("renderScoreFeed ticker", () => {
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
    {
      id: "2",
      kind: "finished",
      homeName: "GER",
      awayName: "AUS",
      homeScore: 2,
      awayScore: 0,
      kickoff: new Date(2026, 5, 14, 12, 0),
    },
    {
      id: "3",
      kind: "upcoming",
      homeName: "BRA",
      awayName: "CRO",
      homeScore: 0,
      awayScore: 0,
      kickoff: new Date(2026, 5, 20, 12, 0),
    },
  ];

  it("renders two copies of the feed inside a ticker track", () => {
    const container = document.createElement("div");
    renderScoreFeed(container, feed);
    const track = container.querySelector(".ticker-track")!;
    expect(track).toBeTruthy();
    expect(track.querySelectorAll(".ticker-copy")).toHaveLength(2);
    expect(track.querySelectorAll(".match")).toHaveLength(6); // 2 copies x 3
  });

  it("puts data-match only on the primary copy", () => {
    const container = document.createElement("div");
    renderScoreFeed(container, feed);
    expect(container.querySelectorAll("[data-match]")).toHaveLength(3);
  });

  it("marks the duplicate copy aria-hidden and gives it no data-match", () => {
    const container = document.createElement("div");
    renderScoreFeed(container, feed);
    const hidden = container.querySelectorAll(
      '.ticker-copy[aria-hidden="true"]',
    );
    expect(hidden).toHaveLength(1);
    expect(hidden[0].querySelectorAll("[data-match]")).toHaveLength(0);
  });

  it("scales --ticker-duration with the match count", () => {
    const container = document.createElement("div");
    renderScoreFeed(container, feed);
    const track = container.querySelector(".ticker-track") as HTMLElement;
    expect(track.style.getPropertyValue("--ticker-duration")).toBe("12s"); // 3 * 4s
  });
});
```

- [ ] **Step 2: Run render tests to verify the new ones fail**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/render.test.ts`
Expected: the 4 new ticker tests FAIL (no `.ticker-track`); the existing renderScoreFeed/renderStandings tests still pass.

- [ ] **Step 3: Rewrite `renderScoreFeed` in `src/render.ts`**

Replace the entire existing `renderScoreFeed` function (current lines 86–101) with:

```ts
const SECONDS_PER_MATCH = 4;

function makeMatch(m: FeedMatch, withId: boolean): HTMLElement {
  const item = el("span", `match ${m.kind}`);
  if (withId) item.setAttribute("data-match", m.id);
  const score = m.kind === "upcoming" ? "vs" : `${m.homeScore}-${m.awayScore}`;
  item.appendChild(el("span", "home", m.homeName));
  item.appendChild(el("span", "score", score));
  item.appendChild(el("span", "away", m.awayName));
  return item;
}

export function renderScoreFeed(
  container: HTMLElement,
  feed: FeedMatch[],
): void {
  container.replaceChildren();

  const track = el("div", "ticker-track");
  track.style.setProperty(
    "--ticker-duration",
    `${Math.max(1, feed.length) * SECONDS_PER_MATCH}s`,
  );

  // Two identical copies let the track translate -50% and loop seamlessly.
  // The primary copy is addressable (data-match); the duplicate is decorative.
  const primary = el("span", "ticker-copy");
  const duplicate = el("span", "ticker-copy");
  duplicate.setAttribute("aria-hidden", "true");

  for (const m of feed) {
    primary.appendChild(makeMatch(m, true));
    duplicate.appendChild(makeMatch(m, false));
  }

  track.appendChild(primary);
  track.appendChild(duplicate);
  container.appendChild(track);
}
```

Leave `renderStandings`, `el`, and the imports unchanged.

- [ ] **Step 4: Run render tests to verify all pass**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run tests/render.test.ts`
Expected: PASS — the 4 new ticker tests plus both existing renderScoreFeed tests (they query `[data-match="..."]`, which is on the primary copy) and all renderStandings tests.

- [ ] **Step 5: Typecheck**

Run: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/render.ts tests/render.test.ts
git commit -m "feat: render live scores as a seamless two-copy ticker"
```

---

## Task 2: Ticker CSS + right padding

**Files:**

- Modify: `src/styles.css`

No unit test (CSS/animation isn't testable in jsdom); verified by build, the existing e2e fit tests, and a manual smoke check.

- [ ] **Step 1: Add right padding to `#app`**

Replace the `#app` padding line (current line 43):

```css
padding: 1vh 1vw;
```

with:

```css
padding: 1vh 1.8vw 1vh 1vw;
```

- [ ] **Step 2: Remove the now-redundant `gap` from `.scores`**

In the `.scores` rule (current lines 124–134), DELETE this line:

```css
gap: 1.6vw;
```

(Spacing between matches now comes from a per-match margin so it stays uniform across the loop seam. Leave the rest of `.scores` — including `overflow: hidden` and `white-space: nowrap` — unchanged.)

- [ ] **Step 3: Add a right margin to `.match`**

In the `.match` rule (current lines 136–141), add a `margin-right` so spacing is uniform across the seam. Change:

```css
.match {
  display: inline-flex;
  gap: 0.4em;
  align-items: baseline;
  font-size: clamp(11px, 1.6vh, 18px);
}
```

to:

```css
.match {
  display: inline-flex;
  gap: 0.4em;
  align-items: baseline;
  font-size: clamp(11px, 1.6vh, 18px);
  margin-right: 1.6vw;
}
```

- [ ] **Step 4: Append the ticker animation rules**

Add to the END of `src/styles.css`:

```css
/* Live-scores ticker: two identical copies scroll left as one track and loop
   seamlessly at -50%. Duration is set per-render from the match count for a
   roughly constant speed. .scores keeps overflow:hidden so the doubled track
   is clipped and does not inflate the layout width (fit measurement stays correct). */
.ticker-track {
  display: inline-flex;
  flex: none;
  animation: ticker-scroll var(--ticker-duration, 40s) linear infinite;
  will-change: transform;
}
.ticker-copy {
  display: inline-flex;
}
@keyframes ticker-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ticker-track {
    animation: none;
  }
}
```

- [ ] **Step 5: Build to confirm the project still compiles**

Run: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc && mise exec node@22.22.2 -- node node_modules/vite/bin/vite.js build`
Expected: PASS.

- [ ] **Step 6: Format**

Run: `mise exec node@22.22.2 -- node node_modules/prettier/bin/prettier.cjs --write "src/**/*.{ts,css}" "tests/**/*.ts"`

- [ ] **Step 7: Commit**

```bash
git add src/styles.css
git commit -m "feat: scrolling ticker styles and right-edge padding"
```

---

## Final Verification

- [ ] **Step 1: Full unit suite**

Run: `mise exec node@22.22.2 -- node node_modules/vitest/vitest.mjs run`
Expected: all suites PASS (render ticker tests included).

- [ ] **Step 2: Build**

Run: `mise exec node@22.22.2 -- node node_modules/typescript/bin/tsc && mise exec node@22.22.2 -- node node_modules/vite/bin/vite.js build`
Expected: PASS.

- [ ] **Step 3: e2e (CRITICAL — confirms the ticker did not break auto-scale)**

Run: `mise exec node@22.22.2 -- node node_modules/@playwright/test/cli.js test`
Expected: PASS. The fit tests assert `#app` has no overflow; if the doubled ticker track inflated layout width, the all-groups fit tests would fail here. Passing confirms `.scores { overflow: hidden }` correctly clips the track so it doesn't affect `fitToViewport` measurement. The `scores=off` test confirms the feed still hides.

- [ ] **Step 4: Manual smoke (recommended)**

Run `pnpm dev`, then:

- Load `/` — the scores strip scrolls slowly right-to-left and loops with no visible jump at the wrap.
- Confirm the grid has a clean margin on the right edge (no longer touching the screen edge).
- Load `/?scores=off` — the feed is hidden.
- Confirm the board still fits with no scrollbar (auto-scale unaffected).

---

## Self-Review Notes (author check — completed)

- **Spec coverage:** Right padding → Task 2 Step 1. Ticker render (two copies, aria-hidden duplicate, data-match on primary only, count-based `--ticker-duration`, `SECONDS_PER_MATCH = 4`) → Task 1. Ticker CSS (track animation, `-50%` keyframes, seam-uniform per-match margin, reduced-motion fallback, overflow-hidden clipping) → Task 2. `scores` stays boolean (no config change) — nothing to do, consistent with spec. Testing → Task 1 unit + Final Verification e2e/manual.
- **No fit regression:** `.scores { overflow: hidden }` clips the doubled-width track so it does not inflate `#app.scrollWidth`; the existing all-groups fit e2e tests will catch any regression (Final Verification Step 3).
- **Type consistency:** `renderScoreFeed(container, feed)` signature unchanged; new `makeMatch(m, withId)` helper and `SECONDS_PER_MATCH` constant are internal to render.ts. Existing tests query the primary copy via `[data-match]` and still pass.
- **No placeholders:** every code step is complete.

## Unresolved questions

None.
