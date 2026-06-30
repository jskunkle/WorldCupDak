# Kickoff captions on the full bracket — design

**Date:** 2026-06-29
**Status:** Approved

## Problem

A user asked for kickoff days/times on the knockout-bracket games. The full
bracket view is intentionally minimal (flag + FIFA code + score) so `fitBracket`
can scale it large for a wall display, so showing times risks tightening the
layout. We want it available but off by default.

## Scope

Full bracket view only (`matchEl` in `src/render-bracket.ts`). The focused view
already shows kickoff times via `whenText` and is unchanged. No data/Worker
changes — `BracketMatch.kickoff` (a `Date`) already exists.

## Behavior

- New URL param `?bracketTimes=on`, **defaulting off**. The wall display is
  unchanged unless the param is set. Follows the existing opt-in pattern in
  `src/config.ts` (`p.get("bracketTimes") === "on"`).
- New field `bracketTimes: boolean` on `DashboardConfig` (default `false`).
- When on, each match box gets one caption line (`.bm-when`) below the two slot
  rows — one per match, not per team.
- Format: `Jul 4 · 14:00` (month + day · time). Rendered via `toLocaleString`
  using the viewer's locale/timezone, so the DAKboard display shows its own
  local time. Time format is locale-driven (a 12h locale renders `2:00 PM`).
- Shown for all statuses, including finished and live. The existing `live` box
  styling already signals live, so no special-casing of the caption.

## Layout

The extra caption line makes each match box taller, so `fitBracket` scales the
whole board down slightly when the flag is on. This is the unavoidable
trade-off; keeping it to a single caption per match (not per slot) minimizes it.

## Implementation notes

- Extract a pure formatter `kickoffCaption(date: Date): string` for the
  `Jul 4 · 14:00` format, unit-tested with Vitest (TDD). The existing
  `whenText` is coupled to match status; a standalone formatter is cleaner to
  test and reuse.
- `matchEl` appends `.bm-when` only when `config.bracketTimes` is true. The
  render functions will need access to the flag (thread it through, matching how
  other config reaches the renderer).
- Add a `.bm-when` CSS rule (small, muted, centered).

## Files touched

- `src/config.ts` — parse `bracketTimes`, add to `DashboardConfig` + defaults.
- `tests/config.test.ts` — cover on/off/absent.
- `src/render-bracket.ts` — `kickoffCaption` + conditional `.bm-when`.
- bracket styles — `.bm-when` rule.
- `README.md` — document the param.
- `tests` — unit test for `kickoffCaption`; e2e exercises `?bracketTimes=on`.

## Open questions

None.
