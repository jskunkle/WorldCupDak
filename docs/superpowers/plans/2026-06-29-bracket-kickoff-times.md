# Bracket Kickoff Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in `?bracketTimes=on` URL param that prints a `Jul 4 · 14:00` kickoff caption under each match box in the full bracket view.

**Architecture:** A new boolean on `DashboardConfig` parsed from the query string (defaults off). A pure `kickoffCaption(date)` formatter in `render-bracket.ts`. `renderFullBracket` takes a new `showTimes` arg and, when true, appends a `.bm-when` line to each match box. `main.ts` passes `config.bracketTimes`. A `.bm-when` CSS rule styles it.

**Tech Stack:** TypeScript, Vite, Vitest. No data/Worker changes — `BracketMatch.kickoff` already exists.

**Test runner note:** the `mise` shims are broken in tool shells on this machine. Run vitest via the real node binary:
```bash
NODE="C:/Users/shane/AppData/Local/mise/installs/node/22.22.2/node.exe"
"$NODE" node_modules/vitest/vitest.mjs run [path]
```

---

### Task 1: Parse `bracketTimes` config

**Files:**
- Modify: `src/config.ts` (interface `DashboardConfig`, `DEFAULTS`, `parseConfig` return)
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/config.test.ts`. First, add `bracketTimes: false` to the empty-string defaults literal in the existing `"returns documented defaults for an empty query string"` test (insert it right after `bracket: "full",`):

```ts
      bracket: "full",
      bracketTimes: false,
