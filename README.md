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
pnpm dev        # local dev server
pnpm test       # unit tests (Vitest)
pnpm e2e        # end-to-end smoke (Playwright)
pnpm build      # production build to dist/
```

## URL parameters

Append query parameters to the dashboard URL to customize it (works well as a DAKboard custom URL). All parameters are optional.

| Parameter   | Values                     | Default  | Description                                             |
| ----------- | -------------------------- | -------- | ------------------------------------------------------- |
| `groups`    | comma-separated `A`–`L`    | all 12   | Which groups to show, e.g. `groups=A,B,C,D`             |
| `cols`      | integer                    | auto (2) | Number of grid columns                                  |
| `rows`      | integer                    | auto     | Number of grid rows                                     |
| `detail`    | `full` \| `compact`        | `full`   | `compact` shows only Rank, Flag, Team, GD, Pts          |
| `scores`    | `on` \| `off`              | `on`     | Show or hide the live score feed                        |
| `upcoming`  | integer                    | `5`      | Max upcoming matches in the feed                        |
| `finished`  | integer                    | `8`      | Max finished matches in the feed                        |
| `refresh`   | seconds                    | `90`     | Data refresh interval (minimum 30)                      |
| `theme`     | `dark` \| `light`          | `dark`   | Color theme                                             |
| `highlight` | comma-separated FIFA codes | none     | Emphasize specific teams, e.g. `highlight=USA,MEX,CAN`  |
| `fit`       | `on` \| `off`              | `on`     | Auto-scale content to fill the screen with no scrolling |

### Examples

- Hosts' groups only, highlighted, compact: `?groups=B,D,F&highlight=USA,MEX,CAN&detail=compact`
- Light theme, no score feed, gentle refresh: `?theme=light&scores=off&refresh=300`
- A tall single-column layout on a portrait screen: `?groups=A,B,C,D&cols=1`

Invalid or unknown parameters are ignored and fall back to defaults — the dashboard never breaks on a bad URL.

## Deploy (Render Static Site)

1. Connect the GitHub repo to Render; it auto-detects `render.yaml`, or set
   build command `pnpm install && pnpm build` and publish directory `dist/`.
2. Render serves the site over HTTPS — copy the public URL.
3. In DAKboard, add a **Website/iframe** block on a Custom Screen, paste the
   URL, and size it to a landscape region.

## Stack

TypeScript + Vite (no UI framework). Vitest for unit tests, Playwright for e2e.

## Data source

[worldcup26.ir](https://worldcup26.ir) — called directly from the browser
(public, CORS-open, no token). Standings are computed locally because the API's
own standings aggregation returns zeros.
