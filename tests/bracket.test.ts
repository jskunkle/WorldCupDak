import { describe, it, expect } from "vitest";
import { roundOf, buildBracket } from "../src/bracket";
import type { Team, Game } from "../src/types";

function team(id: string, code: string): Team {
  return { id, code, name: code, flagUrl: `flag/${code}.png`, group: "A" };
}

function ko(
  id: string,
  matchday: number,
  homeId: string,
  awayId: string,
  opts: Partial<Game> = {},
): Game {
  return {
    id,
    homeId,
    awayId,
    homeName: homeId === "0" ? "" : homeId,
    awayName: awayId === "0" ? "" : awayId,
    homeScore: 0,
    awayScore: 0,
    group: "R32",
    matchday,
    kickoff: new Date(2026, 6, 1, 12, 0),
    finished: false,
    isGroupStage: false,
    ...opts,
  };
}

const now = new Date(2026, 6, 1, 18, 0);

describe("roundOf", () => {
  it("maps matchday to knockout round", () => {
    expect(roundOf(4)).toBe("r32");
    expect(roundOf(5)).toBe("r16");
    expect(roundOf(6)).toBe("qf");
    expect(roundOf(7)).toBe("sf");
    expect(roundOf(8)).toBe("third");
    expect(roundOf(9)).toBe("final");
  });

  it("returns null for group matchdays", () => {
    expect(roundOf(1)).toBeNull();
    expect(roundOf(3)).toBeNull();
  });
});

describe("buildBracket", () => {
  it("skips group-stage games", () => {
    const groupGame = ko("1", 1, "a", "b", { isGroupStage: true });
    const b = buildBracket([groupGame], [team("a", "AAA")], now);
    expect(b.rounds.r32).toHaveLength(0);
  });

  it("buckets knockout games by round and id-orders them", () => {
    const games = [
      ko("88", 4, "0", "0"),
      ko("73", 4, "a", "b"),
      ko("89", 5, "0", "0"),
    ];
    const b = buildBracket(games, [team("a", "AAA"), team("b", "BBB")], now);
    expect(b.rounds.r32.map((m) => m.id)).toEqual(["73", "88"]);
    expect(b.rounds.r16.map((m) => m.id)).toEqual(["89"]);
  });

  it("splits each round into left (first half) and right (second half)", () => {
    const games = [73, 74, 75, 76].map((n) => ko(String(n), 4, "0", "0"));
    const b = buildBracket(games, [], now);
    expect(b.left[0].map((m) => m.id)).toEqual(["73", "74"]);
    expect(b.right[0].map((m) => m.id)).toEqual(["75", "76"]);
  });

  it("joins real teams to flags and marks id '0' as TBD", () => {
    const game = ko("73", 4, "a", "0", {
      homeScore: 2,
      awayScore: 1,
      finished: true,
    });
    const b = buildBracket([game], [team("a", "AAA")], now);
    const m = b.rounds.r32[0];
    expect(m.home).toMatchObject({
      tbd: false,
      name: "AAA",
      code: "AAA",
      flagUrl: "flag/AAA.png",
      score: 2,
    });
    expect(m.away).toMatchObject({ tbd: true, name: "TBD" });
  });

  it("classifies status from finished/kickoff", () => {
    const finished = ko("73", 4, "a", "b", { finished: true });
    const live = ko("74", 4, "a", "b", {
      kickoff: new Date(2026, 6, 1, 17, 0),
    });
    const upcoming = ko("75", 4, "a", "b", {
      kickoff: new Date(2026, 6, 1, 20, 0),
    });
    const b = buildBracket([finished, live, upcoming], [], now);
    expect(b.rounds.r32.map((m) => m.status)).toEqual([
      "finished",
      "live",
      "upcoming",
    ]);
  });

  it("exposes the final and third-place games", () => {
    const games = [ko("104", 9, "0", "0"), ko("103", 8, "0", "0")];
    const b = buildBracket(games, [], now);
    expect(b.final?.id).toBe("104");
    expect(b.third?.id).toBe("103");
  });
});
