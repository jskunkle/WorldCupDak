import type { Team, Game } from "./types";

// Points at the Cloudflare Worker data layer. Set VITE_API_BASE in the Render
// build env to the deployed Worker URL; the fallback is for local dev.
const BASE_URL =
  import.meta.env.VITE_API_BASE ?? "https://worldcupdak-data.workers.dev";

function reviveGames(games: Game[]): Game[] {
  // The Worker sends kickoff as an ISO string; revive it to a Date.
  return games.map((g) => ({ ...g, kickoff: new Date(g.kickoff) }));
}

export async function fetchTeams(fetchImpl: typeof fetch = fetch): Promise<Team[]> {
  const res = await fetchImpl(`${BASE_URL}/get/teams`);
  if (!res.ok) throw new Error(`API error: teams ${res.status}`);
  return (await res.json()) as Team[];
}

export async function fetchGames(fetchImpl: typeof fetch = fetch): Promise<Game[]> {
  const res = await fetchImpl(`${BASE_URL}/get/games`);
  if (!res.ok) throw new Error(`API error: games ${res.status}`);
  return reviveGames((await res.json()) as Game[]);
}
