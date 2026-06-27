import type {
  Team,
  Game,
  Bracket,
  BracketMatch,
  BracketSlot,
  KnockoutRound,
} from "./types";
import { classify } from "./standings";

const ROUND_BY_MATCHDAY: Record<number, KnockoutRound> = {
  4: "r32",
  5: "r16",
  6: "qf",
  7: "sf",
  8: "third",
  9: "final",
};

export function roundOf(matchday: number): KnockoutRound | null {
  return ROUND_BY_MATCHDAY[matchday] ?? null;
}

function slot(
  id: string,
  name: string,
  score: number,
  byId: Map<string, Team>,
): BracketSlot {
  const team = byId.get(id);
  if (id === "0" || (!team && !name)) {
    return { tbd: true, name: "TBD", code: "", flagUrl: "", score: 0 };
  }
  if (team) {
    return {
      tbd: false,
      name: team.name,
      code: team.code,
      flagUrl: team.flagUrl,
      score,
    };
  }
  return { tbd: false, name, code: "", flagUrl: "", score };
}

function toMatch(
  g: Game,
  round: KnockoutRound,
  byId: Map<string, Team>,
  now: Date,
): BracketMatch {
  return {
    id: g.id,
    round,
    status: classify(g, now),
    kickoff: g.kickoff,
    home: slot(g.homeId, g.homeName, g.homeScore, byId),
    away: slot(g.awayId, g.awayName, g.awayScore, byId),
  };
}

function half(arr: BracketMatch[]): [BracketMatch[], BracketMatch[]] {
  const mid = Math.ceil(arr.length / 2);
  return [arr.slice(0, mid), arr.slice(mid)];
}

export function buildBracket(games: Game[], teams: Team[], now: Date): Bracket {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rounds: Record<KnockoutRound, BracketMatch[]> = {
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    final: [],
    third: [],
  };

  for (const g of games) {
    if (g.isGroupStage) continue;
    const round = roundOf(g.matchday);
    if (!round) continue;
    rounds[round].push(toMatch(g, round, byId, now));
  }
  for (const r of Object.keys(rounds) as KnockoutRound[]) {
    rounds[r].sort((a, b) => Number(a.id) - Number(b.id));
  }

  const [r32L, r32R] = half(rounds.r32);
  const [r16L, r16R] = half(rounds.r16);
  const [qfL, qfR] = half(rounds.qf);
  const [sfL, sfR] = half(rounds.sf);

  return {
    left: [r32L, r16L, qfL, sfL],
    right: [r32R, r16R, qfR, sfR],
    final: rounds.final[0] ?? null,
    third: rounds.third[0] ?? null,
    rounds,
  };
}
