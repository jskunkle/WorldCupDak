# Cloudflare Worker Data Layer with Multi-Source Failover — Design

**Date:** 2026-06-16
**Status:** Approved

## Goal

Stop slow/failing upstream data from blanking the dashboard, and add resilience by supporting more than one data source. A small Cloudflare Worker becomes the dashboard's data layer: it refreshes from the sources on its own schedule into a warm cache and serves that cache to clients instantly, failing over to a second source when the primary is unavailable.

## Background

The dashboard fetches `/get/teams` and `/get/games` directly from `https://worldcup26.ir` (`src/api.ts`). Measured live, `/get/games` has a **12–20s server-side time-to-first-byte** (TTFB; DNS ~10ms, connect ~130ms — the latency is the origin, not the network), and `/get/teams` ~2.5s. Because the client fetches games then teams **sequentially** with **no timeout**, and a first-time visitor has **no `localStorage` cache** to paint from, cold visitors see a blank window for 15s–2min. (Repeat visitors are spared by the existing client cache in `src/cache.ts`.)

We previously considered a second data source but it requires a server because it is **keyed** — the API key cannot ship in client-side code. That makes a small server mandatory regardless, so it becomes the natural home for both caching and failover.

## Constraints

- **Free hosting.** Must stay within Cloudflare's free tier — notably KV's 1,000 writes/day limit.
- **Minimal service juggling.** Frontend stays on Render, unchanged in hosting. The Worker is the only new deployable.
- **Secret safety.** The fallback source's API key lives as a Worker secret, never in the client or the repo.
- **Never block a client on the slow origin.** Client requests are served from cache only; origin fetches happen out-of-band.
- **No blank screen.** Last-known-good data is always preferred over nothing.

## Decisions

- **Primary source:** worldcup26.ir (free, no key). **Fallback:** the keyed source, used only when the primary errors or times out. The Worker model hides the primary's slowness because the slow fetch runs in the background cron, not the request path.
- **Normalization moves server-side.** The Worker serves clean domain `Team[]` / `Game[]`; each source adapter normalizes its own schema. The client drops its `normalizeTeams`/`normalizeGames` step.
- **Refresh cadence:** Cron every 1 minute, but KV is written **only when the data changed** (ETag/hash gate) to stay under the free write cap.
- **Repo layout:** the Worker lives in a `worker/` folder in this repo (single repo; frontend deploys via Render, Worker via `wrangler`).
- **Failover timeout:** primary fetch is aborted after 25s and treated as a failure (falls through to the fallback).

## 1. Worker shape — `worker/`

A TypeScript Cloudflare Worker with two entry points:

- **`scheduled(event, env, ctx)`** — the Cron-triggered refresher (see §3).
- **`fetch(request, env, ctx)`** — the request handler serving `/get/teams` and `/get/games` (see §4).

`wrangler.toml` declares: the KV namespace binding, the `crons = ["* * * * *"]` schedule, and the fallback API key as a secret binding (`wrangler secret put`). No dashboard clicking — config is code.

## 2. Source adapters & shared domain types — `worker/sources/`

A single adapter interface, one implementation per source:

```
interface Source {
  name: string;
  fetchTeams(env): Promise<Team[]>;
  fetchGames(env): Promise<Game[]>;
}
```

- `worldcup26.ts` — primary. Reuses the existing normalization logic (`name_en`→`name`, `fifa_code`→`code`, `local_date` "MM/DD/YYYY HH:mm" → `Date`, `finished === "TRUE"` → boolean, etc.), moved out of the client `src/api.ts` into a shared module the Worker imports.
- `<fallback>.ts` — the keyed source. **Prerequisite: identify the source and capture a sample response** so its normalizer can be written. Reads its key from `env`. Until provided, this adapter is a stub that throws, which simply means failover has nothing to fall to (primary-only behavior).

`Team` and `Game` are the existing domain types from `src/types.ts`; the normalizers target those exactly, so the contract the client consumes is unchanged in *shape* — only its *origin* moves to the Worker.

