# Knockout bracket view — design

**Date:** 2026-06-27
**Status:** Approved (design), pending spec review → implementation plan

## Problem

The group stage ends tonight; the knockout stage begins tomorrow (R32 on
2026-06-28). The DAKboard display currently only shows group standings. It needs
to show the knockout bracket once the tournament leaves the group stage, and the
switch should happen automatically without manual intervention.

## Key finding (de-risks the whole feature)

The data source already carries the **entire** tournament. `GET /get/games`
returns 104 games tagged by `type`: 72 `group`, 16 `r32`, 8 `r16`, 4 `qf`, 2
`sf`, 1 `third`, 1 `final`. The Worker already normalizes and serves all of them
(`isGroupStage = type === "group"`), so **no Worker changes are needed** — this
is a client-only feature.

Crucially, the source **fills in later-round teams itself** as matchups resolve
(R32 already shows real teams like Brazil–Japan, Argentina–Cape Verde;
unresolved slots come back as `home_team_id: "0"` → render as "TBD"). So the app
**does not compute who advances** — it only positions and paints the games the
source provides.

## Scope

- Two knockout layouts, both built:
  - **Full bracket (Option A, default):** all 6 tiers mirrored around the final,
    flags on every team, later rounds shown as TBD until resolved.
  - **Focused (Option B):** large, legible cards for the current round's
    matches plus a small bracket-progress rail; for reading across a room.
- Automatic, data-driven switch between standings and bracket.
- Query-string params to force a view / pick a layout.
- Client-only. No Worker changes. No schema changes to the API payload.

Out of scope: computing advancement, predicting matchups, editing the Worker,
third-place-game prominence beyond a labeled slot.

## View selection (data-driven)

New pure function `selectView(games, now, config) → "standings" | "bracket"`.

- If `config.view` is `standings` or `bracket`, honor it (manual override).
- Otherwise (`auto`, the default): return `"bracket"` when **every group-stage
  game is `finished`**, OR when `now` is at/after the earliest knockout
  `kickoff`. The OR-clause is a safety net so a postponed/unmarked group game
  cannot strand the display on standings.
- Re-evaluated on every refresh cycle, so the flip happens on its own overnight.

## Bracket model (pure)

New `src/bracket.ts`: `buildBracket(games, teams, now) → Bracket`.

- Filter to knockout games (`!isGroupStage`), bucket by `type`.
- For the left/right columns, order each round's games by their **bracket
  position**, not by `id`. The original assumption (id-order == bracket order,
  adjacent pairs feed the next round) was **wrong** — confirmed once R32 teams
  populated (2026-06-28): it put half the teams on the wrong side of the final
  and mispaired R16 matchups (e.g. RSA/CAN vs GER/PAR instead of GER/PAR vs
  FRA/SWE). The correct topology lives in the single `BRACKET_ORDER` constant,
  keyed by FIFA match number, verified against the official/ESPN bracket. (The
  `rounds[r]` map stays id-sorted; it feeds only the focused view and rail.)
- Split each round's bracket-ordered games into a left half (first N/2, the top
  side of the draw) and right half (bottom side).
- Resolve each slot: join `homeId`/`awayId` to `teams` for `{ name, code,
flagUrl }`; `id === "0"` → `{ tbd: true }`. Carry `homeScore`/`awayScore`.
- Per-match status reuses the existing `classify(game, now)` →
  `live | finished | upcoming`.

New types in `types.ts`: `BracketSlot`, `BracketMatch`, `BracketRound`,
`Bracket` (with `left`, `right`, `final`, `third`).

## Rendering

New `src/render-bracket.ts`, two entry points, both painting into a `#bracket`
container added to `index.html`:

- `renderFullBracket(container, bracket)` — the mirrored 6-tier layout validated
  in the mockup. Columns use flex bands (each match `flex:1`) so later rounds
  center between feeders automatically; connector lines via CSS pseudo-elements.
  Flags are `<img>` with the same error-fallback-to-code behavior as standings.
- `renderFocusedBracket(container, bracket)` — large cards for the **active
  round** (earliest round containing an unfinished game; pure helper
  `activeRound(bracket)`), ordered live → today's upcoming → recent finished,
  plus a mini round-progress rail. If matches exceed what fits, paginate and
  rotate pages on a timer.

Data attributes for Playwright: `data-round="r32"`, `data-match="<id>"`,
`data-team="<code>"`.

Existing `fitToViewport` scales the bracket to the panel like it does standings.

## Config (`src/config.ts`)

Two new params, parsed in the existing style:

- `view`: `auto` (default) | `standings` | `bracket`.
- `bracket`: `full` (default) | `focused`.

Added to `DashboardConfig` + `DEFAULTS`. Unknown values fall back to defaults.

## main.ts wiring

1. Each paint: `selectView(...)` picks the mode.
2. Standings mode: current behavior (groups + score ticker).
3. Bracket mode: hide `#groups` and the score ticker, show `#bracket`, render
   the chosen layout. Focused mode owns a rotation timer, cleared on mode/visibility change.
4. Cached instant-paint path (`seedFromCache`) honors the same selection.

## Testing (TDD)

Pure functions first (Vitest): `selectView` (all branches incl. the safety-net
OR), `buildBracket` (bucketing, id-ordering, half-split, TBD slots, flag join,
status), `activeRound`. Renderers get DOM smoke tests in the repo's existing
style. Playwright e2e: load `?view=bracket` and assert round headings + known
R32 team names render; `?view=bracket&bracket=focused` shows large cards.

## Files

| File                     | Change                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `src/types.ts`           | add `Bracket*` types                                        |
| `src/bracket.ts`         | new — `selectView`, `buildBracket`, `activeRound` (+ tests) |
| `src/render-bracket.ts`  | new — full + focused renderers (+ tests)                    |
| `src/config.ts`          | add `view`, `bracket` params                                |
| `src/main.ts`            | view selection + bracket wiring + focused rotation          |
| `index.html`             | add `#bracket` container                                    |
| `src/styles.css`         | bracket + focused styles                                    |
| `README.md`, `CLAUDE.md` | document new params + view behavior                         |

## Unresolved questions

1. ~~**Bracket linkage (main risk):** id-order adjacency is assumed for
   connector positioning.~~ **RESOLVED (2026-06-28):** the assumption was wrong.
   A reddit user reported the matchups/sides were off; verified against the
   official/ESPN bracket and replaced id-order with the `BRACKET_ORDER` constant
   (FIFA match-number topology). It was data-wrong, not merely cosmetic — who you
   play next and which side of the final you're on were both incorrect.
2. **Score ticker in bracket mode:** plan hides it (the bracket shows scores
   inline). Keep it hidden, or keep the ticker for at-a-glance scores?
3. **Focused-view rotation cadence:** default 10s/page — fine, or tie it to the
   existing `refresh` param?
