import type {
  Team,
  Game,
  Bracket,
  BracketMatch,
  BracketSlot,
  KnockoutRound,
} from "./types";
import type { DashboardConfig } from "./config";
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

// Official FIFA World Cup 2026 knockout topology, keyed by the source's match
// ids (= FIFA match numbers). Each round lists its matches in bracket position
// order, top → bottom: the first half is the top side of the draw (feeding one
// finalist), the second half the bottom side. Adjacent pairs are the feeders of
// the next round (e.g. R32 74 & 77 → R16 89). This replaces the original
// assumption that ascending id order equals bracket order — it does not (match
// 74 sits above 77, but 73 sits below them). Verified against the official/ESPN
// bracket. Splitting each list at its midpoint yields the left/right halves.
type SplitRound = "r32" | "r16" | "qf" | "sf";
const BRACKET_ORDER: Record<SplitRound, string[]> = {
  // prettier-ignore
  r32: ["74","77","73","75","83","84","81","82","76","78","79","80","86","88","85","87"],
  r16: ["89", "90", "93", "94", "91", "92", "95", "96"],
  qf: ["97", "98", "99", "100"],
  sf: ["101", "102"],
};

// Position of a match in its round's bracket order. Unknown ids (e.g. a fallback
// source with a different id space) sort after the known ones, in ascending id
// order, so the layout degrades sanely instead of dropping or misplacing them.
function bracketPos(round: SplitRound, id: string): number {
  const order = BRACKET_ORDER[round];
  const i = order.indexOf(id);
  return i === -1 ? order.length + (Number(id) || 0) : i;
}

function orderForSide(
  round: SplitRound,
  matches: BracketMatch[],
): BracketMatch[] {
  return [...matches].sort(
    (a, b) => bracketPos(round, a.id) - bracketPos(round, b.id),
  );
}

export function selectView(
  games: Game[],
  now: Date,
  config: DashboardConfig,
): "standings" | "bracket" {
  if (config.view === "bracket" || config.view === "standings") {
    return config.view;
  }
  const groupGames = games.filter((g) => g.isGroupStage);
  const allGroupDone =
    groupGames.length > 0 && groupGames.every((g) => g.finished);

  // Only switch to the bracket once a knockout game maps to a real round.
  // Otherwise — e.g. a fallback source that omits round info, leaving every
  // knockout game at an unmapped matchday — the bracket would render empty.
  // This also scopes the kickoff safety-net below to renderable games.
  const knockoutMs = games
    .filter((g) => !g.isGroupStage && roundOf(g.matchday) !== null)
    .map((g) => g.kickoff.getTime());
  const hasRenderableKnockout = knockoutMs.length > 0;
  const earliest = hasRenderableKnockout ? Math.min(...knockoutMs) : null;
  const pastFirstKnockout = earliest !== null && now.getTime() > earliest;

  return hasRenderableKnockout && (allGroupDone || pastFirstKnockout)
    ? "bracket"
    : "standings";
}

// Final ahead of third so the focused view headlines the final when both pend.
const ACTIVE_ROUND_ORDER: KnockoutRound[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
  "third",
];

export function activeRound(bracket: Bracket): KnockoutRound {
  for (const r of ACTIVE_ROUND_ORDER) {
    const matches = bracket.rounds[r];
    if (matches.length && matches.some((m) => m.status !== "finished")) {
      return r;
    }
  }
  return "final";
}

// True when the bracket has at least one knockout match to draw. Used to avoid
// painting an empty bracket (e.g. a data source that dropped the knockout
// games), which would render as a lone trophy.
export function bracketHasMatches(bracket: Bracket): boolean {
  return (Object.keys(bracket.rounds) as KnockoutRound[]).some(
    (r) => bracket.rounds[r].length > 0,
  );
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

  // rounds[r] stays id-sorted (used by the focused view and progress rail); the
  // left/right columns are ordered by bracket position so connectors line up.
  const [r32L, r32R] = half(orderForSide("r32", rounds.r32));
  const [r16L, r16R] = half(orderForSide("r16", rounds.r16));
  const [qfL, qfR] = half(orderForSide("qf", rounds.qf));
  const [sfL, sfR] = half(orderForSide("sf", rounds.sf));

  return {
    left: [r32L, r16L, qfL, sfL],
    right: [r32R, r16R, qfR, sfR],
    final: rounds.final[0] ?? null,
    third: rounds.third[0] ?? null,
    rounds,
  };
}
