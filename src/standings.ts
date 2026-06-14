import type {
  Team,
  Game,
  GroupTable,
  StandingRow,
  FeedMatch,
  FeedKind,
} from "./types";

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

const MAX_UPCOMING = 5;
const MAX_FINISHED = 8;

function classify(g: Game, now: Date): FeedKind {
  if (g.finished) return "finished";
  return g.kickoff <= now ? "live" : "upcoming";
}

function toFeedMatch(g: Game, kind: FeedKind): FeedMatch {
  return {
    id: g.id,
    kind,
    homeName: g.homeName,
    awayName: g.awayName,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    kickoff: g.kickoff,
  };
}

export function filterGroups(
  tables: GroupTable[],
  letters: string[] | null,
): GroupTable[] {
  if (!letters || letters.length === 0) return tables;
  const want = new Set(letters);
  return tables.filter((t) => want.has(t.group));
}

export function buildScoreFeed(
  games: Game[],
  now: Date,
  limits: { maxFinished?: number; maxUpcoming?: number } = {},
): FeedMatch[] {
  const maxFinished = limits.maxFinished ?? MAX_FINISHED;
  const maxUpcoming = limits.maxUpcoming ?? MAX_UPCOMING;
  const live: FeedMatch[] = [];
  const finished: FeedMatch[] = [];
  const upcoming: FeedMatch[] = [];

  for (const g of games) {
    const kind = classify(g, now);
    if (kind === "live") live.push(toFeedMatch(g, kind));
    else if (kind === "finished") finished.push(toFeedMatch(g, kind));
    else upcoming.push(toFeedMatch(g, kind));
  }

  live.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  finished.sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime()); // most recent first
  upcoming.sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());

  return [
    ...live,
    ...finished.slice(0, maxFinished),
    ...upcoming.slice(0, maxUpcoming),
  ];
}
