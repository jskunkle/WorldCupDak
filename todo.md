# World Cup 2026 DAKboard — Tasks

Plan: `docs/superpowers/plans/2026-06-27-knockout-bracket.md`
Spec: `docs/superpowers/specs/2026-06-27-knockout-bracket-design.md`

Knockout bracket view with automatic standings→bracket switchover and
query-string control. Client-only (Worker already serves all 104 games).

## Task 0 — Branch

- [ ] `git checkout -b feat/knockout-bracket`
- [ ] Confirm clean working tree

## Task 1 — Config: `view` + `bracket` params

- [ ] Write failing `tests/config.test.ts` (defaults + parsing)
- [ ] Verify it fails
- [ ] Add `view`/`bracket` to `DashboardConfig`, `DEFAULTS`, `parseConfig`
- [ ] Verify it passes
- [ ] Commit

## Task 2 — Export `classify`

- [ ] Export `classify` from `src/standings.ts`
- [ ] `tests/standings.test.ts` still passes
- [ ] Commit

## Task 3 — Bracket types

- [ ] Add `KnockoutRound`, `BracketSlot`, `BracketMatch`, `Bracket` to `src/types.ts`
- [ ] Typecheck
- [ ] Commit

## Task 4 — `buildBracket` (pure, TDD)

- [ ] Write failing `tests/bracket.test.ts` (roundOf, bucket, id-order, half-split, TBD join, status, final/third)
- [ ] Verify it fails
- [ ] Implement `src/bracket.ts` (`roundOf`, `buildBracket`)
- [ ] Verify it passes
- [ ] Commit

## Task 5 — `selectView` + `activeRound` (pure, TDD)

- [ ] Add failing tests (override, auto branches, safety net, empty guard, active round)
- [ ] Verify they fail
- [ ] Implement `selectView`, `activeRound` in `src/bracket.ts`
- [ ] Verify they pass
- [ ] Commit

## Task 6 — Container + styles

- [ ] Add `#bracket` section to `index.html`
- [ ] Add bracket + focused CSS to `src/styles.css`
- [ ] Commit

## Task 7 — Full bracket renderer (TDD)

- [ ] Write failing `tests/render-bracket.test.ts`
- [ ] Verify it fails
- [ ] Implement `renderFullBracket` in `src/render-bracket.ts`
- [ ] Verify it passes
- [ ] Commit

## Task 8 — Focused renderer (TDD)

- [ ] Add failing focused tests
- [ ] Verify they fail
- [ ] Implement `renderFocusedBracket` (+ `orderForFocus`, progress rail)
- [ ] Verify they pass
- [ ] Commit

## Task 9 — Wire into `main.ts`

- [ ] Imports + `lastGames`/focus-rotation state
- [ ] Capture `lastGames` in `refresh` + `seedFromCache`
- [ ] View-aware `paint` + `paintBracket` + rotation start/stop
- [ ] Stop rotation on `visibilitychange` hidden
- [ ] `vite build` clean
- [ ] Commit

## Task 10 — E2E

- [ ] Create `e2e/bracket.spec.ts` (forced bracket, focused, standings)
- [ ] Run e2e green
- [ ] Commit

## Task 11 — Docs + format + full suite

- [ ] Document `view`/`bracket` in `README.md` + `CLAUDE.md`
- [ ] `prettier --write .`
- [ ] Full `vitest run` passes
- [ ] `vite build` clean
- [ ] Commit

## Task 12 — Manual verify + PR

- [ ] Smoke test `/?view=bracket`, `?bracket=focused`, `?view=standings`, `/`
- [ ] Push + open PR (when asked)
