import type { Game } from "./types";

/**
 * True when the teams list should be re-fetched: nothing cached yet, the cache
 * has reached maxAgeMs, or a game references a team id we don't have cached.
 */
export function needsTeamsRefresh(
  cachedTeamIds: Set<string> | null,
  teamsFetchedAt: number | null,
  games: Game[],
  now: number,
  maxAgeMs: number,
): boolean {
  if (cachedTeamIds === null || teamsFetchedAt === null) return true;
  if (now - teamsFetchedAt >= maxAgeMs) return true;
  for (const g of games) {
    if (!cachedTeamIds.has(g.homeId) || !cachedTeamIds.has(g.awayId)) {
      return true;
    }
  }
  return false;
}
