import type { RawTeam, RawGame, Team, Game } from "./types";

const BASE_URL = "https://worldcup26.ir";

export function normalizeTeams(raw: RawTeam[]): Team[] {
  return raw.map((t) => ({
    id: t.id,
    name: t.name_en,
    code: t.fifa_code,
    flagUrl: t.flag,
    group: t.groups,
  }));
}

// Parses "MM/DD/YYYY HH:mm" as local time.
function parseKickoff(s: string): Date {
  const [datePart, timePart = "00:00"] = s.trim().split(" ");
  const [mm, dd, yyyy] = datePart.split("/").map(Number);
  const [hh, min] = timePart.split(":").map(Number);
  return new Date(yyyy, mm - 1, dd, hh, min);
}

export function normalizeGames(raw: RawGame[]): Game[] {
  return raw.map((g) => ({
    id: g.id,
    homeId: g.home_team_id,
    awayId: g.away_team_id,
    homeName: g.home_team_name_en,
    awayName: g.away_team_name_en,
    homeScore: Number(g.home_score) || 0,
    awayScore: Number(g.away_score) || 0,
    group: g.group,
    matchday: Number(g.matchday) || 0,
    kickoff: parseKickoff(g.local_date),
    finished: g.finished === "TRUE",
    isGroupStage: g.type === "group",
  }));
}

// I/O wrappers. fetchImpl is injectable for tests.
export async function fetchTeams(
  fetchImpl: typeof fetch = fetch,
): Promise<Team[]> {
  const res = await fetchImpl(`${BASE_URL}/get/teams`);
  if (!res.ok) throw new Error(`API error: teams ${res.status}`);
  const json = (await res.json()) as { teams: RawTeam[] };
  return normalizeTeams(json.teams);
}

export async function fetchGames(
  fetchImpl: typeof fetch = fetch,
): Promise<Game[]> {
  const res = await fetchImpl(`${BASE_URL}/get/games`);
  if (!res.ok) throw new Error(`API error: games ${res.status}`);
  const json = (await res.json()) as { games: RawGame[] };
  return normalizeGames(json.games);
}
