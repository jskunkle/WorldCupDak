# World Cup 2026 DAKboard — Tasks

Plan: `docs/superpowers/plans/2026-06-16-data-proxy-worker.md`
Spec: `docs/superpowers/specs/2026-06-16-data-proxy-worker-design.md`

Cloudflare Worker data layer with worldcup26.ir → football-data.org failover.

## Task 1 — Worker scaffolding & config

- [ ] `pnpm add -D wrangler @cloudflare/workers-types`
- [ ] Add `worker:typecheck` / `worker:dev` / `worker:deploy` scripts to `package.json`
- [ ] Add `worker/**/*.test.ts` to Vitest `include` in `vite.config.ts`
- [ ] Create `worker/tsconfig.json`
- [ ] Create `worker/wrangler.toml` (KV binding, cron, compat date)
- [ ] Verify `pnpm wrangler --version`
- [ ] Commit

## Task 2 — Content-hash util

- [ ] Write failing `worker/hash.test.ts`
- [ ] Verify it fails
- [ ] Implement `worker/hash.ts` (djb2)
- [ ] Verify it passes
- [ ] Commit

## Task 3 — Timeout util

- [ ] Write failing `worker/timeout.test.ts`
- [ ] Verify it fails
- [ ] Implement `worker/timeout.ts` (`withTimeout`)
- [ ] Verify it passes
- [ ] Commit

## Task 4 — Source interface & failover

- [ ] Create `worker/sources/source.ts` (`Source`, `SourceSnapshot`)
- [ ] Write failing `worker/failover.test.ts`
- [ ] Verify it fails
- [ ] Implement `worker/failover.ts` (`fetchSnapshotWithFailover`)
- [ ] Verify it passes
- [ ] Commit

## Task 5 — worldcup26 adapter (move normalizers)

- [ ] Write failing `worker/sources/worldcup26.test.ts` (ported from `tests/api.test.ts`)
- [ ] Verify it fails
- [ ] Implement `worker/sources/worldcup26.ts` (normalizers + `worldcup26Source`)
- [ ] Verify it passes
- [ ] Commit

## Task 6 — football-data.org adapter

- [ ] Write failing `worker/sources/football-data.test.ts` (fixtures + group derivation)
- [ ] Verify it fails
- [ ] Implement `worker/sources/football-data.ts` (normalizers + `createFootballDataSource`)
- [ ] Verify it passes
- [ ] Commit

## Task 7 — Refresh orchestration

- [ ] Write failing `worker/refresh.test.ts` (fake KV + fake sources)
- [ ] Verify it fails
- [ ] Implement `worker/refresh.ts` (`refreshSnapshot`, `KVStore`, hash-gated write)
- [ ] Verify it passes
- [ ] Commit

## Task 8 — Request handler

- [ ] Write failing `worker/handler.test.ts`
- [ ] Verify it fails
- [ ] Implement `worker/handler.ts` (routing, CORS, cold populate, 503)
- [ ] Verify it passes
- [ ] Commit

## Task 9 — Worker entry point

- [ ] Implement `worker/index.ts` (`Env`, `fetch`, `scheduled`)
- [ ] `pnpm worker:typecheck` passes
- [ ] `pnpm test` (full suite) passes
- [ ] Commit

## Task 10 — Repoint client at Worker

- [ ] Rewrite `tests/api.test.ts` for the new contract; verify it fails
- [ ] Rewrite `src/api.ts` (drop normalization, revive kickoff, `VITE_API_BASE`)
- [ ] Verify `tests/api.test.ts` passes
- [ ] `pnpm test && pnpm build` clean (add `src/vite-env.d.ts` if needed)
- [ ] Commit

## Task 11 — Deploy & wire-up (manual)

- [ ] `! pnpm wrangler login`
- [ ] Create KV namespace; put its id in `worker/wrangler.toml`
- [ ] `! pnpm wrangler secret put FOOTBALL_DATA_TOKEN`
- [ ] Local smoke test (`pnpm worker:dev` + curl)
- [ ] `pnpm worker:deploy`; note the Worker URL
- [ ] Add `VITE_API_BASE` to `render.yaml`; rebuild
- [ ] Verify deployed Worker via curl
- [ ] Browser smoke test (empty-cache reload paints fast)
- [ ] Rotate the football-data.org token; re-set secret; redeploy
- [ ] Update `CLAUDE.md` / `README.md`; `pnpm format`
- [ ] Commit
