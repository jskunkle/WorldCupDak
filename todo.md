# World Cup 2026 DAKboard — Tasks

Plan: `docs/superpowers/plans/2026-06-14-worldcup-dakboard.md`

All tasks complete. 27 unit tests + 1 Playwright e2e passing; build clean.

## Task 1 — Project scaffold

- [x] Create `package.json`
- [x] Create `tsconfig.json`
- [x] Create `vite.config.ts` (Vite + Vitest/jsdom)
- [x] Create `index.html`
- [x] Create placeholder `src/main.ts`
- [x] `pnpm install` && `pnpm build` verifies
- [x] Commit

## Task 2 — Types

- [x] Create `src/types.ts` (Raw + domain types)
- [x] `tsc --noEmit` passes
- [x] Commit

## Task 3 — API normalization

- [x] Write failing tests in `tests/api.test.ts`
- [x] Verify they fail
- [x] Implement `normalizeTeams`, `normalizeGames`, `fetchData` in `src/api.ts`
- [x] Verify tests pass
- [x] Commit

## Task 4 — computeStandings

- [x] Write failing tests in `tests/standings.test.ts`
- [x] Verify they fail
- [x] Implement `computeStandings` in `src/standings.ts`
- [x] Verify tests pass
- [x] Commit

## Task 5 — buildScoreFeed

- [x] Append failing tests to `tests/standings.test.ts`
- [x] Verify they fail
- [x] Implement `buildScoreFeed` in `src/standings.ts`
- [x] Verify tests pass
- [x] Commit

## Task 6 — Render layer

- [x] Write failing tests in `tests/render.test.ts`
- [x] Verify they fail
- [x] Implement `renderStandings`, `renderScoreFeed` in `src/render.ts`
- [x] Verify tests pass
- [x] Commit

## Task 7 — Orchestration

- [x] Replace `src/main.ts` (load, 90s refresh, last-good, visibility pause)
- [x] `pnpm build` + `pnpm test` pass
- [x] Manual `pnpm dev` smoke against live API
- [x] Commit

## Task 8 — Dark theme

- [x] Create `src/styles.css`
- [x] Visual check via `pnpm dev`
- [x] Commit

## Task 9 — Playwright e2e

- [x] Create `playwright.config.ts`
- [x] Create `e2e/dashboard.spec.ts`
- [x] `playwright install chromium` && `pnpm e2e` passes
- [x] Commit

## Task 10 — Deploy config + docs

- [x] Create `render.yaml`
- [x] Update `README.md`
- [x] `pnpm format`, `pnpm test`, `pnpm build`
- [x] Commit

## Post-implementation — code review fixes

- [x] Cap finished score feed (most recent 8)
- [x] Harden score coercion against NaN
- [x] Grid: exact 6 rows + truly pinned strip
- [x] Add tests: fetchData, GF tiebreaker, finished cap, upcoming "vs", flag fallback
