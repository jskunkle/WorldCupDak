# Venue-timezone kickoff fix — design

**Date:** 2026-07-01
**Status:** Approved, ready for planning
**Scope:** Bug fix only (no new URL parameter)

## Problem

Reddit users report bracket kickoff times displaying in the wrong timezone. A
user with a correctly-configured DAKboard (device on-time verified: powers on at
7 am / off at 10 pm EDT) sees England v DR Congo captioned **"Jul 1 · 8:00 AM"**
when the true kickoff is **noon EDT** — a uniform 4-hour lag across every match
box.

This is not a display/device problem and not a missing feature. It is a **data
bug in the Worker's `worldcup26` source adapter**.

## Root cause (verified against live source data)

`worldcup26.ir` publishes each game's `local_date` as the **venue's local
wall-clock time** (e.g. `"07/01/2026 12:00"` = noon at the stadium). Confirmed:

- Stadium 7 = Atlanta (Eastern); `local_date 12:00` = the noon-EDT ground truth.
- All three venue regions (Eastern/Central/Western) independently bottom out at
  exactly `12:00`, and Western venues show noon kickoffs (Seattle `06/19 12:00`).
  A single fixed publishing zone could not produce noon-local at every region —
  so `local_date` is genuinely venue-local.

`worker/sources/worldcup26.ts` parses it with:

```ts
function parseKickoff(s: string): Date {
  ...
  return new Date(yyyy, mm - 1, dd, hh, min); // interprets digits in RUNTIME tz
}
```

`new Date(y, m, d, h, min)` binds the wall-clock digits to **the runtime's
timezone**. The Worker runs on Cloudflare in **UTC**, so noon-in-Atlanta becomes
`12:00Z` instead of the true `16:00Z`. The client serializes/revives that
instant faithfully and the EDT display renders it as 8:00 AM. The venue's UTC
offset is silently discarded.

The coarse `region` field in the source's stadium data lumps US Central
(UTC−5 in summer) together with Mexico (UTC−6, no DST), so the fix must key on
the specific venue, not the region.

Insidious detail: on an EDT dev machine, `new Date(…,12,0)` yields the correct
instant for **Eastern** venues by coincidence, so the bug is invisible there for
those games. Non-Eastern venues expose it even locally.

## Fix

Interpret `local_date` in the venue's own IANA timezone, then store the true UTC
instant. Correctly-configured displays then render correct local time with no
URL parameter, and everything keyed off `kickoff` (live/upcoming classification,
feed sorting, knockout advancement) improves for free.

### New module — `worker/sources/stadium-timezones.ts`

Static map of the 16 stadium ids → IANA zones (ids/cities verified from
`worldcup26.ir/get/stadiums`):

| Zone | Stadium ids (city) |
| --- | --- |
| `America/New_York` | 7 Atlanta, 8 Miami, 9 Boston, 10 Philadelphia, 11 NY/NJ, 12 Toronto |
| `America/Chicago` | 4 Dallas, 5 Houston, 6 Kansas City |
| `America/Mexico_City` | 1 Mexico City, 2 Guadalajara |
| `America/Monterrey` | 3 Monterrey |
| `America/Los_Angeles` | 14 Seattle, 15 SF Bay Area, 16 Los Angeles |
| `America/Vancouver` | 13 Vancouver |

- `stadiumTimeZone(id: string): string` — returns the zone; falls back to
  `America/New_York` for an unknown id (all 16 venues are fixed for 2026, so the
  fallback should never fire in practice).
- `zonedWallTimeToUtc(y, mo, d, h, mi, tz): Date` — interprets the wall-clock
  components as occurring in `tz` and returns the true UTC instant. Reads the
  zone's offset at that instant via `Intl.DateTimeFormat(...).formatToParts`
  (Cloudflare Workers ship full ICU/tz data). One-pass offset lookup is exact
  for this tournament because no venue crosses a DST transition in the
  Jun 11 – Jul 19 2026 window (and Mexico observes no DST).

### Change — `worker/sources/worldcup26.ts`

- `parseKickoff(local_date: string, tz: string): Date` delegates to
  `zonedWallTimeToUtc` instead of `new Date(y, m, d, h, min)`.
- `normalizeGames` passes `stadiumTimeZone(g.stadium_id)`.

### Change — `src/types.ts`

- `RawGame` gains `stadium_id: string` (already present in the payload; not yet
  typed).

### Unaffected

- Fallback source `football-data.ts` uses `new Date(m.utcDate)` (already a true
  UTC instant) — confirmed correct, no change.
- Client render (`kickoffCaption`, `whenLabel`) already formats via
  `toLocaleString(undefined, …)`; correct once `kickoff` is the right instant —
  no client change.

## Testing (TDD — write first)

Unit tests in `worker/sources/`:

1. `zonedWallTimeToUtc` directly — a wall-clock time in a known zone maps to the
   expected UTC instant (Eastern, Central, Mexico, Pacific).
2. `normalizeGames` end-to-end per venue offset:
   - stadium 7 (Atlanta, EDT) `07/01/2026 12:00` → `2026-07-01T16:00:00.000Z`
   - stadium 4 (Dallas, CDT) `07/01/2026 12:00` → `2026-07-01T17:00:00.000Z`
   - stadium 1 (Mexico City, no DST) `07/01/2026 12:00` → `2026-07-01T18:00:00.000Z`
   - stadium 16 (LA, PDT) `07/01/2026 12:00` → `2026-07-01T19:00:00.000Z`

The Central/Western cases fail against the current code even on an EDT dev
machine, so they genuinely reproduce the bug. Assertions use `.toISOString()`
so they are machine-timezone-independent.

## Unresolved questions

None.
