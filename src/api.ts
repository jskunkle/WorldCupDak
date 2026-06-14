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
    homeScore: Number(g.home_score),
    awayScore: Number(g.away_score),
    group: g.group,
    matchday: Number(g.matchday),
    kickoff: parseKickoff(g.local_date),
    finished: g.finished === "TRUE",
    isGroupStage: g.type === "group",
  }));
}

export interface ApiData {
  teams: Team[];
  games: Game[];
}

// I/O wrapper. fetchImpl is injectable for tests.
export async function fetchData(
  fetchImpl: typeof fetch = fetch,
): Promise<ApiData> {
  const [teamsRes, gamesRes] = await Promise.all([
    fetchImpl(`${BASE_URL}/get/teams`),
    fetchImpl(`${BASE_URL}/get/games`),
  ]);
  if (!teamsRes.ok || !gamesRes.ok) {
    throw new Error(
      `API error: teams ${teamsRes.status}, games ${gamesRes.status}`,
    );
  }
  const teamsJson = (await teamsRes.json()) as { teams: RawTeam[] };
  const gamesJson = (await gamesRes.json()) as { games: RawGame[] };
  return {
    teams: normalizeTeams(teamsJson.teams),
    games: normalizeGames(gamesJson.games),
  };
}
