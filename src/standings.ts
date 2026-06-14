import type { Team, Game, GroupTable, StandingRow } from "./types";

interface Tally {
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
}

export function computeStandings(teams: Team[], games: Game[]): GroupTable[] {
  const tallies = new Map<string, Tally>();
  for (const t of teams) {
    tallies.set(t.id, { gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
  }

  for (const g of games) {
    if (!g.finished || !g.isGroupStage) continue;
    const home = tallies.get(g.homeId);
    const away = tallies.get(g.awayId);
    if (!home || !away) continue;
    home.gp++;
    away.gp++;
    home.gf += g.homeScore;
    home.ga += g.awayScore;
    away.gf += g.awayScore;
    away.ga += g.homeScore;
    if (g.homeScore > g.awayScore) {
      home.w++;
      away.l++;
    } else if (g.awayScore > g.homeScore) {
      away.w++;
      home.l++;
    } else {
      home.d++;
      away.d++;
    }
  }

  const byGroup = new Map<string, StandingRow[]>();
  for (const t of teams) {
    const a = tallies.get(t.id)!;
    const row: StandingRow = {
      rank: 0,
      teamId: t.id,
      code: t.code,
      name: t.name,
      flagUrl: t.flagUrl,
      gp: a.gp,
      w: a.w,
      d: a.d,
      l: a.l,
      gf: a.gf,
      ga: a.ga,
      gd: a.gf - a.ga,
      pts: a.w * 3 + a.d,
    };
    const list = byGroup.get(t.group) ?? [];
    list.push(row);
    byGroup.set(t.group, list);
  }

  return [...byGroup.keys()].sort().map((group) => {
    const rows = byGroup
      .get(group)!
      .sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
    rows.forEach((r, i) => (r.rank = i + 1));
    return { group, rows };
  });
}
