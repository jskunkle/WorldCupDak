# WorldCupDak

A self-hosted static dashboard showing live **FIFA World Cup 2026** group
standings (ESPN-style) and scores, designed to embed as an iframe on a
[DAKboard](https://dakboard.com) wall display.

- All 12 groups visible at once in a high-contrast grid (no rotation), auto-scaled to fill the screen — fully configurable via URL parameters (see below)
- A pinned strip of live / recently-finished scores
- Auto-refreshes every ~90s with no full-page reload
- Standings computed client-side from live match data
- Deployed as a static site (always-on, HTTPS, no server, no cold-start)

## Status

Implemented. Static site; deploy to Render (see below).

## Develop

```bash
pnpm install
pnpm dev              # local dev server
pnpm test             # unit tests (Vitest) — includes worker/**
pnpm e2e              # end-to-end smoke (Playwright)
pnpm build            # production build to dist/

pnpm worker:dev       # run the data Worker locally (wrangler dev)
pnpm worker:typecheck # type-check the Worker
pnpm worker:deploy    # deploy the Worker to Cloudflare
```

The client reads its API base from `VITE_API_BASE` (the deployed Worker URL); for
local dev it falls back to a default. Point it at `pnpm worker:dev` (default
`http://localhost:8787`) when developing against a local Worker.

## URL parameters

Append query parameters to the dashboard URL to customize it (works well as a DAKboard custom URL). All parameters are optional.

| Parameter      | Values                                                | Default    | Description                                                                                                                                          |
| -------------- | ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `groups`       | comma-separated `A`–`L`                               | all 12     | Which groups to show, e.g. `groups=A,B,C,D`                                                                                                          |
| `cols`         | integer                                               | auto (2)   | Number of grid columns                                                                                                                               |
| `rows`         | integer                                               | auto       | Number of grid rows                                                                                                                                  |
| `detail`       | `full` \| `compact`                                   | `full`     | `compact` shows only Rank, Flag, Team, GD, Pts                                                                                                       |
| `scores`       | `on` \| `off`                                         | `on`       | Show or hide the live score feed                                                                                                                     |
| `upcoming`     | integer                                               | `5`        | Max upcoming matches in the feed                                                                                                                     |
| `finished`     | integer                                               | `8`        | Max finished matches in the feed                                                                                                                     |
| `refresh`      | seconds                                               | `90`       | Data refresh interval (minimum 30)                                                                                                                   |
| `theme`        | `dark` \| `light`                                     | `dark`     | Color theme                                                                                                                                          |
| `highlight`    | comma-separated FIFA codes                            | none       | Emphasize specific teams, e.g. `highlight=USA,MEX,CAN`                                                                                               |
| `fit`          | `on` \| `off`                                         | `on`       | Auto-scale content to fill the screen with no scrolling                                                                                              |
| `view`         | `auto` \| `standings` \| `bracket`                    | `auto`     | `auto` shows group standings until every group match is finished (or the first knockout match has kicked off), then switches to the knockout bracket |
| `bracket`      | `full` \| `focused`                                   | `full`     | `full` renders the whole mirrored bracket; `focused` shows large cards for the current round and rotates pages every 10 seconds                      |
| `rotate`       | comma-separated `standings` \| `bracket` \| `focused` | none (off) | Cycle through these views on a timer, e.g. `rotate=standings,bracket`. Overrides `view` and shows each listed view regardless of tournament stage    |
| `rotateSecs`   | seconds                                               | `120`      | Interval between rotation steps (minimum 5)                                                                                                          |
| `bracketTimes` | `on` \| `off`                                         | `off`      | Show kickoff date + time under each match in the full bracket view, e.g. `Jul 4 · 14:00` (full bracket only)                                         |

### Examples

- Hosts' groups only, highlighted, compact: `?groups=B,D,F&highlight=USA,MEX,CAN&detail=compact`
- Light theme, no score feed, gentle refresh: `?theme=light&scores=off&refresh=300`
- A tall single-column layout on a portrait screen: `?groups=A,B,C,D&cols=1`

Invalid or unknown parameters are ignored and fall back to defaults — the dashboard never breaks on a bad URL.

## Deploy (Render Static Site)

1. Connect the GitHub repo to Render; it auto-detects `render.yaml`, or set
   build command `pnpm install && pnpm build` and publish directory `dist/`.
   Set the `VITE_API_BASE` env var to the deployed Worker URL (see the data
   layer section above) so the build points the client at the Worker.
2. Render serves the site over HTTPS — copy the public URL.
3. In DAKboard, add a **Website/iframe** block on a Custom Screen, paste the
   URL, and size it to a landscape region.

## Stack

TypeScript + Vite (no UI framework). Vitest for unit tests, Playwright for e2e.

## Data layer (Cloudflare Worker)

The dashboard does **not** call the data sources directly. A small Cloudflare
Worker (`worker/`) sits in front of them as a caching + failover layer, and the
client fetches normalized JSON from it (`/get/teams`, `/get/games`).

- **Primary source:** [worldcup26.ir](https://worldcup26.ir) (public, no token).
- **Fallback source:** [football-data.org](https://www.football-data.org) v4,
  competition `WC` (keyed — the token is a Worker secret, never in the client).
- A **Cron trigger** refreshes a full snapshot (teams + games from the _same_
  source, so team ids match) into Workers KV, writing only when the content
  changed (a content-hash gate keeps KV writes within the free tier).
- The `fetch` handler serves KV instantly with CORS locked to the Render origin,
  so a slow upstream never blanks the dashboard. Cold KV is populated inline on
  the first request. If every source is down and KV is empty it returns `503`,
  and the client's `localStorage` cache keeps the last paint up.

Standings are computed client-side because the upstream standings aggregation is
unreliable.

### Deploying the Worker

```bash
pnpm wrangler login
pnpm wrangler kv namespace create WCDAK_KV --config worker/wrangler.toml   # paste id into worker/wrangler.toml
pnpm wrangler secret put FOOTBALL_DATA_TOKEN --config worker/wrangler.toml # paste token
pnpm worker:deploy                                                         # note the deployed URL
```

Then set `VITE_API_BASE` to the deployed Worker URL in `render.yaml` (or the
Render dashboard) and redeploy the static site.

> Design notes: `docs/superpowers/specs/2026-06-16-data-proxy-worker-design.md`
> and `docs/superpowers/plans/2026-06-16-data-proxy-worker.md`.
