# Scrolling Score Ticker + Right Padding — Design

**Date:** 2026-06-15
**Status:** Approved

## Goal

Two polish changes to the DAKboard dashboard:

1. Add a small amount of padding on the right edge so the groups grid no longer touches the screen edge.
2. Replace the static, edge-clipped live-scores strip with a slowly scrolling ticker so every match cycles into view and matches are easier to read.

## Background

The live-scores feed (`renderScoreFeed` in `src/render.ts`) renders matches as a single flex row inside `footer#scores`, styled by `.scores` / `.match` in `src/styles.css` with `overflow: hidden` and `white-space: nowrap`. Matches past the right edge are clipped and never seen. `#app` uses `padding: 1vh 1vw`, so content reaches close to the screen edge.

The `scores` URL param is a boolean (`on` default / `off` hides the feed), parsed in `src/config.ts`. Decision from brainstorming: keep it boolean — the default rendering becomes the scrolling ticker; `scores=off` still hides it. No new layout values (`row`/`grid`) are added.

## 1. Right padding

In `src/styles.css`, increase `#app`'s right padding so the board has a clean right margin (e.g. `padding: 1vh 1vw` → a larger right value such as `padding: 1vh 1.8vw 1vh 1vw`). Because auto-scale (`fitToViewport`) measures within `#app`'s content box, additional right padding simply reduces the usable width and the board scales to fit — yielding a right margin without breaking the no-scroll guarantee.

## 2. Scrolling ticker

### Render — `src/render.ts`

`renderScoreFeed(container, feed)` builds:

- A `.ticker-track` element whose `--ticker-duration` CSS variable is set from the match count: `max(1, feed.length) * SECONDS_PER_MATCH` seconds (`SECONDS_PER_MATCH = 4`). This keeps the scroll speed roughly constant regardless of how many matches there are.
- Inside the track, **two identical copies** of the match list. The first copy carries the `data-match` attributes (the addressable one); the second copy is decorative and marked `aria-hidden="true"`. Two copies allow the track to translate `-50%` and loop with no visible seam.
- Each match keeps its existing structure: `span.match.<kind>` containing `span.home`, `span.score` (`"vs"` for upcoming, else `homeScore-awayScore`), `span.away`.

When `config.scores` is false, `main.ts` continues to hide `#scores` (unchanged) and `renderScoreFeed` is not called.

### CSS — `src/styles.css`

- `.scores` keeps `overflow: hidden`.
- `.ticker-track`: `display: inline-flex; animation: ticker-scroll var(--ticker-duration, 40s) linear infinite; will-change: transform;`
- `@keyframes ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }`
- Match spacing moves from the container `gap` to a per-`.match` right margin, so spacing is uniform across the loop seam (the gap between the last match of copy 1 and the first of copy 2 matches every other gap).
- The live-score red accent (`.match.live .score`) and upcoming muted color are preserved.
- `@media (prefers-reduced-motion: reduce) { .ticker-track { animation: none; } }` — falls back to the current static, clipped line on kiosks configured for reduced motion.

## 3. No config change

`parseConfig` and the `scores` boolean are untouched. `scores=on` / absent → ticker; `scores=off` → hidden.

## 4. Testing

**Vitest (`tests/render.test.ts`):**

- The feed renders a `.ticker-track` containing two copies of the matches (total `.match` count = `2 * feed.length`).
- The duplicate copy is `aria-hidden="true"`; the primary copy carries `data-match`.
- `--ticker-duration` scales with match count (e.g. 3 matches → `12s`).
- Existing assertions still pass: each match shows score text and a kind class; upcoming shows `"vs"`; the live match has the `live` class. (These query the primary copy.)

**Not unit-tested:** the animation itself (jsdom has no layout/animation). Covered by the existing `scores=off` e2e test (feed hidden) plus a manual smoke check on the board that the ticker scrolls smoothly and loops seamlessly.

## Scope

In scope: the right-padding tweak and the ticker. Out of scope: additional `scores` layouts (`row`/`grid`), configurable scroll speed, pausing on hover.

## Unresolved questions

None.
