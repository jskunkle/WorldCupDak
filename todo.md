# World Cup 2026 DAKboard — Tasks

Plan: `docs/superpowers/plans/2026-06-29-bracket-kickoff-times.md`
Spec: `docs/superpowers/specs/2026-06-29-bracket-kickoff-times-design.md`

Opt-in `?bracketTimes=on` to show a `Jul 4 · 14:00` kickoff caption under each
match in the full bracket view. Defaults off. Client-only, no Worker changes.

## Task 1 — Config: `bracketTimes` param

- [ ] Add failing tests to `tests/config.test.ts` (defaults literal + on/off/absent)
- [ ] Verify they fail
- [ ] Add `bracketTimes` to `DashboardConfig`, `DEFAULTS`, `parseConfig`
- [ ] Verify they pass
- [ ] Commit

## Task 2 — `kickoffCaption` formatter (TDD)

- [ ] Write failing `kickoffCaption` test in `tests/render-bracket.test.ts`
- [ ] Verify it fails
- [ ] Implement exported `kickoffCaption(date, locale?)` in `src/render-bracket.ts`
- [ ] Verify it passes
- [ ] Commit

## Task 3 — Render caption in full bracket (TDD)

- [ ] Add failing tests (absent by default; one `.bm-when` per match when on)
- [ ] Verify they fail
- [ ] Thread `showTimes` through `matchEl`/`columnEl`/`sideEl`/`finalColumn`/`renderFullBracket`
- [ ] Verify all bracket tests pass
- [ ] Commit

## Task 4 — Wire config + style

- [ ] Pass `config.bracketTimes` in `main.ts` `paintBracket`
- [ ] Add `.bm-when` rule to `src/styles.css`
- [ ] `tsc && vite build` clean
- [ ] Commit

## Task 5 — E2E

- [ ] Add `?bracketTimes=on` shows-caption + default-hidden tests to `e2e/bracket.spec.ts`
- [ ] Run e2e green
- [ ] Commit

## Task 6 — Docs + final checks

- [ ] Document `bracketTimes` in `README.md` params table
- [ ] `prettier --write .`
- [ ] Full `vitest run` passes; `tsc && vite build` clean
- [ ] Commit

## Wrap-up

- [ ] Smoke test `/?view=bracket&bracketTimes=on` and `/?view=bracket`
- [ ] Push + open PR (when asked)
