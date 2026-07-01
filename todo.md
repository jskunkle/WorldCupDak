# World Cup 2026 DAKboard — Tasks

Plan: `docs/superpowers/plans/2026-07-01-venue-timezone-kickoff-fix.md`
Spec: `docs/superpowers/specs/2026-07-01-venue-timezone-kickoff-fix-design.md`

Fix the Worker so worldcup26 kickoff times are stored as the correct absolute
UTC instant, derived from each venue's local timezone. `local_date` is
venue-local wall-clock time; the current code binds it to the Worker's UTC
runtime, shifting every kickoff by the venue's offset (e.g. noon EDT shown as
8 am). Worker-only; no client changes.

## Task 1 — Stadium timezone module + wall-clock→UTC helper (TDD)

- [ ] Write failing `stadium-timezones.test.ts` (id→zone map + `zonedWallTimeToUtc`)
- [ ] Verify it fails (module unresolved)
- [ ] Implement `worker/sources/stadium-timezones.ts` (`stadiumTimeZone`, `zonedWallTimeToUtc`)
- [ ] Verify it passes
- [ ] Commit

## Task 2 — Wire venue timezone into worldcup26 parsing (TDD)

- [ ] Add `stadium_id` to `finishedGame` fixture; make kickoff assertion deterministic (`toISOString`)
- [ ] Add failing venue-conversion test (stadiums 7/4/1/16 at noon local)
- [ ] Verify they fail (wrong instant + `RawGame` has no `stadium_id`)
- [ ] Add `stadium_id: string` to `RawGame` in `src/types.ts`
- [ ] Update `parseKickoff`/`normalizeGames` in `worldcup26.ts` to use the venue zone
- [ ] Verify tests pass
- [ ] `tsc --noEmit -p worker/tsconfig.json` clean
- [ ] Commit

## Task 3 — Full verification, docs, format

- [ ] Full `vitest run` passes (worker + client)
- [ ] `tsc && vite build` clean (matches Render)
- [ ] Add venue-timezone note to `CLAUDE.md` architecture section
- [ ] `prettier --write .`
- [ ] Commit

## Wrap-up

- [ ] Push + open PR (when asked)