## 3. Scheduled refresher — `worker/refresh.ts`

On each Cron tick, per dataset (games every tick; teams gated like the client does today — hourly or on unknown-team-id):

1. Try **primary** with a 25s `AbortController` timeout.
2. On non-2xx, network error, or timeout → try **fallback**.
3. If a source returns data, compute a change key: prefer the primary's `ETag` response header (observed: `ETag: W/"…"`); otherwise a hash of the normalized payload. Compare to the change key stored alongside the last KV record.
4. **Write KV only if the change key differs.** Store `{ data, source, fetchedAt, changeKey }`.
5. If both sources fail, write nothing — the prior KV record stands.

KV keys: `teams` and `games`. Per-minute cron that writes only on change keeps writes far under 1,000/day outside live-match windows.

## 4. Request handler — `worker/handler.ts`

- `GET /get/teams` / `GET /get/games`: read the KV record, return `data` as JSON with `Access-Control-Allow-Origin` (the Render origin), a short `Cache-Control`, and an `X-Data-Source` / `X-Fetched-At` header for observability.
- **Cold KV** (before the first cron has run): do a one-time inline populate (primary→fallback) so the first-ever request isn't empty.
- **Both sources down and KV empty:** `503` with a small JSON error body. The client's existing `localStorage` cache keeps the last paint up, so the wall display does not go blank.
- Includes `fetchedAt` in the payload so the client can *optionally* surface staleness later (not built now — YAGNI).

## 5. Client change — `src/api.ts`

- Point `BASE_URL` at the Worker URL.
- Remove `normalizeTeams`/`normalizeGames` (moved to the Worker). `fetchTeams`/`fetchGames` now fetch already-normalized `Team[]`/`Game[]` and **revive `kickoff` from its serialized string into a `Date`** — the same revival `src/cache.ts` already does.
- Everything downstream (`standings.ts`, `render.ts`, `main.ts`, `cache.ts`) is unchanged; the client still receives `Team[]`/`Game[]`.

## 6. Behavior preserved

- The client's `localStorage` instant-paint and last-good-on-failure behavior (`src/main.ts`, `src/cache.ts`) is untouched and now layers on top of a fast, warm server cache.
- All URL-param behavior unchanged.
- Visibility pause/resume unchanged.

## 7. Testing

**Vitest (TDD):**

- `worker/sources/*.test.ts` — each adapter's normalizer is a pure function: raw source JSON → expected `Team[]`/`Game[]`. Port the existing `tests/api.test.ts` normalization assertions for the worldcup26 adapter; write fresh ones for the fallback once its schema is known.
- `worker/refresh.test.ts` — failover selection as a pure function: primary success → primary used; primary throws/times out → fallback used; both fail → null (no write); change-key unchanged → no write; changed → write. Inject fake source adapters and a fake clock.
- `tests/api.test.ts` (client) — simplify: `fetchTeams`/`fetchGames` now return normalized data and revive `kickoff`; drop the normalization-of-raw assertions (those move to the worker adapter test).

**Worker runtime:** `fetch` and `scheduled` handlers exercised with Miniflare / `wrangler dev` — cold-KV inline populate, KV-hit fast path, 503 path, CORS headers. Not unit-tested beyond that.

**Manual smoke:** `wrangler dev` locally, confirm `/get/games` serves from KV in <100ms; point a local frontend build at it and confirm instant paint.

## Net effect

Cold visitors get an instant paint from a warm edge cache instead of a 12s–2min blank window; the dashboard survives worldcup26.ir being slow or down by failing over to the keyed source; the keyed source's secret stays server-side; and it all runs on free tiers with the frontend's Render hosting untouched.

## Unresolved questions

1. **What is the fallback data source?** Need its name/URL, the API key, and a sample `teams`/`games` response to write its adapter and normalizer. Until then the design ships primary-only (fallback stub throws).
2. **CORS origin:** lock `Access-Control-Allow-Origin` to the exact Render URL, or allow `*`? (Lean: lock to the Render origin.)
