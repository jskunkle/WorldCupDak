import type { RawTeam, RawGame, Team, Game } from "../../src/types";
import type { Source } from "./source";

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
    homeLabel: g.home_team_label,
    awayLabel: g.away_team_label,
  }));
}

export const worldcup26Source: Source = {
  name: "worldcup26.ir",
  async fetchSnapshot() {
    const [tRes, gRes] = await Promise.all([
      fetch(`${BASE_URL}/get/teams`),
      fetch(`${BASE_URL}/get/games`),
    ]);
    if (!tRes.ok) throw new Error(`worldcup26 teams ${tRes.status}`);
    if (!gRes.ok) throw new Error(`worldcup26 games ${gRes.status}`);
    const tJson = (await tRes.json()) as { teams: RawTeam[] };
    const gJson = (await gRes.json()) as { games: RawGame[] };
    return {
      teams: normalizeTeams(tJson.teams),
      games: normalizeGames(gJson.games),
    };
  },
};
