# WorldCupDak — project guide

Static FIFA World Cup 2026 standings/scores dashboard (TypeScript + Vite, no UI
framework) that embeds as an iframe on a DAKboard wall display. Standings are
computed client-side. See `README.md` for URL params and deploy.

## Architecture

- `src/` — the static client. `main.ts` orchestrates load → 90s refresh →
  paint, with a `localStorage` instant-paint cache (`cache.ts`) and last-good
  fallback. `api.ts` fetches **already-normalized** `Team[]`/`Game[]` from the
  Worker (see below) and revives `kickoff` to a `Date`.
- The client also derives a knockout `Bracket` from the same games (`bracket.ts`, round inferred from `matchday`) and `main.ts` auto-switches standings → bracket via `selectView`. Layouts live in `render-bracket.ts`. The full bracket auto-scales via `fitBracket`. With `?rotate=`, `main.ts` cycles through views on a timer instead.
- `worker/` — a Cloudflare Worker data layer (caching + multi-source failover).
  A Cron trigger refreshes a full snapshot (teams + games from the **same**
  source, so team-id spaces match) into Workers KV, writing only when content
  changed (content-hash gate → stays within KV free-tier writes). The `fetch`
  handler serves KV with CORS locked to the Render origin. Primary source
  worldcup26.ir, fallback football-data.org (token is a Worker secret). Each
  source is a `Source` adapter (`worker/sources/`) that normalizes to the domain
  types in `src/types.ts`.

## Commands

```bash
pnpm dev / pnpm test / pnpm build / pnpm e2e
pnpm worker:dev / pnpm worker:typecheck / pnpm worker:deploy
pnpm format   # Prettier — run before committing
```

## Dev-environment gotcha

In the Claude Code tool shells on this machine, the `mise` shims for `node` /
`pnpm` / `npx` fail (`mise ERROR cannot find binary path`). Call the real node
binary directly instead:

```bash
NODE="C:/Users/shane/AppData/Local/mise/installs/node/22.22.2/node.exe"
"$NODE" node_modules/vitest/vitest.mjs run [path]              # tests
"$NODE" node_modules/typescript/bin/tsc --noEmit -p worker/tsconfig.json
"$NODE" node_modules/typescript/bin/tsc && \
  "$NODE" node_modules/vite/bin/vite.js build                 # build (matches Render)
"$NODE" node_modules/prettier/bin/prettier.cjs --write .      # format
```

The deploy runs `pnpm build` = `tsc && vite build`. Always run `tsc` before
`vite build`: `vite build` alone skips full type-checking, so type errors (e.g.
a test using a now-incomplete `DashboardConfig` literal) pass locally but fail
the Render build.

`git` works normally. The node version in that path may change after upgrades.

## Conventions

- TDD for non-trivial functions (Vitest). Pure functions are unit-tested; Worker
  network I/O and runtime wiring are smoke-tested via `wrangler dev`.
- Prettier formatting; commit messages use Conventional Commits.
- Secrets (e.g. `FOOTBALL_DATA_TOKEN`) live only as Worker secrets — never in the
  repo or client code.
