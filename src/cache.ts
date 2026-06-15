import type { Team, Game } from "./types";

const CACHE_KEY = "wcdak:cache:v1";

interface CachedPayload {
  teams: Team[];
  games: Game[];
  fetchedAt: number;
}

/**
 * Best-effort persist of the last successful fetch. No-ops on any storage
 * error (blocked/partitioned iframe, quota, serialization).
 */
export function writeCache(teams: Team[], games: Game[], now: number): void {
  try {
    const payload: CachedPayload = { teams, games, fetchedAt: now };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable — caching is best-effort only.
  }
}

/**
 * Returns the cached teams/games if present and younger than maxAgeMs, with
 * each game's kickoff revived from its serialized string into a Date.
 * Returns null when absent, stale, or storage is unavailable/unparseable.
 */
export function readCache(
  maxAgeMs: number,
  now: number,
): { teams: Team[]; games: Game[] } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw === null) return null;
    const payload = JSON.parse(raw) as CachedPayload;
    if (
      typeof payload.fetchedAt !== "number" ||
      now - payload.fetchedAt >= maxAgeMs
    ) {
      return null;
    }
    const games = payload.games.map((g) => ({
      ...g,
      kickoff: new Date(g.kickoff),
    }));
    return { teams: payload.teams, games };
  } catch {
    return null;
  }
}
