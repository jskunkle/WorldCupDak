# URL Parameters + Auto-Scale — Design

**Date:** 2026-06-14
**Status:** Approved

## Goal

Make the WorldCupDak dashboard configurable via URL query parameters so it can be shared with the Dakboard community, and add an auto-scale ("fit") behavior so the selected content always fills a fixed panel with no scrolling.

## Background

The current dashboard is vanilla TypeScript + DOM (no router). All display behavior is hardcoded:

- Refresh interval: 90s (`src/main.ts`)
- Max upcoming / finished feed items: 5 / 8 (`src/standings.ts`)
- Grid: 2 columns × 6 rows (`src/styles.css`)
- All 12 groups always rendered; all 11 standings columns always shown; score feed always on.

Data is fetched from `https://worldcup26.ir` (`/get/teams`, `/get/games`) and normalized into `Team`, `Game`, `StandingRow`, and a `Snapshot { groups, feed }` (`src/types.ts`). Rendering is DOM manipulation in `src/render.ts`.

## Scope

In scope: a config layer parsed from the URL, the focused parameter set below, and auto-scale on by default.

Out of scope (fast-follow): knockout/bracket mode; a `title`/header text parameter.

## 1. Config layer — `src/config.ts` (new)

Pure function `parseConfig(search: string): DashboardConfig`. Reads `window.location.search` once at startup, validates, clamps, and falls back to defaults. Being pure, it is developed with TDD (Vitest).

| Param       | Type / values                  | Default | Notes                                        |
| ----------- | ------------------------------ | ------- | -------------------------------------------- |
| `groups`    | CSV `A`–`L` (case-insensitive) | all 12  | Invalid letters dropped; empty → all         |
| `cols`      | int ≥ 1                        | auto    | If omitted, derived from group count         |
| `rows`      | int ≥ 1                        | auto    | `ceil(n / cols)` when cols given             |
| `detail`    | `compact` \| `full`            | `full`  | compact = Rank, Flag, Team, GD, Pts          |
| `scores`    | `on` \| `off`                  | `on`    | Hides footer feed when off                   |
| `upcoming`  | int ≥ 0                        | 5       | Max upcoming feed items                      |
| `finished`  | int ≥ 0                        | 8       | Max finished feed items                      |
| `refresh`   | int seconds                    | 90      | Clamped to min 30 to protect the source API  |
| `theme`     | `dark` \| `light`              | `dark`  | Sets `data-theme` on root; CSS vars          |
| `highlight` | CSV FIFA codes                 | none    | e.g. `USA,MEX,CAN`; matching rows emphasized |
| `fit`       | `on` \| `off`                  | `on`    | Auto-scale toggle                            |

Robustness rules:

- Unknown params are ignored.
- Any bad/unparseable value falls back to its default — parsing never throws or crashes the panel.
- `refresh` is clamped to a minimum of 30 seconds.

### Grid auto-derivation

When `cols`/`rows` are not both given, derive a balanced layout from the number of selected groups `n`:

- Both omitted: pick a balanced near-square layout (e.g. `cols = ceil(sqrt(n))`, `rows = ceil(n / cols)`), preserving the current 2×6 result for the default 12 groups.
- `cols` given, `rows` omitted: `rows = ceil(n / cols)`.
- `rows` given, `cols` omitted: `cols = ceil(n / rows)`.

## 2. Auto-scale — `fit` (on by default)

All scalable dimensions are refactored to derive from a single root value: the root `font-size` plus a `--scale` CSS variable. Current `vh`/`vw` sizing constants are converted to `rem`/`em` so they cascade from the root size.

`fitToViewport()` binary-searches (~6 iterations) the largest root size at which `#app` has no overflow in either axis, then stops. It runs:

- once on load,
- after each data refresh (content size changes),
- on a debounced `resize`.

When `fit=off`, the current fixed sizing is retained.

Testability: the pure math (choosing bounds / `bestScale(contentSize, viewportSize)`) is unit-tested with Vitest. The DOM measurement loop (which needs real layout) is covered by Playwright.

## 3. Wiring changes (existing files)

- **`src/main.ts`** — call `parseConfig`; set `data-theme` on the root; pass config to standings/render; invoke `fitToViewport` after render and on debounced resize; use `config.refresh`.
- **`src/standings.ts`** — filter to `config.groups`; use `config.upcoming` / `config.finished`; respect `scores=off`.
- **`src/render.ts`** — choose column set from `config.detail`; add a highlight class to rows whose code is in `config.highlight`; set grid `--cols`/`--rows` from config.
- **`src/styles.css`** — `data-theme` light/dark variable sets; grid driven by `--cols`/`--rows`; sizes in `rem`/`em`; `.row--highlight` styling.

## 4. Testing

**Vitest (TDD):**

- `parseConfig` — defaults, clamping (`refresh` min 30), invalid input, every parameter, unknown-param tolerance.
- Grid auto-derivation helper.
- Group filtering.
- Column-set selection (`compact` vs `full`).
- `bestScale` / fit bounds math.

**Playwright (e2e):**

- No-scroll fit (`scrollHeight <= clientHeight`) at `?groups=A,B` and all 12 groups, across two viewport sizes.
- `?theme=light` applies light theme.
- `?scores=off` hides the feed.
- `?highlight=USA,MEX,CAN` applies the highlight class to matching rows.

## 5. Documentation

Add a README section documenting each parameter with copy-pasteable examples, suitable for the Reddit/Dakboard share post.

## Unresolved questions

None.
