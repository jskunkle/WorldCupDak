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

- **Primary source:** worldcup26.ir (free, no key). **Fallback:** football-data.org (keyed), used only when the primary errors or times out. The Worker model hides the primary's slowness because the slow fetch runs in the background cron, not the request path.
- **football-data.org specifics:** API v4, competition `WC` (id 2000, in the free tier), endpoints `GET /v4/competitions/WC/matches` and `GET /v4/competitions/WC/teams`, auth via `X-Auth-Token` header. Free tier is rate-limited to **10 requests/min** — fine, since we call it only on failover (2 requests/refresh).
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
- `football-data.ts` — fallback. Reads the token from `env.FOOTBALL_DATA_TOKEN` (a Worker secret — see §8), sends it as `X-Auth-Token`. Fetches the two `WC` endpoints and normalizes to our domain types per the mapping below.

`Team` and `Game` are the existing domain types from `src/types.ts`; the normalizers target those exactly, so the contract the client consumes is unchanged in *shape* — only its *origin* moves to the Worker.

### football-data.org → domain mapping

**Game** (from a `matches[]` entry):

| domain `Game` | football-data source |
| --- | --- |
| `id` | `String(match.id)` |
| `homeId` / `awayId` | `String(match.homeTeam.id)` / `String(match.awayTeam.id)` |
| `homeName` / `awayName` | `match.homeTeam.name` / `match.awayTeam.name` |
| `homeScore` / `awayScore` | `match.score.fullTime.home ?? 0` / `.away ?? 0` |
| `group` | `match.group` `"GROUP_A"` → `"A"` (strip `"GROUP_"`); `null` for knockout |
| `matchday` | `match.matchday` |
| `kickoff` | `new Date(match.utcDate)` (ISO UTC instant) |
| `finished` | `match.status === "FINISHED"` |
| `isGroupStage` | `match.stage === "GROUP_STAGE"` |

**Team** (from a `teams[]` entry):

| domain `Team` | football-data source |
| --- | --- |
| `id` | `String(team.id)` |
| `name` | `team.name` |
| `code` | `team.tla` (e.g. `"URU"`) |
| `flagUrl` | `team.crest` |
| `group` | **derived** — football-data's teams endpoint has no group; map each team id to the `group` of its matches (strip `"GROUP_"`). |

Note: football-data's `kickoff` is a true UTC instant, whereas the worldcup26 adapter parses `"MM/DD/YYYY HH:mm"` as *local* time. The two sources are never used simultaneously (fallback only when primary is down), so they won't produce mixed time bases within one snapshot.

## 3. Scheduled refresher — `worker/refresh.ts`

On each Cron tick, per dataset (games every tick; teams gated like the client does today — hourly or on unknown-team-id):

1. Try **primary** with a 25s `AbortController` timeout.
2. On non-2xx, network error, or timeout → try **fallback**.
3. If a source returns data, compute a change key: prefer the primary's `ETag` response header (observed: `ETag: W/"…"`); otherwise a hash of the normalized payload. Compare to the change key stored alongside the last KV record.
4. **Write KV only if the change key differs.** Store `{ data, source, fetchedAt, changeKey }`.
5. If both sources fail, write nothing — the prior KV record stands.

KV keys: `teams` and `games`. Per-minute cron that writes only on change keeps writes far under 1,000/day outside live-match windows.

## 4. Request handler — `worker/handler.ts`

- `GET /get/teams` / `GET /get/games`: read the KV record, return `data` as JSON with `Access-Control-Allow-Origin: https://worldcupdak.onrender.com`, a short `Cache-Control`, and an `X-Data-Source` / `X-Fetched-At` header for observability. Handle the CORS preflight `OPTIONS` with the same allowed origin.
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

## 8. Secrets & config

- `FOOTBALL_DATA_TOKEN` is set via `wrangler secret put FOOTBALL_DATA_TOKEN` — **never** committed to the repo, `wrangler.toml`, or any client code. The Worker reads it from `env`.
- The token currently in use was shared in plaintext during design; rotate it on football-data.org after the Worker is deployed and the secret is set.
- Non-secret config (KV namespace binding, cron schedule, allowed CORS origin) lives in `wrangler.toml`.

## Net effect

Cold visitors get an instant paint from a warm edge cache instead of a 12s–2min blank window; the dashboard survives worldcup26.ir being slow or down by failing over to the keyed source; the keyed source's secret stays server-side; and it all runs on free tiers with the frontend's Render hosting untouched.

## Unresolved questions

None. (Fallback source resolved: football-data.org, competition `WC`, schema mapped in §2. CORS locked to `https://worldcupdak.onrender.com` in §4. Token handled as a Worker secret per §8; rotate after deploy.)
