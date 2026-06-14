# World Cup 2026 DAKboard — Tasks

Plan: `docs/superpowers/plans/2026-06-14-worldcup-dakboard.md`

## Task 1 — Project scaffold
- [ ] Create `package.json`
- [ ] Create `tsconfig.json`
- [ ] Create `vite.config.ts` (Vite + Vitest/jsdom)
- [ ] Create `index.html`
- [ ] Create placeholder `src/main.ts`
- [ ] `pnpm install` && `pnpm build` verifies
- [ ] Commit

## Task 2 — Types
- [ ] Create `src/types.ts` (Raw + domain types)
- [ ] `tsc --noEmit` passes
- [ ] Commit

## Task 3 — API normalization
- [ ] Write failing tests in `tests/api.test.ts`
- [ ] Verify they fail
- [ ] Implement `normalizeTeams`, `normalizeGames`, `fetchData` in `src/api.ts`
- [ ] Verify tests pass
- [ ] Commit

## Task 4 — computeStandings
- [ ] Write failing tests in `tests/standings.test.ts`
- [ ] Verify they fail
- [ ] Implement `computeStandings` in `src/standings.ts`
- [ ] Verify tests pass
- [ ] Commit

## Task 5 — buildScoreFeed
- [ ] Append failing tests to `tests/standings.test.ts`
- [ ] Verify they fail
- [ ] Implement `buildScoreFeed` in `src/standings.ts`
- [ ] Verify tests pass
- [ ] Commit

## Task 6 — Render layer
- [ ] Write failing tests in `tests/render.test.ts`
- [ ] Verify they fail
- [ ] Implement `renderStandings`, `renderScoreFeed` in `src/render.ts`
- [ ] Verify tests pass
- [ ] Commit

## Task 7 — Orchestration
- [ ] Replace `src/main.ts` (load, 90s refresh, last-good, visibility pause)
- [ ] `pnpm build` + `pnpm test` pass
- [ ] Manual `pnpm dev` smoke against live API
- [ ] Commit

## Task 8 — Dark theme
- [ ] Create `src/styles.css`
- [ ] Visual check via `pnpm dev`
- [ ] Commit

## Task 9 — Playwright e2e
- [ ] Create `playwright.config.ts`
- [ ] Create `e2e/dashboard.spec.ts`
- [ ] `playwright install chromium` && `pnpm e2e` passes
- [ ] Commit

## Task 10 — Deploy config + docs
- [ ] Create `render.yaml`
- [ ] Update `README.md`
- [ ] `pnpm format`, `pnpm test`, `pnpm build`
- [ ] Commit