```

Then add a new test inside the `describe("parseConfig", ...)` block:

```ts
  it("parses bracketTimes=on as true, anything else as false", () => {
    expect(parseConfig("?bracketTimes=on").bracketTimes).toBe(true);
    expect(parseConfig("?bracketTimes=off").bracketTimes).toBe(false);
    expect(parseConfig("?bracketTimes=1").bracketTimes).toBe(false);
    expect(parseConfig("").bracketTimes).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/config.test.ts`
Expected: FAIL — `bracketTimes` is missing from the parsed config (the defaults `toEqual` fails and the new test reads `undefined`).

- [ ] **Step 3: Add the field, default, and parse**

In `src/config.ts`, add to the `DashboardConfig` interface after the `bracket` line:

```ts
  bracket: "full" | "focused";
  bracketTimes: boolean; // show kickoff date/time under each full-bracket match
```

Add to `DEFAULTS` after the `bracket: "full",` line:

```ts
  bracket: "full",
  bracketTimes: false,
```

Add to the `parseConfig` return object after the `bracket:` line:

```ts
    bracket: p.get("bracket") === "focused" ? "focused" : "full",
    bracketTimes: p.get("bracketTimes") === "on",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(config): add bracketTimes opt-in param"
```

---

### Task 2: `kickoffCaption` formatter

**Files:**
- Modify: `src/render-bracket.ts` (new exported function)
- Test: `tests/render-bracket.test.ts`

- [ ] **Step 1: Write the failing test**

Add `kickoffCaption` to the import at the top of `tests/render-bracket.test.ts`:

```ts
import {
  renderFullBracket,
  renderFocusedBracket,
  kickoffCaption,
} from "../src/render-bracket";
```

Add a new `describe` block at the end of the file:

```ts
describe("kickoffCaption", () => {
  it("formats month, day, and time joined by a middle dot", () => {
    // Force a fixed locale/timezone so the assertion is deterministic.
    const d = new Date(2026, 6, 4, 14, 0); // Jul 4 2026, 14:00 local
    const caption = kickoffCaption(d, "en-GB");
    expect(caption).toContain("Jul");
    expect(caption).toContain("4");
    expect(caption).toContain("·");
    expect(caption).toMatch(/\d/); // contains a time digit
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: FAIL — `kickoffCaption` is not exported / not a function.

- [ ] **Step 3: Implement the formatter**

In `src/render-bracket.ts`, add after the `ROUND_LABEL` / constants near the top (it is a pure helper, so keep it with the other top-level helpers):

```ts
// "Jul 4 · 14:00" — month+day and time joined by a middle dot. Locale/timezone
// come from the viewer (the DAKboard display), matching the focused view's
// approach; `locale` is injectable so the format is unit-testable.
export function kickoffCaption(date: Date, locale?: string): string {
  const day = date.toLocaleString(locale, { month: "short", day: "numeric" });
  const time = date.toLocaleString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} · ${time}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render-bracket.ts tests/render-bracket.test.ts
git commit -m "feat(bracket): add kickoffCaption formatter"
```

---

### Task 3: Render the caption in the full bracket

**Files:**
- Modify: `src/render-bracket.ts` (`matchEl`, `columnEl`, `finalColumn`, `sideEl`, `renderFullBracket`)
- Test: `tests/render-bracket.test.ts`

The flag has to reach `matchEl`, which is called from `columnEl`, `finalColumn`, and (via `columnEl`) `sideEl`. Thread a `showTimes` boolean from `renderFullBracket` down through those functions. Keep the default `false` so existing callers/tests are unaffected.

- [ ] **Step 1: Write the failing tests**

Add two tests to the `describe("renderFullBracket", ...)` block in `tests/render-bracket.test.ts`:

```ts
  it("omits kickoff captions by default", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket());
    expect(c.querySelector(".bm-when")).toBeNull();
  });

  it("shows a kickoff caption per match when showTimes is true", () => {
    const c = document.createElement("div");
    renderFullBracket(c, sampleBracket(), true);
    const when = c.querySelector('[data-match="73"] .bm-when');
    expect(when).toBeTruthy();
    expect(when!.textContent).toContain("·");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: FAIL — `.bm-when` never rendered; second test's `when` is null.

- [ ] **Step 3: Thread `showTimes` and render the caption**

In `src/render-bracket.ts`:

Change `matchEl` to accept and use the flag (append the caption after the two slot rows):

```ts
function matchEl(
  m: BracketMatch,
  showTimes = false,
  extraClass = "",
): HTMLElement {
  const box = el("div", `bm${m.status === "live" ? " live" : ""}${extraClass}`);
  box.setAttribute("data-match", m.id);
  box.appendChild(slotRow(m, m.home));
  box.appendChild(slotRow(m, m.away));
  if (showTimes) {
    box.appendChild(el("div", "bm-when", kickoffCaption(m.kickoff)));
  }
  return box;
}
```

Change `columnEl` to take and forward `showTimes`:

```ts
function columnEl(
  matches: BracketMatch[],
  round: KnockoutRound,
  showTimes = false,
): HTMLElement {
  const col = el("div", `bcol ${round}`);
  col.setAttribute("data-round", round);
  col.appendChild(el("div", "bcol-label", ROUND_LABEL[round]));
  const cells = el("div", "bcol-cells");
  for (const m of matches) {
    const cell = el("div", "bcell");
    cell.appendChild(matchEl(m, showTimes));
    cells.appendChild(cell);
  }
  col.appendChild(cells);
  return col;
}
```

Change `sideEl` to take and forward `showTimes`:

```ts
function sideEl(
  columns: BracketMatch[][],
  side: "left" | "right",
  showTimes = false,
): HTMLElement {
  const wrap = el("div", `bside ${side}`);
  // left renders outer→inner (r32..sf); right renders inner→outer (sf..r32).
  const order =
    side === "left"
      ? LEFT_COLUMN_ROUNDS.map((_, i) => i)
      : LEFT_COLUMN_ROUNDS.map((_, i) => LEFT_COLUMN_ROUNDS.length - 1 - i);
  for (const i of order) {
    wrap.appendChild(columnEl(columns[i], LEFT_COLUMN_ROUNDS[i], showTimes));
  }
  return wrap;
}
```

Change `finalColumn` to take and forward `showTimes` (the final match box uses `matchEl` with its `extraClass`; pass `showTimes` through the new middle arg):

```ts
function finalColumn(bracket: Bracket, showTimes = false): HTMLElement {
  const col = el("div", "bcol final");
  col.setAttribute("data-round", "final");
  col.appendChild(el("div", "bcol-label", ROUND_LABEL.final));
  const cells = el("div", "bcol-cells");
  const cell = el("div", "bcell bfinal-cell");
  cell.appendChild(el("div", "btrophy", "🏆"));
  if (bracket.final) {
    cell.appendChild(matchEl(bracket.final, showTimes, " final-box"));
  }
  const thirdText = bracket.third
    ? thirdLabel(bracket.third)
    : "3rd place · TBD";
  cell.appendChild(el("div", "bthird", thirdText));
  cells.appendChild(cell);
  col.appendChild(cells);
  return col;
}
```

Change `renderFullBracket` to accept `showTimes` and pass it down:

```ts
export function renderFullBracket(
  container: HTMLElement,
  bracket: Bracket,
  showTimes = false,
): void {
  container.replaceChildren();
  container.appendChild(
    el("h2", "bracket-title", "FIFA World Cup 2026 — Knockout Bracket"),
  );
  const board = el("div", "bboard");
  board.appendChild(sideEl(bracket.left, "left", showTimes));
  board.appendChild(finalColumn(bracket, showTimes));
  board.appendChild(sideEl(bracket.right, "right", showTimes));
  container.appendChild(board);
}
```

Note: `focusCard` also calls nothing here; the focused view is untouched.

- [ ] **Step 4: Run all bracket tests to verify they pass**

Run: `"$NODE" node_modules/vitest/vitest.mjs run tests/render-bracket.test.ts`
Expected: PASS (the existing tests still pass because `showTimes` defaults to `false`).

- [ ] **Step 5: Commit**

```bash
git add src/render-bracket.ts tests/render-bracket.test.ts
git commit -m "feat(bracket): render kickoff captions when showTimes is set"
```

---

### Task 4: Wire config into the renderer + style the caption

**Files:**
- Modify: `src/main.ts:155` (the `renderFullBracket` call)
- Modify: `src/styles.css` (add `.bm-when` rule after the `.bm.live .bm-score` block, ~line 333)

No new unit test — this is runtime wiring (smoke-tested) and CSS. Verified by the e2e in Task 5 and `tsc`.

- [ ] **Step 1: Pass the flag in main.ts**

In `src/main.ts`, change the full-bracket render call inside `paintBracket`:

```ts
    stopFocusRotation();
    renderFullBracket(bracketEl, bracket, config.bracketTimes);
    if (config.fit) fitBracket(appEl);
```

- [ ] **Step 2: Add the CSS rule**

In `src/styles.css`, after the `.bm.live .bm-score { ... }` block (ends ~line 333), add:

```css
.bm-when {
  text-align: center;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  font-size: clamp(7px, 0.95vh, 12px);
  padding: 0.15vh 0.4vw;
  border-top: 1px solid var(--line);
  white-space: nowrap;
}
```

- [ ] **Step 3: Typecheck and build (matches the Render deploy)**

Run:
```bash
NODE="C:/Users/shane/AppData/Local/mise/installs/node/22.22.2/node.exe"
"$NODE" node_modules/typescript/bin/tsc && "$NODE" node_modules/vite/bin/vite.js build
```
Expected: no type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/styles.css
git commit -m "feat(bracket): wire bracketTimes into the full bracket render + style"
```

---

### Task 5: E2E coverage

**Files:**
- Modify: `e2e/bracket.spec.ts`

Reuse the existing bracket e2e setup (it already mocks the API — see the CORS-locked note; do not hit the live Worker). Add a test that loads the full bracket with `?bracketTimes=on` and asserts a `.bm-when` caption appears, plus one asserting it is absent without the param.

- [ ] **Step 1: Read the existing spec to match its fixture/mock pattern**

Open `e2e/bracket.spec.ts` and note how it mocks the API and navigates (the query string it uses to force the bracket view, e.g. `?view=bracket`). Mirror that exact setup in the new tests below — reuse its mock/route helper rather than writing a new one.

- [ ] **Step 2: Add the tests**

Append two tests, reusing the spec's existing API-mock/navigation helper (named here `gotoBracket(query)` — substitute the real helper name found in Step 1):

```ts
test("shows kickoff captions on the full bracket with bracketTimes=on", async ({
  page,
}) => {
  await gotoBracket("?view=bracket&bracketTimes=on");
  await expect(page.locator(".bm-when").first()).toBeVisible();
});

test("hides kickoff captions on the full bracket by default", async ({
  page,
}) => {
  await gotoBracket("?view=bracket");
  await expect(page.locator(".bm-when")).toHaveCount(0);
});
```

- [ ] **Step 3: Run the e2e**

Run: `pnpm e2e` (or, if the mise shim fails, the project's documented Playwright invocation).
Expected: both new tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/bracket.spec.ts
git commit -m "test(bracket): e2e for bracketTimes caption visibility"
```

---

### Task 6: Document the param + final checks

**Files:**
- Modify: `README.md` (the URL-params table, after the `rotateSecs` row ~line 55)

- [ ] **Step 1: Add the README row**

After the `rotateSecs` row in the params table in `README.md`, add:

```markdown
| `bracketTimes` | `on` \| `off`                                         | `off`      | Show kickoff date + time under each match in the full bracket view, e.g. `Jul 4 · 14:00` (full bracket only)                                         |
```

- [ ] **Step 2: Format**

Run:
```bash
NODE="C:/Users/shane/AppData/Local/mise/installs/node/22.22.2/node.exe"
"$NODE" node_modules/prettier/bin/prettier.cjs --write .
```

- [ ] **Step 3: Full test + build pass**

Run:
```bash
NODE="C:/Users/shane/AppData/Local/mise/installs/node/22.22.2/node.exe"
"$NODE" node_modules/vitest/vitest.mjs run
"$NODE" node_modules/typescript/bin/tsc && "$NODE" node_modules/vite/bin/vite.js build
```
Expected: all unit tests PASS; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document bracketTimes URL param"
```

---

## Self-Review Notes

- **Spec coverage:** param parsing (Task 1), `kickoffCaption` formatter (Task 2), full-bracket-only render (Task 3), default-off wiring + style (Task 4), e2e (Task 5), README + final checks (Task 6). Focused view untouched per spec. ✓
- **Type consistency:** `bracketTimes: boolean` used identically in config + main.ts; `renderFullBracket(container, bracket, showTimes?)` signature matches its call site; `kickoffCaption(date, locale?)` matches its test and its `matchEl` call (locale omitted → viewer locale). ✓
- **No placeholders:** all code shown. The only deferred lookup is the existing e2e mock helper name (Task 5 Step 1), which must be read from the real file since the project's exact Playwright fixture isn't in this plan's context — the steps say to mirror it explicitly.

## Open Questions

None.
