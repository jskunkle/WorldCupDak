import type { Team, Game } from "../../src/types";
import type { Source } from "./source";

const BASE = "https://api.football-data.org/v4/competitions/WC";

interface FdTeamRef {
  id: number;
  name: string;
}
interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  group: string | null;
  homeTeam: FdTeamRef;
  awayTeam: FdTeamRef;
  score: { fullTime: { home: number | null; away: number | null } };
}
interface FdMatchesResponse {
  matches: FdMatch[];
}
interface FdTeam {
  id: number;
  name: string;
  tla: string;
  crest: string;
}
interface FdTeamsResponse {
  teams: FdTeam[];
}

function stripGroup(g: string | null): string {
  return g ? g.replace(/^GROUP_/, "") : "";
}

export function normalizeFdGames(res: FdMatchesResponse): Game[] {
  return res.matches.map((m) => ({
    id: String(m.id),
    homeId: String(m.homeTeam.id),
    awayId: String(m.awayTeam.id),
    homeName: m.homeTeam.name,
    awayName: m.awayTeam.name,
    homeScore: m.score.fullTime.home ?? 0,
    awayScore: m.score.fullTime.away ?? 0,
    group: stripGroup(m.group),
    matchday: m.matchday ?? 0,
    kickoff: new Date(m.utcDate),
    finished: m.status === "FINISHED",
    isGroupStage: m.stage === "GROUP_STAGE",
  }));
}

export function normalizeFdTeams(
  teamsRes: FdTeamsResponse,
  matchesRes: FdMatchesResponse,
): Team[] {
  // football-data's teams endpoint has no group; derive it from matches.
  const groupByTeam = new Map<string, string>();
  for (const m of matchesRes.matches) {
    const g = stripGroup(m.group);
    if (!g) continue;
    groupByTeam.set(String(m.homeTeam.id), g);
    groupByTeam.set(String(m.awayTeam.id), g);
  }
  return teamsRes.teams.map((t) => ({
    id: String(t.id),
    name: t.name,
    code: t.tla,
    flagUrl: t.crest,
    group: groupByTeam.get(String(t.id)) ?? "",
  }));
}

export function createFootballDataSource(token: string): Source {
  return {
    name: "football-data.org",
    async fetchSnapshot() {
      const headers = { "X-Auth-Token": token };
      const [mRes, tRes] = await Promise.all([
        fetch(`${BASE}/matches`, { headers }),
        fetch(`${BASE}/teams`, { headers }),
      ]);
      if (!mRes.ok) throw new Error(`football-data matches ${mRes.status}`);
      if (!tRes.ok) throw new Error(`football-data teams ${tRes.status}`);
      const matches = (await mRes.json()) as FdMatchesResponse;
      const teams = (await tRes.json()) as FdTeamsResponse;
      return {
        games: normalizeFdGames(matches),
        teams: normalizeFdTeams(teams, matches),
      };
    },
  };
}
