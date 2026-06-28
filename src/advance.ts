import type { Game } from "./types";

// A finished knockout game whose teams aren't decided yet carries a label like
// "Winner Match 73" / "Loser Match 101" on each slot, naming the match whose
// winner (or loser) fills it. We resolve those references client-side so a team
// advances the moment its match finishes — the data source itself never fills
// the next-round games (it leaves them at placeholder team id "0").

const MATCH_REF = /^(Winner|Loser) Match (\d+)$/;

interface Side {
  id: string;
  name: string;
}

function decided(g: Game): { winner: Side; loser: Side } | null {
  // No winner is derivable from a game that isn't finished or ended level — the
  // data carries no penalty-shootout result, so a draw stays unresolved.
  if (!g.finished || g.homeScore === g.awayScore) return null;
  const home: Side = { id: g.homeId, name: g.homeName };
  const away: Side = { id: g.awayId, name: g.awayName };
  return g.homeScore > g.awayScore
    ? { winner: home, loser: away }
    : { winner: away, loser: home };
}

function resolveLabel(
  label: string | undefined,
  byId: Map<string, Game>,
): Side | null {
  if (!label) return null;
  const m = MATCH_REF.exec(label);
  if (!m) return null;
  const ref = byId.get(m[2]);
  if (!ref) return null;
  const d = decided(ref);
  if (!d) return null;
  const side = m[1] === "Winner" ? d.winner : d.loser;
  // Guard against a resolved-but-still-placeholder team (would loop forever).
  return side.id === "0" ? null : side;
}

export function resolveAdvancement(games: Game[]): Game[] {
  const out = games.map((g) => ({ ...g }));
  const byId = new Map(out.map((g) => [g.id, g]));

  // Iterate to a fixpoint so a freshly resolved round can feed the next one.
  let changed = true;
  while (changed) {
    changed = false;
    for (const g of out) {
      if (g.isGroupStage) continue;
      if (g.homeId === "0") {
        const s = resolveLabel(g.homeLabel, byId);
        if (s) {
          g.homeId = s.id;
          g.homeName = s.name;
          changed = true;
        }
      }
      if (g.awayId === "0") {
        const s = resolveLabel(g.awayLabel, byId);
        if (s) {
          g.awayId = s.id;
          g.awayName = s.name;
          changed = true;
        }
      }
    }
  }
  return out;
}
